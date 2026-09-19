import { z } from 'zod';
export const MAX_CONTRACT_JSON_CHARS = 32 * 1024 * 1024;
/** Strict JSON entrypoint: duplicate keys, nonfinite exponents and excessive nesting fail before Zod. */
export function parseContractJson<T>(schema: z.ZodType<T>, text: string): T {
  if (typeof text !== 'string' || text.length > MAX_CONTRACT_JSON_CHARS) throw new Error('JSON input is null or too large');
  let cursor = 0; let nodes = 0;
  const space = () => { while (/[ \t\r\n]/.test(text[cursor] ?? '\0')) cursor++; };
  const take = (c: string) => { space(); if (text[cursor] === c) { cursor++; return true; } return false; };
  const expect = (c: string) => { if (!take(c)) throw new Error(`Expected JSON token ${c}`); };
  function string(): string {
    const start = cursor;
    if (text[cursor++] !== '"') throw new Error('Expected JSON string');
    while (cursor < text.length) {
      const c = text[cursor++];
      if (c === '"') return JSON.parse(text.slice(start, cursor)) as string;
      if (c === '\\') cursor++;
    }
    throw new Error('Unterminated JSON string');
  }
  function value(depth: number): unknown {
    if (depth > 64 || ++nodes > 2_000_000) throw new Error('JSON nesting/node limit');
    space();
    if (text[cursor] === '"') return string();
    if (take('{')) {
      const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      if (take('}')) return result;
      do { space(); const key = string(); expect(':'); if (Object.hasOwn(result, key)) throw new Error(`Duplicate JSON property: ${key}`); result[key] = value(depth + 1); } while (take(','));
      expect('}'); return result;
    }
    if (take('[')) { const result = []; if (take(']')) return result; do { result.push(value(depth + 1)); } while (take(',')); expect(']'); return result; }
    for (const [token, v] of [['true', true], ['false', false], ['null', null]] as const) if (text.startsWith(token, cursor)) { cursor += token.length; return v; }
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(cursor));
    if (!match || !Number.isFinite(Number(match[0]))) throw new Error('Invalid/nonfinite JSON number');
    cursor += match[0].length; return Number(match[0]);
  }
  const raw = value(0); space(); if (cursor !== text.length) throw new Error('Trailing JSON input');
  return schema.parse(raw);
}
