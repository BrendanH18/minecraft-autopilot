/** Minimal SNBT reader for vanilla `data get` replies. Numeric suffixes (b, s, L, f, d) are dropped; values become JS numbers. */
export function parseSnbt(text) {
  let index = 0;
  const fail = message => { throw new SyntaxError(`${message} at offset ${index} in SNBT: ${JSON.stringify(text.slice(Math.max(0, index - 24), index + 24))}`); };
  const space = () => { while (index < text.length && /\s/.test(text[index])) index++; };
  const quoted = () => {
    const quote = text[index++];
    let out = '';
    while (index < text.length) {
      const char = text[index++];
      if (char === '\\') { out += text[index++] ?? ''; continue; }
      if (char === quote) return out;
      out += char;
    }
    return fail('Unterminated string');
  };
  const bare = () => {
    const start = index;
    while (index < text.length && /[A-Za-z0-9._+\-]/.test(text[index])) index++;
    if (index === start) fail('Expected a value');
    return text.slice(start, index);
  };
  const scalar = () => {
    const token = bare();
    const number = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)([bBsSlLfFdD])?$/.exec(token);
    if (number) return Number(number[1]);
    if (token === 'true' || token === 'false') return token === 'true';
    return token;
  };
  const sequence = (close, read) => {
    const out = [];
    space();
    if (text[index] === close) { index++; return out; }
    while (true) {
      out.push(read());
      space();
      if (text[index] === ',') { index++; continue; }
      if (text[index] === close) { index++; return out; }
      fail(`Expected , or ${close}`);
    }
  };
  const value = () => {
    space();
    const char = text[index];
    if (char === '{') {
      index++;
      return Object.fromEntries(sequence('}', () => {
        space();
        const key = text[index] === '"' || text[index] === "'" ? quoted() : bare();
        space();
        if (text[index++] !== ':') fail('Expected :');
        return [key, value()];
      }));
    }
    if (char === '[') {
      index++;
      space();
      // Typed arrays such as UUIDs: [I; 1, 2, 3, 4].
      if (/^[BIL]\s*;/.test(text.slice(index, index + 3))) index = text.indexOf(';', index) + 1;
      return sequence(']', value);
    }
    if (char === '"' || char === "'") return quoted();
    return scalar();
  };
  const result = value();
  space();
  if (index !== text.length) fail('Unexpected trailing text');
  return result;
}

/** Vanilla console lines look like `[12:00:00] [Server thread/INFO]: message`; `[12:00:00 INFO]: message` is also accepted. */
export function stripLogPrefix(line) {
  return String(line).replace(/\x1b\[[0-9;]*m/g, '').replace(/\r$/, '').replace(/^\[[^\]]*\](?: \[[^\]]*\])?: /, '');
}

const DATA_REPLY = /^(.+?) has the following (block|entity) data: (.*)$/;
/** Parses a successful `data get` reply; returns null for any other line. */
export function parseDataReply(line) {
  const match = DATA_REPLY.exec(stripLogPrefix(line));
  return match ? { kind: match[2], target: match[1], value: parseSnbt(match[3]) } : null;
}

const stackCount = item => Number.isFinite(item?.count) ? item.count : Number.isFinite(item?.Count) ? item.Count : 1;
const fullId = id => String(id).includes(':') ? String(id) : `minecraft:${id}`;

/** Total count of one item id in an `Items` or `Inventory` list. */
export function itemCount(items, id) {
  const wanted = fullId(id);
  return (items || []).filter(item => item && fullId(item.id) === wanted).reduce((total, item) => total + stackCount(item), 0);
}

/** { 'minecraft:oak_log': 8, ... } for a container or inventory list. */
export function itemTotals(items) {
  const totals = {};
  for (const item of items || []) if (item?.id) totals[fullId(item.id)] = (totals[fullId(item.id)] || 0) + stackCount(item);
  return totals;
}

/** `[1.5d, -60.0d, 2.5d]` → { x, y, z }. */
export function toPosition(value) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) throw new Error(`Expected a position [x, y, z], got ${JSON.stringify(value)}.`);
  const [x, y, z] = value;
  return { x, y, z };
}

export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
