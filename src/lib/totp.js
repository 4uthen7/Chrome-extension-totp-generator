import { base32Decode } from './base32.js';

/** Steam Guard のコード alphabet（26 文字） */
export const STEAM_ALPHABET = '23456789BCDFGHJKMNPQRTVWXY';

export const ALGORITHMS = ['SHA-1', 'SHA-256', 'SHA-512'];

const TWO32 = 2 ** 32;

function counterToBytes(counter) {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(0, Math.floor(counter / TWO32));
  view.setUint32(4, counter % TWO32);
  return buffer;
}

export async function hmac(secretBytes, counter, algorithm = 'SHA-1') {
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, counterToBytes(counter));
  return new Uint8Array(signature);
}

export function dynamicTruncate(hash) {
  const offset = hash[hash.length - 1] & 0x0f;
  return (
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff)
  );
}

/** Steam Guard: 5 文字。値は 26 進で桁を取り出す。 */
export function steamCode(hash) {
  let value = dynamicTruncate(hash);
  let out = '';
  for (let i = 0; i < 5; i++) {
    out += STEAM_ALPHABET[value % 26];
    value = Math.floor(value / 26);
  }
  return out;
}

export function numericCode(hash, digits = 6) {
  return String(dynamicTruncate(hash) % 10 ** digits).padStart(digits, '0');
}

/**
 * @param {{secret: string|Uint8Array, algorithm?: string, digits?: number, period?: number, type?: 'totp'|'steam'}} account
 * @returns {Promise<{code: string, period: number, remainingMs: number, validUntil: number}>}
 */
export async function generateCode(account, now = Date.now()) {
  const secretBytes =
    typeof account.secret === 'string' ? base32Decode(account.secret) : account.secret;
  const period = Math.max(1, Number(account.period) || 30);
  const counter = Math.floor(now / 1000 / period);
  const hash = await hmac(secretBytes, counter, account.algorithm || 'SHA-1');

  const code =
    account.type === 'steam' ? steamCode(hash) : numericCode(hash, Number(account.digits) || 6);

  const elapsedMs = now % (period * 1000);
  const remainingMs = period * 1000 - elapsedMs;

  return { code, period, remainingMs, validUntil: now + remainingMs };
}

export function formatCode(code, type = 'totp') {
  if (type === 'steam') return code;
  if (code.length === 6) return `${code.slice(0, 3)} ${code.slice(3)}`;
  if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`;
  return code;
}
