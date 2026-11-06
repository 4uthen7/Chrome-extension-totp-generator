const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * 貼り付けられたシークレットを正規化する。
 * 空白・ハイフン・小文字・末尾パディングを吸収する。
 */
export function normalizeSecret(input) {
  return String(input ?? '')
    .toUpperCase()
    .replace(/[\s\-_]/g, '')
    .replace(/=+$/, '');
}

export function isValidBase32(input) {
  const s = normalizeSecret(input);
  return s.length >= 8 && /^[A-Z2-7]+$/.test(s);
}

export function base32Decode(input) {
  const s = normalizeSecret(input);
  if (!s) throw new Error('シークレットが空です');
  if (!/^[A-Z2-7]+$/.test(s)) throw new Error('Base32 に使えない文字が含まれています');

  let bits = 0;
  let value = 0;
  const out = [];

  for (let i = 0; i < s.length; i++) {
    value = (value << 5) | ALPHABET.indexOf(s[i]);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
      value &= bits > 0 ? (1 << bits) - 1 : 0;
    }
  }
  return new Uint8Array(out);
}

export function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
      value &= bits > 0 ? (1 << bits) - 1 : 0;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
