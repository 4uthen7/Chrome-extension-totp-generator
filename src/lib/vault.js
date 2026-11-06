import { fromBase64, importAesKey, toBase64 } from './crypto.js';

/**
 * 解錠中の鍵は chrome.storage.session に置く。
 * session storage はメモリのみ・ブラウザ終了で消える・content script からは読めない。
 */
const KEY_SLOT = 'vaultKey';

export async function rememberKey(keyBits) {
  await chrome.storage.session.set({ [KEY_SLOT]: toBase64(keyBits) });
}

export async function getKey() {
  const stored = await chrome.storage.session.get(KEY_SLOT);
  const encoded = stored[KEY_SLOT];
  if (!encoded) return null;
  return importAesKey(fromBase64(encoded));
}

export async function hasKey() {
  const stored = await chrome.storage.session.get(KEY_SLOT);
  return Boolean(stored[KEY_SLOT]);
}

export async function forgetKey() {
  await chrome.storage.session.remove(KEY_SLOT);
}
