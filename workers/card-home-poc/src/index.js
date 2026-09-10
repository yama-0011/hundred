import page from './page.html';
import homePage from './home.html';
import frameRedSpirit from './assets/frame-red-spirit.png';
import frameBlueSpirit from './assets/frame-blue-spirit.png';
import frameGreenSpirit from './assets/frame-green-spirit.png';
import framePurpleSpirit from './assets/frame-purple-spirit.png';
import frameWhiteSpirit from './assets/frame-white-spirit.png';
import frameYellowSpirit from './assets/frame-yellow-spirit.png';
import detailAreaSpirit from './assets/detail-area-spirit.png';
import levelBadge1 from './assets/level-badge-1.png';
import levelBadge2 from './assets/level-badge-2.png';
import levelBadge3 from './assets/level-badge-3.png';
import symbolRed from './assets/symbol-red.png';
import symbolBlue from './assets/symbol-blue.png';
import symbolGreen from './assets/symbol-green.png';
import symbolPurple from './assets/symbol-purple.png';
import symbolWhite from './assets/symbol-white.png';
import symbolYellow from './assets/symbol-yellow.png';
import typeSpirit from './assets/type-spirit.png';
import { validateMaster, validateDeck } from './validation.js';
const json = (body, status = 200) => Response.json(body, {status, headers:{'Cache-Control':'no-store'}});
function validateLevels(value){
  if(!Array.isArray(value)||value.length<1||value.length>3)return null;
  const levels=value.map(row=>({level:Number(row.level),requiredCores:Number(row.requiredCores),bp:Number(row.bp)}));
  if(levels[0]?.level!==1||new Set(levels.map(row=>row.level)).size!==levels.length||levels.some(row=>!Number.isInteger(row.level)||row.level<1||row.level>3||!Number.isInteger(row.requiredCores)||row.requiredCores<0||row.requiredCores>99||!Number.isInteger(row.bp)||row.bp<0||row.bp>999999))return null;
  return levels;
}
async function release(env, version) {
  const row = await env.DB.prepare('SELECT content_json, sha256 FROM master_releases WHERE version = ?').bind(version).first();
  if (!row) throw new Error('master_not_found');
  return { row, master: validateMaster(JSON.parse(row.content_json)) };
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Public preview access is opt-in: a battle URL must be supplied at startup.
    const publicPreview = url.hostname.endsWith('.trycloudflare.com') && /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(env.BATTLE_PUBLIC_URL || '');
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) && !publicPreview) return json({error:'local_poc_only'}, 403);
    if (request.headers.get('Origin') && request.headers.get('Origin') !== url.origin) return json({error:'origin_not_allowed'}, 403);
    try {
      if (request.method === 'GET' && url.pathname === '/') return new Response(homePage, {headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
      const templateAssets = {
        '/template-assets/spirit/frame-red.png': frameRedSpirit,
        '/template-assets/spirit/frame-blue.png': frameBlueSpirit,
        '/template-assets/spirit/frame-green.png': frameGreenSpirit,
        '/template-assets/spirit/frame-purple.png': framePurpleSpirit,
        '/template-assets/spirit/frame-white.png': frameWhiteSpirit,
        '/template-assets/spirit/frame-yellow.png': frameYellowSpirit,
        '/template-assets/symbols/red.png': symbolRed,
        '/template-assets/symbols/blue.png': symbolBlue,
        '/template-assets/symbols/green.png': symbolGreen,
        '/template-assets/symbols/purple.png': symbolPurple,
        '/template-assets/symbols/white.png': symbolWhite,
        '/template-assets/symbols/yellow.png': symbolYellow,
        '/template-assets/red-spirit/frame.png': frameRedSpirit,
        '/template-assets/red-spirit/detail.png': detailAreaSpirit,
        '/template-assets/red-spirit/level-1.png': levelBadge1,
        '/template-assets/red-spirit/level-2.png': levelBadge2,
        '/template-assets/red-spirit/level-3.png': levelBadge3,
        '/template-assets/red-spirit/symbol.png': symbolRed,
        '/template-assets/red-spirit/type-spirit.png': typeSpirit
      };
      if (request.method === 'GET' && templateAssets[url.pathname]) return new Response(templateAssets[url.pathname], {headers:{'Content-Type':'image/png','Cache-Control':'public,max-age=3600'}});
      if (request.method === 'GET' && url.pathname === '/decks') return Response.redirect(url.origin + '/?section=decks', 302);
      if (request.method === 'GET' && url.pathname === '/api/card-sets') {
        const {master}=await release(env,env.MASTER_VERSION);
        const [result,drafts]=await Promise.all([
          env.DB.prepare('SELECT set_id AS setId,name,release_date AS releaseDate,sort_order AS sortOrder FROM card_sets ORDER BY sort_order DESC').all(),
          env.DB.prepare('SELECT card_id AS cardId,set_id AS setId FROM card_metadata_drafts WHERE master_version=?').bind(env.MASTER_VERSION).all()
        ]);
        const assigned=new Map(drafts.results.map(draft=>[draft.cardId,draft.setId]));
        const latest=result.results.reduce((max,set)=>Math.max(max,set.sortOrder),-1);
        return json({sets:result.results.map(set=>({...set,isLatest:set.sortOrder===latest,cardCount:master.cards.filter(card=>(assigned.get(card.cardId)||card.cardId.split('-')[0])===set.setId).length}))});
      }
      if (request.method === 'POST' && url.pathname === '/api/card-sets') {
        if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) return json({error:'json_required'},415);
        const input=JSON.parse(await request.text());
        const setId=typeof input.setId==='string'?input.setId.trim().toUpperCase():'';
        const name=typeof input.name==='string'?input.name.trim():'';
        const releaseDate=input.releaseDate==null||input.releaseDate===''?null:input.releaseDate;
        const sortOrder=Number(input.sortOrder);
        if(!/^[A-Z0-9-]{2,20}$/.test(setId)||!name||name.length>80||!Number.isInteger(sortOrder)||sortOrder<1||sortOrder>9999||(releaseDate!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)))return json({error:'invalid_card_set'},400);
        await env.DB.prepare('INSERT INTO card_sets(set_id,name,release_date,sort_order) VALUES(?,?,?,?)').bind(setId,name,releaseDate,sortOrder).run();
        return json({setId,name,releaseDate,sortOrder},201);
      }
      if (request.method === 'GET' && url.pathname === '/api/card-visuals') {
        const result = await env.DB.prepare('SELECT card_id AS cardId, object_key AS objectKey, image_version AS imageVersion, position_x AS positionX, position_y AS positionY, scale, template_id AS templateId, updated_at AS updatedAt FROM card_visual_drafts WHERE master_version = ? ORDER BY card_id').bind(env.MASTER_VERSION).all();
        return json({visuals:result.results});
      }
      if (request.method === 'GET' && url.pathname === '/api/card-metadata') {
        const [result,archives,relations,levels,reductions]=await Promise.all([
          env.DB.prepare('SELECT card_id AS cardId,set_id AS setId,name,card_type AS cardType,color,rarity,tribe,cost,status,updated_at AS updatedAt FROM card_metadata_drafts WHERE master_version=? ORDER BY card_id').bind(env.MASTER_VERSION).all(),
          env.DB.prepare('SELECT card_id AS cardId,archived_at AS archivedAt FROM card_archives ORDER BY archived_at DESC').all(),
          env.DB.prepare('SELECT card_id AS cardId,tribe_id AS tribeId,position FROM card_tribes ORDER BY card_id,position').all(),
          env.DB.prepare('SELECT card_id AS cardId,level,required_cores AS requiredCores,bp FROM card_levels ORDER BY card_id,level').all(),
          env.DB.prepare('SELECT card_id AS cardId,color,count FROM card_reductions ORDER BY card_id').all()
        ]);
        return json({metadata:result.results.map(card=>({...card,tribeIds:relations.results.filter(row=>row.cardId===card.cardId).map(row=>row.tribeId),levels:levels.results.filter(row=>row.cardId===card.cardId).map(({level,requiredCores,bp})=>({level,requiredCores,bp})),reductions:reductions.results.filter(row=>row.cardId===card.cardId).map(({color,count})=>({color,count}))})),archives:archives.results});
      }
      if(request.method==='GET'&&url.pathname==='/api/tribes'){
        const result=await env.DB.prepare('SELECT tribe_id AS tribeId,name,reading,description,sort_order AS sortOrder,is_active AS isActive,updated_at AS updatedAt FROM tribes ORDER BY sort_order,name').all();
        return json({tribes:result.results});
      }
      const tribeMatch=url.pathname.match(/^\/api\/tribes\/(TRB-[0-9]{4})$/);
      if(request.method==='PATCH'&&tribeMatch){
        if(!(request.headers.get('Content-Type')||'').startsWith('application/json'))return json({error:'json_required'},415);
        const input=JSON.parse(await request.text()),name=typeof input.name==='string'?input.name.trim():'',reading=typeof input.reading==='string'?input.reading.trim():'',description=typeof input.description==='string'?input.description.trim():'';
        if(!name||name.length>80||reading.length>120||description.length>2000||typeof input.isActive!=='boolean')return json({error:'invalid_tribe'},400);
        const result=await env.DB.prepare('UPDATE tribes SET name=?,reading=?,description=?,is_active=?,updated_at=CURRENT_TIMESTAMP WHERE tribe_id=?').bind(name,reading,description||null,input.isActive?1:0,tribeMatch[1]).run();
        if(!result.meta.changes)return json({error:'tribe_not_found'},404);
        return json({tribeId:tribeMatch[1],name,reading,description,isActive:input.isActive});
      }
      const archiveMatch=url.pathname.match(/^\/api\/cards\/(BS[0-9A-Z-]{3,24})$/);
      if(request.method==='POST'&&url.pathname==='/api/cards'){
        if(!(request.headers.get('Content-Type')||'').startsWith('application/json'))return json({error:'json_required'},415);
        const input=JSON.parse(await request.text()),cardId=typeof input.cardId==='string'?input.cardId.trim().toUpperCase():'';
        const setId=typeof input.setId==='string'?input.setId.trim().toUpperCase():'',name=typeof input.name==='string'?input.name.trim():'',tribeIds=Array.isArray(input.tribeIds)?[...new Set(input.tribeIds)]:[];
        const cardType=input.cardType,color=input.color,rarity=input.rarity,status=input.status||'EDITING',cost=Number(input.cost),levels=validateLevels(input.levels),reductionCount=Number(input.reductionCount);
        const cardNumber=cardId.startsWith(setId+'-')?cardId.slice(setId.length+1):'';
        if(!levels||!Number.isInteger(reductionCount)||reductionCount<0||reductionCount>6||!/^[0-9]{3}$/.test(cardNumber)||cardNumber==='000'||!/^[A-Z0-9-]{2,20}$/.test(setId)||!name||name.length>100||tribeIds.length>3||tribeIds.some(id=>!/^TRB-[0-9]{4}$/.test(id))||!['SPIRIT','NEXUS','MAGIC'].includes(cardType)||!['RED','PURPLE','GREEN','WHITE','YELLOW','BLUE'].includes(color)||!['C','R','X'].includes(rarity)||!['UNSET','EDITING','LOCKED','COMPLETE'].includes(status)||!Number.isInteger(cost)||cost<0||cost>12)return json({error:'invalid_card_metadata'},400);
        const {master}=await release(env,env.MASTER_VERSION);
        const [existing,set]=await Promise.all([env.DB.prepare('SELECT card_id FROM card_metadata_drafts WHERE card_id=?').bind(cardId).first(),env.DB.prepare('SELECT set_id FROM card_sets WHERE set_id=?').bind(setId).first()]);
        if(master.cards.some(card=>card.cardId===cardId)||existing)return json({error:'card_already_exists'},409);
        if(!set)return json({error:'unknown_card_set'},400);
        const selected=tribeIds.length?(await env.DB.prepare(`SELECT tribe_id AS tribeId,name FROM tribes WHERE is_active=1 AND tribe_id IN (${tribeIds.map(()=>'?').join(',')})`).bind(...tribeIds).all()).results:[];
        if(selected.length!==tribeIds.length)return json({error:'unknown_tribe'},400);const tribe=tribeIds.map(id=>selected.find(t=>t.tribeId===id).name).join('・');
        await env.DB.batch([env.DB.prepare('INSERT INTO card_metadata_drafts(card_id,master_version,set_id,name,english_name,card_type,color,rarity,tribe,cost,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(cardId,env.MASTER_VERSION,setId,name,'',cardType,color,rarity,tribe,cost,status),env.DB.prepare('INSERT INTO card_reductions(card_id,color,count) VALUES(?,?,?)').bind(cardId,color,reductionCount),...tribeIds.map((id,i)=>env.DB.prepare('INSERT INTO card_tribes(card_id,tribe_id,position) VALUES(?,?,?)').bind(cardId,id,i+1)),...levels.map(row=>env.DB.prepare('INSERT INTO card_levels(card_id,level,required_cores,bp) VALUES(?,?,?,?)').bind(cardId,row.level,row.requiredCores,row.bp))]);
        return json({cardId,setId,name,cardType,color,rarity,tribe,tribeIds,cost,status,levels,reductions:[{color,count:reductionCount}],isNew:true},201);
      }
      if(request.method==='DELETE'&&archiveMatch){
        const {master}=await release(env,env.MASTER_VERSION);
        const draft=await env.DB.prepare('SELECT card_id FROM card_metadata_drafts WHERE card_id=? AND master_version=?').bind(archiveMatch[1],env.MASTER_VERSION).first();
        if(!draft&&!master.cards.some(card=>card.cardId===archiveMatch[1]))return json({error:'unknown_card'},404);
        await env.DB.prepare('INSERT INTO card_archives(card_id) VALUES(?) ON CONFLICT(card_id) DO UPDATE SET archived_at=CURRENT_TIMESTAMP').bind(archiveMatch[1]).run();
        return json({cardId:archiveMatch[1],archived:true});
      }
      if(request.method==='POST'&&archiveMatch&&url.searchParams.get('action')==='restore'){
        await env.DB.prepare('DELETE FROM card_archives WHERE card_id=?').bind(archiveMatch[1]).run();
        return json({cardId:archiveMatch[1],archived:false});
      }
      const metadataMatch=url.pathname.match(/^\/api\/cards\/(BS[0-9A-Z-]{3,24})\/metadata$/);
      if(request.method==='PATCH'&&metadataMatch){
        if(!(request.headers.get('Content-Type')||'').startsWith('application/json'))return json({error:'json_required'},415);
        const input=JSON.parse(await request.text()),{master}=await release(env,env.MASTER_VERSION);
        const source=master.cards.find(card=>card.cardId===metadataMatch[1]);
        const existingDraft=await env.DB.prepare('SELECT card_id FROM card_metadata_drafts WHERE card_id=? AND master_version=?').bind(metadataMatch[1],env.MASTER_VERSION).first();
        if(!source&&!existingDraft)return json({error:'unknown_card'},404);
        const setId=typeof input.setId==='string'?input.setId.trim().toUpperCase():'',name=typeof input.name==='string'?input.name.trim():'',tribeIds=Array.isArray(input.tribeIds)?[...new Set(input.tribeIds)]:[];
        const cardType=input.cardType,color=input.color,rarity=input.rarity,status=input.status,cost=Number(input.cost),levels=validateLevels(input.levels),reductionCount=Number(input.reductionCount);
        if(setId!==metadataMatch[1].split('-')[0]||!levels||!Number.isInteger(reductionCount)||reductionCount<0||reductionCount>6||!/^[A-Z0-9-]{2,20}$/.test(setId)||!name||name.length>100||tribeIds.length>3||tribeIds.some(id=>!/^TRB-[0-9]{4}$/.test(id))||!['SPIRIT','NEXUS','MAGIC'].includes(cardType)||!['RED','PURPLE','GREEN','WHITE','YELLOW','BLUE'].includes(color)||!['C','R','X'].includes(rarity)||!['UNSET','EDITING','LOCKED','COMPLETE'].includes(status)||!Number.isInteger(cost)||cost<0||cost>12)return json({error:'invalid_card_metadata'},400);
        const cardSet=await env.DB.prepare('SELECT set_id FROM card_sets WHERE set_id=?').bind(setId).first();
        if(!cardSet)return json({error:'unknown_card_set'},400);
        const selected=tribeIds.length?(await env.DB.prepare(`SELECT tribe_id AS tribeId,name FROM tribes WHERE is_active=1 AND tribe_id IN (${tribeIds.map(()=>'?').join(',')})`).bind(...tribeIds).all()).results:[];
        if(selected.length!==tribeIds.length)return json({error:'unknown_tribe'},400);const tribe=tribeIds.map(id=>selected.find(t=>t.tribeId===id).name).join('・');
        await env.DB.batch([env.DB.prepare(`INSERT INTO card_metadata_drafts(card_id,master_version,set_id,name,english_name,card_type,color,rarity,tribe,cost,status) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(card_id) DO UPDATE SET master_version=excluded.master_version,set_id=excluded.set_id,name=excluded.name,english_name='',card_type=excluded.card_type,color=excluded.color,rarity=excluded.rarity,tribe=excluded.tribe,cost=excluded.cost,status=excluded.status,updated_at=CURRENT_TIMESTAMP`).bind(metadataMatch[1],env.MASTER_VERSION,setId,name,'',cardType,color,rarity,tribe,cost,status),env.DB.prepare('DELETE FROM card_tribes WHERE card_id=?').bind(metadataMatch[1]),env.DB.prepare('DELETE FROM card_levels WHERE card_id=?').bind(metadataMatch[1]),env.DB.prepare('INSERT INTO card_reductions(card_id,color,count) VALUES(?,?,?) ON CONFLICT(card_id) DO UPDATE SET color=excluded.color,count=excluded.count').bind(metadataMatch[1],color,reductionCount),...tribeIds.map((id,i)=>env.DB.prepare('INSERT INTO card_tribes(card_id,tribe_id,position) VALUES(?,?,?)').bind(metadataMatch[1],id,i+1)),...levels.map(row=>env.DB.prepare('INSERT INTO card_levels(card_id,level,required_cores,bp) VALUES(?,?,?,?)').bind(metadataMatch[1],row.level,row.requiredCores,row.bp))]);
        return json({cardId:metadataMatch[1],setId,name,cardType,color,rarity,tribe,tribeIds,cost,status,levels,reductions:[{color,count:reductionCount}]});
      }
      const artMatch = url.pathname.match(/^\/api\/cards\/(BS[0-9A-Z-]{3,24})\/illustration$/);
      if (request.method === 'PUT' && artMatch) {
        const type=(request.headers.get('Content-Type') || '').split(';',1)[0];
        const extensions={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
        if (!extensions[type]) return json({error:'unsupported_image'},415);
        const bytes=await request.arrayBuffer();
        if (!bytes.byteLength || bytes.byteLength > 8 * 1024 * 1024) return json({error:'invalid_image_size'},413);
        const {master}=await release(env,env.MASTER_VERSION);
        const draft=await env.DB.prepare('SELECT card_id FROM card_metadata_drafts WHERE card_id=? AND master_version=?').bind(artMatch[1],env.MASTER_VERSION).first();
        if (!draft&&!master.cards.some(card => card.cardId === artMatch[1])) return json({error:'unknown_card'},404);
        const current=await env.DB.prepare('SELECT image_version FROM card_visual_drafts WHERE card_id = ?').bind(artMatch[1]).first();
        const version=(current?.image_version || 0)+1;
        const objectKey=`illustrations/${artMatch[1]}/v${version}.${extensions[type]}`;
        await env.CARD_ART.put(objectKey,bytes,{httpMetadata:{contentType:type,cacheControl:'public,max-age=31536000,immutable'}});
        await env.DB.prepare(`INSERT INTO card_visual_drafts (card_id,master_version,object_key,image_version) VALUES (?,?,?,?) ON CONFLICT(card_id) DO UPDATE SET master_version=excluded.master_version,object_key=excluded.object_key,image_version=excluded.image_version,updated_at=CURRENT_TIMESTAMP`).bind(artMatch[1],env.MASTER_VERSION,objectKey,version).run();
        return json({cardId:artMatch[1],objectKey,imageVersion:version});
      }
      const visualMatch = url.pathname.match(/^\/api\/cards\/(BS[0-9A-Z-]{3,24})\/visual$/);
      if (request.method === 'PATCH' && visualMatch) {
        if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) return json({error:'json_required'},415);
        const input=JSON.parse(await request.text());
        const positionX=Number(input.positionX),positionY=Number(input.positionY),scale=Number(input.scale);
        if (![positionX,positionY,scale].every(Number.isFinite) || positionX<0 || positionX>1 || positionY<0 || positionY>1 || scale<0.5 || scale>3) return json({error:'invalid_visual'},400);
        const result=await env.DB.prepare('UPDATE card_visual_drafts SET position_x=?,position_y=?,scale=?,template_id=?,updated_at=CURRENT_TIMESTAMP WHERE card_id=? AND master_version=?').bind(positionX,positionY,scale,typeof input.templateId==='string'?input.templateId:'red-spirit-v1',visualMatch[1],env.MASTER_VERSION).run();
        if (!result.meta.changes) return json({error:'illustration_required'},409);
        return json({cardId:visualMatch[1],positionX,positionY,scale});
      }
      const objectMatch=url.pathname.match(/^\/card-art\/(illustrations\/[A-Za-z0-9_-]+\/v[1-9][0-9]*\.(?:png|jpg|webp))$/);
      if (request.method === 'GET' && objectMatch) {
        const object=await env.CARD_ART.get(objectMatch[1]);
        if (!object) return new Response(null,{status:404});
        const headers=new Headers();object.writeHttpMetadata(headers);headers.set('ETag',object.httpEtag);headers.set('Cache-Control','public,max-age=31536000,immutable');
        return new Response(object.body,{headers});
      }
      if (request.method === 'POST' && ['/api/battle/create','/api/battle/join'].includes(url.pathname)) {
        if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({error:'json_required'},415);
        const body=await request.text();
        if(body.length>1000)return json({error:'request_too_large'},413);
        const input=JSON.parse(body);
        if(typeof input.deckId!=='string'||! /^[A-Za-z0-9_-]{1,80}$/.test(input.deckId))return json({error:'invalid_deck'},400);
        const join=url.pathname.endsWith('/join');
        if(join && (typeof input.roomCode!=='string'||! /^[A-Z0-9]{8}$/.test(input.roomCode)))return json({error:'invalid_room'},400);
        try {
          const response=await fetch('http://127.0.0.1:5080/api/rooms'+(join?'/join':''),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(join?{deckId:input.deckId,roomCode:input.roomCode}:{deckId:input.deckId}),signal:AbortSignal.timeout(10000)});
          const data=await response.json();
          return json({...data,battleUrl:env.BATTLE_PUBLIC_URL||'http://127.0.0.1:5080'},response.status);
        }catch{return json({error:'battle_server_unavailable'},503);}
      }
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
      const deckMatch = url.pathname.match(/^\/api\/decks\/([A-Za-z0-9_-]{1,80})$/);
      if (request.method === 'DELETE' && deckMatch) {
        const result = await env.DB.prepare('DELETE FROM decks WHERE deck_id = ?').bind(deckMatch[1]).run();
        if (!result.meta.changes) return json({error:'deck_not_found'}, 404);
        return json({deckId:deckMatch[1], deleted:true});
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
