import { generateCode } from './src/lib/totp.js';
import { base32Decode, isValidBase32, normalizeSecret } from './src/lib/base32.js';
import { hostMatchesSites, siteKeyFor } from './src/lib/sites.js';
import { rankAccounts, sortAccounts } from './src/lib/rank.js';
import { isLocked, loadState, newId, saveState, DEFAULT_SETTINGS } from './src/lib/storage.js';
import {
  PBKDF2_ITERATIONS,
  decryptString,
  deriveKeyBits,
  encryptString,
  fromBase64,
  importAesKey,
  randomSalt,
  toBase64,
} from './src/lib/crypto.js';
import * as vault from './src/lib/vault.js';

const NOTIFY_ALARM = 'totp-runner-notify';
const NOTIFY_ID = 'totp-runner-codes';
const LOCKED = 'LOCKED';

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

function extensionOrigin() {
  return chrome.runtime.getURL('');
}

/** 拡張機能自身のページ（popup / options / import）からのメッセージか */
function isTrustedSender(sender) {
  return typeof sender?.url === 'string' && sender.url.startsWith(extensionOrigin());
}

function senderHostname(sender) {
  try {
    return new URL(sender.url).hostname;
  } catch {
    return '';
  }
}

function publicAccount(account) {
  const { secret, ...rest } = account;
  return { ...rest, hasSecret: Boolean(secret) };
}

async function openSecret(state, account) {
  if (typeof account.secret === 'string') {
    if (!account.secret) throw new Error('シークレットが未設定です');
    return account.secret;
  }
  const key = await vault.getKey();
  if (!key) {
    const error = new Error('ロック中です。パスフレーズで解除してください。');
    error.code = LOCKED;
    throw error;
  }
  return decryptString(key, account.secret);
}

async function sealSecret(state, plain) {
  if (!state.security) return plain;
  const key = await vault.getKey();
  if (!key) {
    const error = new Error('ロック中です。パスフレーズで解除してください。');
    error.code = LOCKED;
    throw error;
  }
  return encryptString(key, plain);
}

// ---------------------------------------------------------------------------
// ロック
// ---------------------------------------------------------------------------

async function lockedState(state) {
  if (!state.security) return { locked: false, canUnlock: false };
  const hasKey = await vault.hasKey();
  return { locked: !hasKey, canUnlock: true };
}

async function enableLock(passphrase) {
  if (!passphrase || passphrase.length < 8) {
    throw new Error('パスフレーズは8文字以上にしてください');
  }
  const state = await loadState();
  if (state.security) throw new Error('すでに設定されています');

  const salt = randomSalt();
  const bits = await deriveKeyBits(passphrase, salt, PBKDF2_ITERATIONS);
  const key = await importAesKey(bits);

  for (const account of state.accounts) {
    if (typeof account.secret === 'string' && account.secret) {
      account.secret = await encryptString(key, account.secret);
    }
  }

  state.security = {
    salt: toBase64(salt),
    iterations: PBKDF2_ITERATIONS,
    canary: await encryptString(key, 'totp-runner'),
  };

  await saveState(state);
  await vault.rememberKey(bits);
  applyIdleSettings(state);
}

async function unlock(passphrase) {
  const state = await loadState();
  if (!state.security) throw new Error('ロックは設定されていません');

  const salt = fromBase64(state.security.salt);
  const bits = await deriveKeyBits(passphrase, salt, state.security.iterations);
  const key = await importAesKey(bits);

  try {
    await decryptString(key, state.security.canary);
  } catch {
    throw new Error('パスフレーズが違います');
  }
  await vault.rememberKey(bits);
}

async function disableLock(passphrase) {
  const state = await loadState();
  if (!state.security) return;
  await unlock(passphrase);
  const key = await vault.getKey();

  for (const account of state.accounts) {
    if (typeof account.secret === 'object' && account.secret) {
      account.secret = await decryptString(key, account.secret);
    }
  }

  state.security = null;
  await saveState(state);
  await vault.forgetKey();
  applyIdleSettings(state);
}

function applyIdleSettings(state) {
  const minutes = Number(state.settings.lock?.idleMinutes) || 15;
  chrome.idle.setDetectionInterval(Math.max(60, minutes * 60));
}

// ---------------------------------------------------------------------------
// 通知
// ---------------------------------------------------------------------------

async function refreshNotificationAlarm(state) {
  await chrome.alarms.clear(NOTIFY_ALARM);
  if (!state.settings.notifications.enabled) return;
  const minutes = Math.max(1, Number(state.settings.notifications.intervalMinutes) || 15);
  chrome.alarms.create(NOTIFY_ALARM, { periodInMinutes: minutes, delayInMinutes: 1 });
}

async function showCodeNotification() {
  const state = await loadState();
  if (!state.settings.notifications.enabled) return;

  const { locked } = await lockedState(state);
  if (locked) {
    await chrome.notifications.clear(NOTIFY_ID);
    return;
  }

  const lines = [];
  const includeCodes = Boolean(state.settings.notifications.includeCodes);
  const target = sortAccounts(state.accounts).slice(0, 6);

  for (const account of target) {
    try {
      if (!includeCodes) {
        lines.push(account.label);
        continue;
      }
      const secret = await openSecret(state, account);
      const { code } = await generateCode({ ...account, secret });
      lines.push(`${account.label}: ${code}`);
    } catch {
      /* 生成できないアカウントは黙って飛ばす */
    }
  }

  if (lines.length === 0) {
    await chrome.notifications.clear(NOTIFY_ID);
    return;
  }

  chrome.notifications.create(NOTIFY_ID, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: 'ワンタイムコード',
    message: lines.join('\n'),
    priority: 0,
    silent: true,
  });
}

// ---------------------------------------------------------------------------
// バックアップ
// ---------------------------------------------------------------------------

async function exportBackup({ passphrase } = {}) {
  const state = await loadState();
  if (state.security && !(await vault.hasKey())) {
    throw new Error('ロック中です。先に解除してください。');
  }
  const plain = [];
  for (const account of sortAccounts(state.accounts)) {
    try {
      const secret = await openSecret(state, account);
      plain.push({ ...account, secret });
    } catch {
      /* ロック中はスキップ */
    }
  }

  const payload = {
    format: 'totp-runner-backup',
    version: 2,
    exportedAt: new Date().toISOString(),
    accounts: plain,
  };

  if (!passphrase) {
    return { encrypted: false, data: JSON.stringify(payload, null, 2) };
  }

  const salt = randomSalt();
  const bits = await deriveKeyBits(passphrase, salt, PBKDF2_ITERATIONS);
  const key = await importAesKey(bits);
  const sealed = await encryptString(key, JSON.stringify(payload));

  return {
    encrypted: true,
    data: JSON.stringify(
      {
        format: 'totp-runner-backup',
        version: 2,
        encrypted: true,
        salt: toBase64(salt),
        iterations: PBKDF2_ITERATIONS,
        envelope: sealed,
      },
      null,
      2,
    ),
  };
}

async function importBackup({ data, passphrase }) {
  let payload;
  try {
    payload = JSON.parse(data);
  } catch {
    throw new Error('JSON として読み込めません');
  }

  if (payload.format !== 'totp-runner-backup') {
    throw new Error('TOTP Runner のバックアップではありません');
  }

  if (payload.encrypted) {
    if (!passphrase) throw new Error('パスフレーズが必要です');
    const bits = await deriveKeyBits(passphrase, fromBase64(payload.salt), payload.iterations);
    const key = await importAesKey(bits);
    const plain = await decryptString(key, payload.envelope).catch(() => {
      throw new Error('パスフレーズが違います');
    });
    payload = JSON.parse(plain);
  }

  return { drafts: payload.accounts || [] };
}

// ---------------------------------------------------------------------------
// アカウント操作
// ---------------------------------------------------------------------------

function validateDraft(draft) {
  const secret = normalizeSecret(draft.secret || '');
  if (!secret) throw new Error('シークレットを入力してください');
  if (!isValidBase32(secret)) throw new Error('Base32 として不正なシークレットです');
  try {
    base32Decode(secret);
  } catch (error) {
    throw new Error(`シークレットを読み取れません: ${error.message}`);
  }
  return secret;
}

function duplicateOf(state, secret, excludeId) {
  for (const account of state.accounts) {
    if (account.id === excludeId) continue;
    if (typeof account.secret !== 'string') continue;
    if (normalizeSecret(account.secret) === secret) return account;
  }
  return null;
}

async function addAccount(draft) {
  const state = await loadState();
  const secret = validateDraft(draft);
  const duplicate = duplicateOf(state, secret, null);
  if (duplicate && !draft.allowDuplicate) {
    throw new Error(`同じシークレットが既に登録されています（${duplicate.label}）`);
  }

  const account = {
    id: newId(),
    label: String(draft.label || draft.issuer || draft.username || 'アカウント').slice(0, 80),
    issuer: String(draft.issuer || '').slice(0, 80),
    username: String(draft.username || '').slice(0, 160),
    secret: await sealSecret(state, secret),
    type: draft.type === 'steam' ? 'steam' : 'totp',
    algorithm: ['SHA-1', 'SHA-256', 'SHA-512'].includes(draft.algorithm)
      ? draft.algorithm
      : 'SHA-1',
    digits: draft.type === 'steam' ? 5 : Number(draft.digits) || 6,
    period: Number(draft.period) || 30,
    sites: Array.isArray(draft.sites) ? [...new Set(draft.sites.map(String))] : [],
    pinned: Boolean(draft.pinned),
    order: state.accounts.length,
    createdAt: Date.now(),
    lastUsedAt: 0,
  };

  state.accounts.push(account);
  await saveState(state);
  return { account: publicAccount(account) };
}

async function updateAccount({ id, patch }) {
  const state = await loadState();
  const account = state.accounts.find((item) => item.id === id);
  if (!account) throw new Error('アカウントが見つかりません');

  if (patch.secret !== undefined) {
    const secret = validateDraft(patch);
    account.secret = await sealSecret(state, secret);
  }
  for (const key of ['label', 'issuer', 'username']) {
    if (patch[key] !== undefined) account[key] = String(patch[key]);
  }
  if (patch.type !== undefined) {
    account.type = patch.type === 'steam' ? 'steam' : 'totp';
    account.digits = account.type === 'steam' ? 5 : Number(patch.digits) || account.digits;
  }
  if (patch.algorithm && ['SHA-1', 'SHA-256', 'SHA-512'].includes(patch.algorithm)) {
    account.algorithm = patch.algorithm;
  }
  if (patch.digits !== undefined && account.type !== 'steam') {
    account.digits = Number(patch.digits) || 6;
  }
  if (patch.period !== undefined) account.period = Number(patch.period) || 30;
  if (patch.sites !== undefined) {
    account.sites = [...new Set(patch.sites.map(String))];
  }
  if (patch.pinned !== undefined) account.pinned = Boolean(patch.pinned);

  await saveState(state);
  return { account: publicAccount(account) };
}

async function deleteAccount({ id }) {
  const state = await loadState();
  state.accounts = state.accounts.filter((account) => account.id !== id);
  for (const host of Object.keys(state.learning)) {
    delete state.learning[host][id];
    if (Object.keys(state.learning[host]).length === 0) delete state.learning[host];
  }
  await saveState(state);
  return { ok: true };
}

async function bindSite({ accountId, hostname }) {
  const state = await loadState();
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account) throw new Error('アカウントが見つかりません');
  const key = siteKeyFor(hostname);
  if (!key) throw new Error('サイトを特定できません');
  if (!account.sites.includes(key)) {
    account.sites.push(key);
    await saveState(state);
  }
  return { account: publicAccount(account), site: key };
}

async function recordUse({ accountId, hostname }) {
  const state = await loadState();
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account) return { ok: false };

  const key = siteKeyFor(hostname) || hostname;
  account.lastUsedAt = Date.now();
  if (!state.learning[key]) state.learning[key] = {};
  if (!state.learning[key][accountId]) state.learning[key][accountId] = { uses: 0, lastUsed: 0 };
  state.learning[key][accountId].uses += 1;
  state.learning[key][accountId].lastUsed = Date.now();

  await saveState(state);
  return { ok: true };
}

async function getCode({ accountId, explicit }, sender) {
  const state = await loadState();
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account) throw new Error('アカウントが見つかりません');

  if (!isTrustedSender(sender)) {
    const host = senderHostname(sender);
    if (!explicit && !hostMatchesSites(account.sites, host)) {
      throw new Error('このサイトには登録されていません');
    }
  }

  const secret = await openSecret(state, account);
  const result = await generateCode({ ...account, secret });
  return {
    ...result,
    type: account.type,
    digits: account.digits,
  };
}

// ---------------------------------------------------------------------------
// メッセージルーター
// ---------------------------------------------------------------------------

const handlers = {
  async 'state:get'(_msg, sender) {
    if (!isTrustedSender(sender)) throw new Error('forbidden');
    const state = await loadState();
    const lock = await lockedState(state);
    return {
      accounts: sortAccounts(state.accounts).map(publicAccount),
      settings: state.settings,
      ...lock,
      encrypted: Boolean(state.security),
    };
  },

  async 'account:add'(msg, sender) {
    if (!isTrustedSender(sender)) throw new Error('forbidden');
    return addAccount(msg.draft || {});
  },

  async 'account:update'(msg, sender) {
    if (!isTrustedSender(sender)) throw new Error('forbidden');
    return updateAccount({ id: msg.id, patch: msg.patch || {} });
  },

  async 'account:delete'(msg, sender) {
    if (!isTrustedSender(sender)) throw new Error('forbidden');
    return deleteAccount({ id: msg.id });
  },

  async 'account:reorder'(msg, sender) {
    if (!isTrustedSender(sender)) throw new Error('forbidden');
    const state = await loadState();
    const ids = Array.isArray(msg.ids) ? msg.ids : [];
    ids.forEach((id, index) => {
      const account = state.accounts.find((item) => item.id === id);
      if (account) account.order = index;
    });
    await saveState(state);
    return { ok: true };
  },

  async 'code:get'(msg, sender) {
    return getCode(msg, sender);
  },

  async 'rank:get'(msg, sender) {
    if (isTrustedSender(sender)) throw new Error('forbidden');
    const state = await loadState();
    const hostname = senderHostname(sender) || String(msg.hostname || '');
    if (!hostname) return { items: [], hasAccounts: false, locked: false, excluded: true };

    if (state.settings.excludedHosts.includes(hostname)) {
      return {
        items: [],
        hasAccounts: state.accounts.length > 0,
        locked: false,
        excluded: true,
        prefs: {
          suggestions: state.settings.suggestions,
          autoFillSingle: state.settings.autoFillSingle,
        },
      };
    }

    const lock = await lockedState(state);
    const items = rankAccounts(state, {
      hostname,
      username: String(msg.username || '').slice(0, 200),
      pageText: String(msg.pageText || '').slice(0, 4000),
    }).filter((item) => item.bound);

    return {
      items,
      hasAccounts: state.accounts.length > 0,
      excluded: false,
      prefs: {
        suggestions: state.settings.suggestions,
        autoFillSingle: state.settings.autoFillSingle,
      },
      ...lock,
    };
  },

  async 'palette:get'(_msg, sender) {
    if (isTrustedSender(sender)) throw new Error('forbidden');
    const state = await loadState();
    const hostname = senderHostname(sender);
    const lock = await lockedState(state);
    return {
      items: rankAccounts(state, { hostname, username: '', pageText: '' }),
      hostname,
      ...lock,
    };
  },

  async 'record:use'(msg, sender) {
    if (isTrustedSender(sender)) throw new Error('forbidden');
    return recordUse({ accountId: msg.accountId, hostname: senderHostname(sender) });
  },

  async 'site:bind'(msg, sender) {
    const hostname = isTrustedSender(sender) ? msg.hostname : senderHostname(sender);
    return bindSite({ accountId: msg.accountId, hostname });
  },

  async 'settings:set'(msg, sender) {
    if (!isTrustedSender(sender)) throw new Error('forbidden');
    const state = await loadState();
    const patch = msg.patch || {};

    state.settings = {
      ...state.settings,
      ...patch,
      notifications: { ...state.settings.notifications, ...(patch.notifications || {}) },
      lock: { ...state.settings.lock, ...(patch.lock || {}) },
    };
    await saveState(state);
    await refreshNotificationAlarm(state);
    applyIdleSettings(state);
    return { settings: state.settings };
  },

  async 'lock:enable'(msg, sender) {
    if (!isTrustedSender(sender)) throw new Error('forbidden');
    await enableLock(msg.passphrase);
    const state = await loadState();
    return { ...(await lockedState(state)) };
  },

  async 'lock:disable'(msg, sender) {
    if (!isTrustedSender(sender)) throw new Error('forbidden');
    await disableLock(msg.passphrase);
    return { locked: false, canUnlock: false };
  },

  async 'lock:unlock'(msg, sender) {
    if (!isTrustedSender(sender)) throw new Error('forbidden');
    await unlock(msg.passphrase);
    return { locked: false, canUnlock: true };
  },

  async 'lock:now'(_msg, sender) {
    if (!isTrustedSender(sender)) throw new Error('forbidden');
    await vault.forgetKey();
    return { locked: true };
  },

  async 'backup:export'(msg, sender) {
    if (!isTrustedSender(sender)) throw new Error('forbidden');
    return exportBackup({ passphrase: msg.passphrase });
  },

  async 'backup:import'(msg, sender) {
    if (!isTrustedSender(sender)) throw new Error('forbidden');
    return importBackup({ data: msg.data, passphrase: msg.passphrase });
  },

  async 'import:batch'(msg, sender) {
    if (!isTrustedSender(sender)) throw new Error('forbidden');
    const drafts = Array.isArray(msg.drafts) ? msg.drafts : [];
    const added = [];
    const skipped = [];
    for (const draft of drafts) {
      try {
        const result = await addAccount(draft);
        added.push(result.account);
      } catch (error) {
        skipped.push({ label: draft.label || draft.username || draft.issuer || '?', reason: error.message });
      }
    }
    return { added, skipped };
  },

  async 'otp:detected'(msg, sender) {
    if (isTrustedSender(sender) || !sender.tab?.id) return { ok: false };
    const tabId = sender.tab.id;
    try {
      if (msg.found) {
        await chrome.action.setBadgeBackgroundColor({ tabId, color: '#1a73e8' });
        await chrome.action.setBadgeText({ tabId, text: '2FA' });
      } else {
        await chrome.action.setBadgeText({ tabId, text: '' });
      }
    } catch {
      /* タブが閉じられた等 */
    }
    return { ok: true };
  },

  async 'popup:open'(_msg, sender) {
    if (isTrustedSender(sender)) throw new Error('forbidden');
    try {
      await chrome.action.openPopup();
    } catch {
      await chrome.windows.create({
        url: chrome.runtime.getURL('src/popup/popup.html'),
        type: 'popup',
        width: 400,
        height: 620,
      });
    }
    return { ok: true };
  },

  async 'options:open'(msg, sender) {
    if (!isTrustedSender(sender)) throw new Error('forbidden');
    await chrome.runtime.openOptionsPage();
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = message && handlers[message.type];
  if (!handler) {
    sendResponse({ ok: false, error: 'unknown message' });
    return false;
  }

  Promise.resolve(handler(message, sender))
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error?.message || String(error),
        code: error?.code || null,
      }),
    );

  return true;
});

// ---------------------------------------------------------------------------
// ライフサイクル
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {
  const state = await loadState();
  await saveState(state);
  await refreshNotificationAlarm(state);
  applyIdleSettings(state);
});

chrome.runtime.onStartup.addListener(async () => {
  const state = await loadState();
  await refreshNotificationAlarm(state);
  applyIdleSettings(state);
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === NOTIFY_ALARM) await showCodeNotification();
});

chrome.idle.onStateChanged.addListener(async (newState) => {
  if (newState === 'active') return;
  const state = await loadState();
  if (state.security) await vault.forgetKey();
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'open-palette') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'palette:open' });
  } catch {
    /* content script が居ないページ */
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
  }
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId !== NOTIFY_ID) return;
  await chrome.notifications.clear(NOTIFY_ID);
});
