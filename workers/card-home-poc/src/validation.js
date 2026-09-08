export const colors = ['RED', 'PURPLE', 'GREEN', 'WHITE', 'YELLOW', 'BLUE'];
const id = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(x);
const integer = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;
function requireValue(ok, error) { if (!ok) throw new Error(error); }
export function validateMaster(m) {
  requireValue(m && m.schemaVersion === 1 && m.rulesVersion === 'core-1' && id(m.masterVersion), 'unsupported_master_version');
  requireValue(Array.isArray(m.cards) && m.cards.length > 0 && m.cards.length <= 1000, 'invalid_master');
  const seen = new Set();
  for (const c of m.cards) {
    requireValue(c && id(c.cardId) && !seen.has(c.cardId), 'duplicate_or_invalid_card_id');
    seen.add(c.cardId);
    requireValue(typeof c.name === 'string' && c.name.trim().length > 0 && c.name.length <= 100 && typeof c.tribe === 'string', 'invalid_card_name');
    requireValue(c.cardType === 'SPIRIT' && colors.includes(c.color) && integer(c.cost, 0, 99), 'unsupported_card');
    // Effects are deliberately rejected until an effect runtime is implemented.
    requireValue(Array.isArray(c.effects) && c.effects.length === 0 && c.effectText === '効果なし', 'unsupported_effect');
    requireValue(Array.isArray(c.levels) && c.levels.length >= 1 && c.levels.length <= 3, 'invalid_levels');
    let previous = 0;
    c.levels.forEach((l, i) => {
      requireValue(l && l.level === i + 1 && integer(l.requiredCores, previous + 1, 99) && integer(l.bp, 0, 999999), 'invalid_levels');
      previous = l.requiredCores;
    });
    requireValue(c.levels[0].requiredCores === 1, 'unsupported_minimum_core');
    for (const [key, min] of [['reductions', 0], ['symbols', 1]]) {
      requireValue(Array.isArray(c[key]) && c[key].length <= 6 && (key !== 'symbols' || c[key].length > 0), 'invalid_symbols');
      const seenColors = new Set();
      for (const item of c[key]) {
        requireValue(item && colors.includes(item.color) && !seenColors.has(item.color) && integer(item.count, min, 9), 'invalid_symbols');
        seenColors.add(item.color);
      }
    }
    requireValue(c.illustration && typeof c.illustration.objectKey === 'string' && integer(c.illustration.version, 0, 99999), 'invalid_illustration');
  }
  return m;
}
export function validateDeck(entries, master) {
  requireValue(Array.isArray(entries) && entries.length > 0 && entries.length <= 40, 'invalid_deck');
  const definitions = new Map(master.cards.map(c => [c.cardId, c]));
  const seen = new Set(), names = new Map();
  let total = 0;
  for (const e of entries) {
    requireValue(e && id(e.cardId) && !seen.has(e.cardId) && integer(e.count, 1, 3), 'invalid_deck_entry');
    seen.add(e.cardId);
    const card = definitions.get(e.cardId);
    requireValue(card, 'unknown_card');
    const count = (names.get(card.name) || 0) + e.count;
    requireValue(count <= 3, 'same_name_limit');
    names.set(card.name, count);
    total += e.count;
  }
  requireValue(total === 40, 'deck_must_have_40_cards');
  return entries.map(e => ({ cardId: e.cardId, count: e.count })).sort((a,b) => a.cardId.localeCompare(b.cardId));
}
