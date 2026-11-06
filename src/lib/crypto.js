const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const PBKDF2_ITERATIONS = 600000;

export function toBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(value) {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export async function deriveKeyBits(passphrase, salt, iterations = PBKDF2_ITERATIONS) {
  const base = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    256,
  );
  return new Uint8Array(bits);
}

export function importAesKey(bits) {
  return crypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptString(key, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(text),
  );
  return { v: 1, iv: toBase64(iv), ct: toBase64(new Uint8Array(cipher)) };
}

export async function decryptString(key, blob) {
  const iv = fromBase64(blob.iv);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    fromBase64(blob.ct),
  );
  return decoder.decode(plain);
}

export function randomSalt() {
  return crypto.getRandomValues(new Uint8Array(16));
}
