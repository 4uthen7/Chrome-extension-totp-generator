import { formatCode } from '../lib/totp.js';

const $ = (id) => document.getElementById(id);

const ui = {
  list: $('list'),
  empty: $('empty'),
  search: $('search'),
  modal: $('modal'),
  modalTitle: $('modalTitle'),
  modalBody: $('modalBody'),
  modalOk: $('modalOk'),
  modalCancel: $('modalCancel'),
  modalClose: $('modalClose'),
  toast: $('toast'),
  lockBanner: $('lockBanner'),
  lockBtn: $('lockBtn'),
};

let state = { accounts: [], settings: {}, locked: false, encrypted: false };
let codes = new Map();
let rowRefs = new Map();
let tickTimer = null;
let query = '';
let toastTimer = null;

// ---------------------------------------------------------------------------
// 共通
// ---------------------------------------------------------------------------

async function send(type, payload = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...payload });
  if (!response) throw new Error('応答がありません');
  if (!response.ok) {
    const error = new Error(response.error || 'エラー');
    error.code = response.code || null;
    throw error;
  }
  return response.result;
}

function toast(text) {
  ui.toast.textContent = text;
  ui.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.add('hidden'), 1400);
}

function initials(account) {
  const source = account.label || account.issuer || account.username || '?';
  return source.trim().slice(0, 1) || '?';
}

function subtitle(account) {
  const parts = [];
  if (account.username) parts.push(account.username);
  if (account.sites && account.sites.length) parts.push(account.sites[0]);
  if (parts.length === 0 && account.issuer) parts.push(account.issuer);
  if (account.type === 'steam') parts.push('Steam Guard');
  return parts.join(' · ') || 'サイト未登録';
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('コピーしました');
  } catch {
    toast('コピーできませんでした');
  }
}

function ring() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.classList.add('ring');
  const track = document.createElementNS(NS, 'circle');
  track.setAttribute('cx', '10');
  track.setAttribute('cy', '10');
  track.setAttribute('r', '8');
  track.classList.add('track');
  const bar = document.createElementNS(NS, 'circle');
  bar.setAttribute('cx', '10');
  bar.setAttribute('cy', '10');
  bar.setAttribute('r', '8');
  bar.classList.add('bar');
  const circumference = 2 * Math.PI * 8;
  bar.style.strokeDasharray = String(circumference);
  svg.append(track, bar);
  return { svg, bar, circumference };
}

// ---------------------------------------------------------------------------
// 一覧
// ---------------------------------------------------------------------------

function filteredAccounts() {
  if (!query) return state.accounts;
  const needle = query.toLowerCase();
  return state.accounts.filter((account) =>
    `${account.label} ${account.issuer} ${account.username} ${(account.sites || []).join(' ')}`
      .toLowerCase()
      .includes(needle),
  );
}

function render() {
  ui.list.textContent = '';
  rowRefs.clear();

  const accounts = filteredAccounts();
  ui.empty.classList.toggle('hidden', accounts.length > 0);

  if (accounts.length === 0) {
    ui.empty.querySelector('.empty-title').textContent = state.accounts.length
      ? '該当なし'
      : 'アカウントがありません';
    return;
  }

  for (const account of accounts) {
    const row = document.createElement('div');
    row.className = 'row';

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = initials(account);

    const meta = document.createElement('div');
    meta.className = 'meta';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = account.label || '(無題)';
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = subtitle(account);
    meta.append(name, sub);

    const codeWrap = document.createElement('div');
    codeWrap.className = 'code-wrap';
    const codeEl = document.createElement('div');
    codeEl.className = 'code';
    codeEl.textContent = '••• •••';
    const { svg, bar, circumference } = ring();
    codeWrap.append(codeEl, svg);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const editBtn = document.createElement('button');
    editBtn.textContent = '✎';
    editBtn.title = '編集';
    const delBtn = document.createElement('button');
    delBtn.textContent = '🗑';
    delBtn.title = '削除';
    delBtn.className = 'danger';
    actions.append(editBtn, delBtn);

    row.append(avatar, meta, codeWrap, actions);

    codeEl.addEventListener('click', async () => {
      if (state.locked) {
        openUnlock();
        return;
      }
      const entry = codes.get(account.id);
      if (entry && entry.code) {
        await copy(entry.code);
        return;
      }
      try {
        const result = await send('code:get', { accountId: account.id });
        await copy(result.code);
      } catch {
        toast('コードを取得できません');
      }
    });

    editBtn.addEventListener('click', () => openEdit(account));
    delBtn.addEventListener('click', () => confirmDelete(account));

    ui.list.append(row);
    rowRefs.set(account.id, { codeEl, bar, circumference, svg, account });
  }

  paintCodes();
}

function paintCodes() {
  const now = Date.now();
  for (const [id, ref] of rowRefs) {
    const account = ref.account;
    const entry = codes.get(id);

    if (state.locked) {
      ref.codeEl.textContent = '••• •••';
      ref.codeEl.className = 'code masked';
      ref.bar.style.strokeDashoffset = String(ref.circumference);
      continue;
    }

    if (!entry) {
      ref.codeEl.textContent = '••• •••';
      ref.codeEl.className = 'code';
      continue;
    }

    if (entry.error) {
      ref.codeEl.textContent = entry.error === 'ロック中' ? 'ロック中' : '取得失敗';
      ref.codeEl.className = 'code error';
      continue;
    }

    const period = entry.period || 30;
    const remaining = Math.max(0, entry.validUntil - now);
    const ratio = remaining / (period * 1000);

    ref.codeEl.textContent = formatCode(entry.code, account.type);
    ref.codeEl.className = 'code';
    ref.bar.style.strokeDashoffset = String(ref.circumference * (1 - ratio));
    ref.svg.classList.toggle('warn', remaining < 5000);

    if (remaining <= 0) {
      ref.codeEl.classList.add('masked');
    }
  }
}

async function refreshCodes() {
  if (state.locked) return;

  const jobs = state.accounts.map(async (account) => {
    try {
      const result = await send('code:get', { accountId: account.id });
      codes.set(account.id, { ...result });
    } catch (error) {
      codes.set(account.id, {
        error: error.code === 'LOCKED' ? 'ロック中' : error.message,
        period: account.period || 30,
        validUntil: 0,
      });
    }
  });
  await Promise.all(jobs);
  paintCodes();
}

function startTicker() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(async () => {
    paintCodes();
    if (state.locked) return;
    const now = Date.now();
    const expired = [...codes.entries()].filter(
      ([, entry]) => !entry.error && entry.validUntil > 0 && entry.validUntil <= now + 60,
    );
    for (const [id] of expired) {
      const account = state.accounts.find((item) => item.id === id);
      if (!account) continue;
      try {
        const result = await send('code:get', { accountId: id });
        codes.set(id, { ...result });
      } catch {
        /* 次のティックで再挑戦 */
      }
    }
    if (expired.length) paintCodes();
  }, 250);
}

// ---------------------------------------------------------------------------
// モーダル
// ---------------------------------------------------------------------------

let modalCleanup = null;

function closeModal() {
  ui.modal.classList.add('hidden');
  ui.modalBody.textContent = '';
  ui.modalOk.onclick = null;
  ui.modalCancel.onclick = null;
  ui.modalOk.disabled = false;
  if (modalCleanup) {
    modalCleanup();
    modalCleanup = null;
  }
}

function openModal({ title, body, okLabel = '保存', cancelLabel = 'キャンセル', onOk, hideOk = false }) {
  ui.modalTitle.textContent = title;
  ui.modalBody.textContent = '';
  ui.modalBody.append(body);
  ui.modalOk.textContent = okLabel;
  ui.modalOk.classList.toggle('hidden', hideOk);
  ui.modalCancel.textContent = cancelLabel;
  ui.modalOk.disabled = false;
  ui.modal.classList.remove('hidden');

  ui.modalCancel.onclick = closeModal;
  ui.modalClose.onclick = closeModal;
  ui.modalOk.onclick = async () => {
    if (!onOk) {
      closeModal();
      return;
    }
    ui.modalOk.disabled = true;
    try {
      await onOk();
      closeModal();
    } catch (error) {
      showError(error.message);
      ui.modalOk.disabled = false;
    }
  };
}

function showError(message) {
  let node = ui.modalBody.querySelector('.modal-error');
  if (!node) {
    node = document.createElement('div');
    node.className = 'warn modal-error';
    ui.modalBody.append(node);
  }
  node.textContent = message;
}

// ---------------------------------------------------------------------------
// 追加・編集フォーム
// ---------------------------------------------------------------------------

function field(label, input, hint) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  wrap.append(labelEl, input);
  if (hint) {
    const hintEl = document.createElement('div');
    hintEl.className = 'hint';
    hintEl.textContent = hint;
    wrap.append(hintEl);
  }
  return wrap;
}

function input(type, value = '', placeholder = '') {
  const el = document.createElement('input');
  el.type = type;
  el.value = value;
  el.placeholder = placeholder;
  el.spellcheck = false;
  return el;
}

async function currentSiteKey() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return '';
    const url = new URL(tab.url);
    if (!/^https?:$/.test(url.protocol)) return '';
    const host = url.hostname;
    const parts = host.split('.');
    return parts.length <= 2 ? host : parts.slice(-2).join('.');
  } catch {
    return '';
  }
}

function buildAccountForm(account) {
  const isEdit = Boolean(account);
  const node = document.createDocumentFragment();

  let type = account?.type || 'totp';

  const segmented = document.createElement('div');
  segmented.className = 'segmented';
  const totpBtn = document.createElement('button');
  totpBtn.type = 'button';
  totpBtn.textContent = 'TOTP';
  const steamBtn = document.createElement('button');
  steamBtn.type = 'button';
  steamBtn.textContent = 'Steam Guard';
  segmented.append(totpBtn, steamBtn);

  const syncSegmented = () => {
    totpBtn.classList.toggle('active', type === 'totp');
    steamBtn.classList.toggle('active', type === 'steam');
    digitsInput.disabled = type === 'steam';
    digitsInput.value = type === 'steam' ? '5' : digitsInput.value === '5' ? '6' : digitsInput.value;
  };
  totpBtn.onclick = () => {
    type = 'totp';
    syncSegmented();
  };
  steamBtn.onclick = () => {
    type = 'steam';
    syncSegmented();
  };

  const labelInput = input('text', account?.label || '', '例: GitHub (仕事用)');
  const issuerInput = input('text', account?.issuer || '', '例: GitHub');
  const usernameInput = input('text', account?.username || '', '例: takah@example.com');
  const secretInput = input(
    'password',
    '',
    isEdit ? '変更しない場合は空欄' : 'Base32 (例: JBSWY3DPEHPK3PXP)',
  );
  secretInput.autocomplete = 'off';

  const sitesInput = input('text', (account?.sites || []).join(', '), 'example.com, google.com');
  const siteRow = document.createElement('div');
  siteRow.className = 'field';
  const siteLabel = document.createElement('label');
  siteLabel.textContent = '紐付けるサイト';
  const siteHint = document.createElement('div');
  siteHint.className = 'hint';
  siteHint.textContent = 'このサイトで TOTP 入力欄を検知したとき候補に出ます。空欄でも可。';
  const siteBtn = document.createElement('button');
  siteBtn.type = 'button';
  siteBtn.className = 'inline-btn';
  siteBtn.textContent = '＋ 現在のタブのサイトを追加';
  siteBtn.onclick = async () => {
    const key = await currentSiteKey();
    if (!key) {
      toast('このページのサイトは取得できません');
      return;
    }
    const existing = sitesInput.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!existing.includes(key)) existing.push(key);
    sitesInput.value = existing.join(', ');
  };
  siteRow.append(siteLabel, sitesInput, siteHint, siteBtn);

  const digitsInput = input('number', String(account?.digits || 6));
  digitsInput.min = '6';
  digitsInput.max = '8';
  const periodInput = input('number', String(account?.period || 30));
  periodInput.min = '10';
  periodInput.max = '300';

  const algorithmSelect = document.createElement('select');
  for (const algorithm of ['SHA-1', 'SHA-256', 'SHA-512']) {
    const option = document.createElement('option');
    option.value = algorithm;
    option.textContent = algorithm;
    algorithmSelect.append(option);
  }
  algorithmSelect.value = account?.algorithm || 'SHA-1';

  const advanced = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = '詳細設定';
  summary.style.cssText = 'font-size:11.5px;color:var(--fg-soft);cursor:pointer;font-weight:600;';
  const advancedBody = document.createElement('div');
  advancedBody.style.cssText = 'display:flex;flex-direction:column;gap:10px;margin-top:8px;';

  const digitsPeriod = document.createElement('div');
  digitsPeriod.className = 'field-row';
  digitsPeriod.append(field('桁数', digitsInput), field('周期 (秒)', periodInput));
  advancedBody.append(digitsPeriod, field('アルゴリズム', algorithmSelect));
  advanced.append(summary, advancedBody);

  node.append(
    field('種類', segmented),
    field('ラベル', labelInput),
    field('ユーザー名 / メール', usernameInput, '複数アカウントの自動推薦に使います'),
    field('発行者 (issuer)', issuerInput),
    field('シークレット', secretInput),
    siteRow,
    advanced,
  );

  syncSegmented();

  const read = () => ({
    type,
    label: labelInput.value.trim() || issuerInput.value.trim() || usernameInput.value.trim(),
    issuer: issuerInput.value.trim(),
    username: usernameInput.value.trim(),
    secret: secretInput.value.trim(),
    sites: sitesInput.value
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    digits: Number(digitsInput.value) || (type === 'steam' ? 5 : 6),
    period: Number(periodInput.value) || 30,
    algorithm: algorithmSelect.value,
  });

  return { node, read };
}

function openAdd() {
  const form = buildAccountForm(null);
  openModal({
    title: 'アカウントを追加',
    body: form.node,
    okLabel: '追加',
    onOk: async () => {
      const draft = form.read();
      if (!draft.secret) throw new Error('シークレットを入力してください');
      await send('account:add', { draft });
      await reload();
      toast('追加しました');
    },
  });
}

function openEdit(account) {
  const form = buildAccountForm(account);
  openModal({
    title: 'アカウントを編集',
    body: form.node,
    okLabel: '保存',
    onOk: async () => {
      const draft = form.read();
      const patch = { ...draft };
      if (!patch.secret) delete patch.secret;
      await send('account:update', { id: account.id, patch });
      await reload();
      toast('保存しました');
    },
  });
}

function confirmDelete(account) {
  const body = document.createElement('div');
  body.className = 'field';
  const message = document.createElement('div');
  message.style.fontSize = '12.5px';
  message.textContent = `「${account.label}」を削除します。元に戻せません。`;
  body.append(message);

  openModal({
    title: '削除の確認',
    body,
    okLabel: '削除',
    onOk: async () => {
      await send('account:delete', { id: account.id });
      await reload();
      toast('削除しました');
    },
  });
}

// ---------------------------------------------------------------------------
// ロック
// ---------------------------------------------------------------------------

function openUnlock() {
  const body = document.createElement('div');
  body.className = 'field';
  const pass = input('password', '', 'パスフレーズ');
  pass.autocomplete = 'current-password';
  body.append(pass);
  setTimeout(() => pass.focus(), 30);

  openModal({
    title: 'ロック解除',
    body,
    okLabel: '解除',
    onOk: async () => {
      await send('lock:unlock', { passphrase: pass.value });
      await reload();
      toast('解除しました');
    },
  });
}

function openLockSetup() {
  const body = document.createElement('div');
  body.className = 'field';
  const message = document.createElement('div');
  message.style.fontSize = '12.5px';
  message.textContent =
    'パスフレーズでシークレットを暗号化します。忘れると復元できません。';
  const pass = input('password', '', 'パスフレーズ (8文字以上)');
  const confirm = input('password', '', '確認のため再入力');
  pass.autocomplete = 'new-password';
  confirm.autocomplete = 'new-password';
  body.append(message, pass, confirm);
  setTimeout(() => pass.focus(), 30);

  openModal({
    title: 'ロックを設定',
    body,
    okLabel: '設定',
    onOk: async () => {
      if (pass.value !== confirm.value) throw new Error('パスフレーズが一致しません');
      await send('lock:enable', { passphrase: pass.value });
      await reload();
      toast('ロックを設定しました');
    },
  });
}

async function onLockButton() {
  if (state.locked) {
    openUnlock();
    return;
  }
  if (state.encrypted) {
    await send('lock:now');
    await reload();
    toast('ロックしました');
    return;
  }
  openLockSetup();
}

// ---------------------------------------------------------------------------
// 状態
// ---------------------------------------------------------------------------

async function reload() {
  try {
    state = await send('state:get');
  } catch (error) {
    toast(error.message);
    return;
  }

  codes = new Map();
  ui.lockBanner.classList.toggle('hidden', !state.locked);
  ui.lockBtn.textContent = state.locked ? '🔓' : state.encrypted ? '🔒' : '🔓';
  ui.lockBtn.title = state.locked
    ? 'ロック解除'
    : state.encrypted
      ? '今すぐロック'
      : 'パスフレーズでロック';

  render();
  if (!state.locked) await refreshCodes();
  startTicker();
}

// ---------------------------------------------------------------------------
// イベント
// ---------------------------------------------------------------------------

ui.search.addEventListener('input', () => {
  query = ui.search.value.trim();
  render();
});

ui.modal.addEventListener('mousedown', (event) => {
  if (event.target === ui.modal) closeModal();
});

$('addBtn').addEventListener('click', openAdd);
$('importBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/import/import.html') });
});
$('settingsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('settingsBtn2').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('unlockBtn').addEventListener('click', openUnlock);
ui.lockBtn.addEventListener('click', onLockButton);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !ui.modal.classList.contains('hidden')) {
    closeModal();
  }
  if (event.key === 'Enter' && !ui.modal.classList.contains('hidden')) {
    const target = event.target;
    if (target instanceof HTMLInputElement) ui.modalOk.click();
  }
});

window.addEventListener('unload', () => {
  if (tickTimer) clearInterval(tickTimer);
});

reload();
