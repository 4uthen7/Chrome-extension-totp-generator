export const SCHEMA_VERSION = 2;

export const DEFAULT_SETTINGS = {
  suggestions: true,
  autoFillSingle: false,
  maskCodes: false,
  excludedHosts: [],
  notifications: {
    enabled: false,
    intervalMinutes: 15,
    includeCodes: true,
  },
  lock: {
    enabled: false,
    idleMinutes: 15,
  },
};

export const STORAGE_KEYS = ['schema', 'accounts', 'learning', 'settings', 'security'];

export function newId() {
  return `acc_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function emptyState() {
  return {
    schema: SCHEMA_VERSION,
    accounts: [],
    learning: {},
    settings: structuredClone(DEFAULT_SETTINGS),
    security: null,
  };
}

function mergeSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    ...DEFAULT_SETTINGS,
    ...source,
    excludedHosts: Array.isArray(source.excludedHosts) ? source.excludedHosts : [],
    notifications: {
      ...DEFAULT_SETTINGS.notifications,
      ...(source.notifications && typeof source.notifications === 'object'
        ? source.notifications
        : {}),
    },
    lock: {
      ...DEFAULT_SETTINGS.lock,
      ...(source.lock && typeof source.lock === 'object' ? source.lock : {}),
    },
  };
}

/** v1 ({name, secret}) を v2 の形へ。既存ユーザーの移行用。 */
function migrateAccount(raw, index) {
  const account = raw && typeof raw === 'object' ? raw : {};
  const hasSecretObject =
    account.secret && typeof account.secret === 'object' && account.secret.ct;

  return {
    id: account.id || newId(),
    label: String(account.label || account.name || account.issuer || 'アカウント'),
    issuer: String(account.issuer || ''),
    username: String(account.username || ''),
    secret: hasSecretObject ? account.secret : String(account.secret || ''),
    type: account.type === 'steam' ? 'steam' : 'totp',
    algorithm: ['SHA-1', 'SHA-256', 'SHA-512'].includes(account.algorithm)
      ? account.algorithm
      : 'SHA-1',
    digits: Number(account.digits) || (account.type === 'steam' ? 5 : 6),
    period: Number(account.period) || 30,
    sites: Array.isArray(account.sites) ? account.sites.filter(Boolean).map(String) : [],
    pinned: Boolean(account.pinned),
    order: Number.isFinite(account.order) ? account.order : index,
    createdAt: account.createdAt || Date.now(),
    lastUsedAt: account.lastUsedAt || 0,
  };
}

export function normalizeState(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const accounts = Array.isArray(source.accounts)
    ? source.accounts.map(migrateAccount)
    : [];

  const learning = {};
  if (source.learning && typeof source.learning === 'object') {
    for (const [host, entries] of Object.entries(source.learning)) {
      if (!entries || typeof entries !== 'object') continue;
      const clean = {};
      for (const [id, value] of Object.entries(entries)) {
        if (!value || typeof value !== 'object') continue;
        clean[id] = {
          uses: Number(value.uses) || 0,
          lastUsed: Number(value.lastUsed) || 0,
        };
      }
      if (Object.keys(clean).length) learning[host] = clean;
    }
  }

  const security =
    source.security && typeof source.security === 'object' && source.security.canary
      ? {
          salt: String(source.security.salt || ''),
          iterations: Number(source.security.iterations) || 600000,
          canary: source.security.canary,
        }
      : null;

  return {
    schema: SCHEMA_VERSION,
    accounts,
    learning,
    settings: mergeSettings(source.settings),
    security,
  };
}

export async function loadState() {
  const raw = await chrome.storage.local.get(STORAGE_KEYS);
  return normalizeState(raw);
}

export async function saveState(state) {
  const payload = {};
  for (const key of STORAGE_KEYS) payload[key] = state[key];
  await chrome.storage.local.set(payload);
  return state;
}

export function isLocked(state) {
  return Boolean(state.security);
}
