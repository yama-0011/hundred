import page from './page.html';
import { validateMaster, validateDeck } from './validation.js';
const json = (body, status = 200) => Response.json(body, {status, headers:{'Cache-Control':'no-store'}});
async function release(env, version) {
  const row = await env.DB.prepare('SELECT content_json, sha256 FROM master_releases WHERE version = ?').bind(version).first();
  if (!row) throw new Error('master_not_found');
  return { row, master: validateMaster(JSON.parse(row.content_json)) };
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // This editor has no player authentication and must remain local-only.
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return json({error:'local_poc_only'}, 403);
    if (request.headers.get('Origin') && request.headers.get('Origin') !== url.origin) return json({error:'origin_not_allowed'}, 403);
    try {
      if (request.method === 'GET' && url.pathname === '/') return new Response(page, {headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
      if (request.method === 'GET' && url.pathname === '/api/master') {
        const {master} = await release(env, env.MASTER_VERSION);
        return json(master);
      }
      if (request.method === 'GET' && url.pathname === '/api/decks') {
        const result = await env.DB.prepare('SELECT deck_id AS deckId, name, master_version AS masterVersion, cards_json AS cardsJson FROM decks ORDER BY created_at DESC, deck_id').all();
        return json({decks:result.results.map(d => ({deckId:d.deckId,name:d.name,masterVersion:d.masterVersion,cards:JSON.parse(d.cardsJson)}))});
      }
      if (request.method === 'POST' && url.pathname === '/api/decks') {
        if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) return json({error:'json_required'}, 415);
        const text = await request.text();
        if (text.length > 20000) return json({error:'request_too_large'}, 413);
        const input = JSON.parse(text);
        if (!input || typeof input.masterVersion !== 'string' || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80) return json({error:'invalid_deck_name'}, 400);
        const {master} = await release(env, input.masterVersion);
        const cards = validateDeck(input.cards, master);
        const deckId = crypto.randomUUID();
        await env.DB.prepare('INSERT INTO decks (deck_id, name, master_version, cards_json) VALUES (?, ?, ?, ?)')
          .bind(deckId, input.name.trim(), master.masterVersion, JSON.stringify(cards)).run();
        return json({deckId, name:input.name.trim(), masterVersion:master.masterVersion, cards}, 201);
      }
      const match = url.pathname.match(/^\/internal\/decks\/([A-Za-z0-9_-]{1,80})$/);
      if (request.method === 'GET' && match) {
        if (!env.BATTLE_SHARED_KEY || request.headers.get('Authorization') !== 'Bearer ' + env.BATTLE_SHARED_KEY) return json({error:'unauthorized'}, 401);
        const d = await env.DB.prepare('SELECT deck_id, name, master_version, cards_json FROM decks WHERE deck_id = ?').bind(match[1]).first();
        if (!d) return json({error:'deck_not_found'}, 404);
        const {row, master} = await release(env, d.master_version);
        const cards = validateDeck(JSON.parse(d.cards_json), master);
        // Return the exact published bytes as a JSON string; the battle server hashes these.
        return json({deck:{deckId:d.deck_id,name:d.name,masterVersion:d.master_version,cards},masterJson:row.content_json,masterSha256:row.sha256});
      }
      return json({error:'not_found'}, 404);
    } catch (error) {
      console.error('Card home request failed:', error.message);
      const known = ['master_not_found','invalid_deck','invalid_deck_entry','unknown_card','same_name_limit','deck_must_have_40_cards'];
      if (known.includes(error.message)) return json({error:error.message}, 400);
      if (error instanceof SyntaxError) return json({error:'invalid_json'}, 400);
      return json({error:'home_data_error'}, 500);
    }
  }
};
