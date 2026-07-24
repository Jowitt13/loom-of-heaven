/**
 * Deterministic serialization helpers.
 *
 * Canonical JSON gives byte-identical output for equal values regardless of key
 * insertion order or host platform, which is the backbone of the reproducibility
 * guarantee: identical input + identical versions => identical canonical JSON,
 * whether run from source or from the packaged Skill.
 */

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** Recursively sort object keys; arrays keep their order; drop `undefined` members. */
function sortValue(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map((item) => sortValue(item));
  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, JsonValue> = {};
    for (const key of Object.keys(source).sort()) {
      const child = source[key];
      if (child === undefined) continue;
      out[key] = sortValue(child);
    }
    return out;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot canonicalize non-finite number: ${String(value)}`);
    }
    return value;
  }
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  throw new Error(`Cannot canonicalize value of type ${typeof value}`);
}

/** Stable stringify with sorted keys (no whitespace). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

/** Pretty (2-space) stable stringify — used for human-facing artifact files. */
export function canonicalJsonPretty(value: unknown): string {
  return JSON.stringify(sortValue(value), null, 2);
}

/**
 * FNV-1a 64-bit hash returning a lowercase hex string. Pure JS (no Node builtins)
 * so it behaves identically in Node and the browser and never touches the network.
 */
export function fnv1a64Hex(input: string): string {
  const OFFSET = 0xcbf29ce484222325n;
  const PRIME = 0x00000100000001b3n;
  const MASK = 0xffffffffffffffffn;
  let hash = OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i) & 0xff);
    // Also fold in the high byte so multi-byte code units still perturb the hash.
    hash ^= BigInt((input.charCodeAt(i) >> 8) & 0xff) << 8n;
    hash = (hash * PRIME) & MASK;
  }
  return hash.toString(16).padStart(16, '0');
}

/** Round a number to a fixed number of decimals to keep canonical JSON stable. */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  // Add a tiny epsilon before rounding to avoid 0.5 boundary flapping across platforms.
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
