const $ = (id) => document.getElementById(id);

let state = { accounts: [], settings: {}, locked: false, encrypted: false };
let saveTimer = null;

async function send(type, payload = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...payload });
  if (!response) throw new Error('応答がありません');
  if (!response.ok) throw new Error(response.error || 'エラー');
  return response.result;
}

function toast(text, isError = false) {
  const node = $('toast');
  node.textContent = text;
  node.classList.toggle('error', isError);
  node.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.add('hidden'), 2200);
}

// ---------------------------------------------------------------------------
// 汎用ダイアログ
// ---------------------------------------------------------------------------

function askPassphrase(title) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(12,16,22,.45);display:flex;align-items:center;justify-content:center;z-index:100;';

    const card = document.createElement('div');
    card.style.cssText =
      'background:var(--card);border-radius:14px;padding:20px;width:min(360px,90vw);display:flex;flex-direction:column;gap:12px;box-shadow:0 24px 60px rgba(0,0,0,.3);';

    const heading = document.createElement('div');
    heading.textContent = title;
    heading.style.fontWeight = '700';

    const input = document.createElement('input');
    input.type = 'password';
    input.placeholder = 'パスフレーズ';
    input.style.cssText =
      'padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg);font:inherit;';

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';

    const cancel = document.createElement('button');
    cancel.className = 'ghost';
    cancel.textContent = 'キャンセル';

    const ok = document.createElement('button');
    ok.className = 'primary';
    ok.textContent = 'OK';

    actions.append(cancel, ok);
    card.append(heading, input, actions);
    overlay.append(card);
    document.body.append(overlay);
    input.focus();

    const finish = (value) => {
      overlay.remove();
      resolve(value);
    };

    cancel.onclick = () => finish(null);
    ok.onclick = () => finish(input.value);
    input.onkeydown = (event) => {
      if (event.key === 'Enter') finish(input.value);
      if (event.key === 'Escape') finish(null);
    };
  });
}

// ---------------------------------------------------------------------------
// 設定
// ---------------------------------------------------------------------------

function applySettingsToForm() {
  const settings = state.settings;
  $('setSuggestions').checked = Boolean(settings.suggestions);
  $('setAutoFill').checked = Boolean(settings.autoFillSingle);
  $('setMask').checked = Boolean(settings.maskCodes);
  $('setExcluded').value = (settings.excludedHosts || []).join('\n');

  $('setNotify').checked = Boolean(settings.notifications?.enabled);
  $('setInterval').value = settings.notifications?.intervalMinutes ?? 15;
  $('setNoticeCodes').value = settings.notifications?.includeCodes ? 'codes' : 'labels';

  $('idleMinutes').value = settings.lock?.idleMinutes ?? 15;

  $('lockOff').classList.toggle('hidden', state.encrypted);
  $('lockOn').classList.toggle('hidden', !state.encrypted);

  const badge = $('lockBadge');
  badge.textContent = state.locked ? 'ロック中' : '解除中';
  badge.classList.toggle('locked', state.locked);

  $('stats').textContent = `${state.accounts.length} アカウント · ${
    state.encrypted ? '暗号化済み' : '平文保存'
  }`;
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;
}

async function persist(patch, immediate = false) {
  clearTimeout(saveTimer);
  const run = async () => {
    try {
      const result = await send('settings:set', { patch });
      state.settings = result.settings;
    } catch (error) {
      toast(error.message, true);
    }
  };
  if (immediate) await run();
  else saveTimer = setTimeout(run, 350);
}

$('setSuggestions').addEventListener('change', (e) =>
  persist({ suggestions: e.target.checked }, true),
);
$('setAutoFill').addEventListener('change', (e) =>
  persist({ autoFillSingle: e.target.checked }, true),
);
$('setMask').addEventListener('change', (e) => persist({ maskCodes: e.target.checked }, true));

$('setExcluded').addEventListener('input', (e) => {
  const hosts = e.target.value
    .split('\n')
    .map((line) => line.trim().toLowerCase())
    .filter(Boolean);
  persist({ excludedHosts: hosts });
});

$('setNotify').addEventListener('change', (e) =>
  persist({ notifications: { enabled: e.target.checked } }, true),
);
$('setInterval').addEventListener('change', (e) =>
  persist({ notifications: { intervalMinutes: Math.min(240, Math.max(1, Number(e.target.value) || 15)) } }, true),
);
$('setNoticeCodes').addEventListener('change', (e) =>
  persist({ notifications: { includeCodes: e.target.value === 'codes' } }, true),
);
$('idleMinutes').addEventListener('change', (e) =>
  persist({ lock: { idleMinutes: Math.min(240, Math.max(1, Number(e.target.value) || 15)) } }, true),
);

// ---------------------------------------------------------------------------
// ロック
// ---------------------------------------------------------------------------

$('enableLock').addEventListener('click', async () => {
  const pass = $('newPass').value;
  const confirm = $('newPass2').value;
  if (pass.length < 8) {
    toast('8文字以上にしてください', true);
    return;
  }
  if (pass !== confirm) {
    toast('パスフレーズが一致しません', true);
    return;
  }
  try {
    await send('lock:enable', { passphrase: pass });
    $('newPass').value = '';
    $('newPass2').value = '';
    await load();
    toast('ロックを設定しました');
  } catch (error) {
    toast(error.message, true);
  }
});

$('lockNow').addEventListener('click', async () => {
  await send('lock:now');
  await load();
  toast('ロックしました');
});

$('disableLock').addEventListener('click', async () => {
  const pass = await askPassphrase('パスフレーズを入力してロックを解除します');
  if (pass === null) return;
  try {
    await send('lock:disable', { passphrase: pass });
    await load();
    toast('ロックを解除しました');
  } catch (error) {
    toast(error.message, true);
  }
});

// ---------------------------------------------------------------------------
// バックアップ
// ---------------------------------------------------------------------------

function download(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

$('exportBtn').addEventListener('click', async () => {
  try {
    const passphrase = $('backupPass').value || undefined;
    const result = await send('backup:export', { passphrase });
    const stamp = new Date().toISOString().slice(0, 10);
    download(`totp-runner-${stamp}.json`, result.data);
    toast(result.encrypted ? '暗号化して書き出しました' : '書き出しました');
  } catch (error) {
    toast(error.message, true);
  }
});

$('importBtn').addEventListener('click', () => $('importFile').click());

$('importFile').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;

  try {
    const text = await file.text();
    let passphrase = $('backupPass').value || undefined;
    let result;
    try {
      result = await send('backup:import', { data: text, passphrase });
    } catch (error) {
      if (!/パスフレーズ/.test(error.message)) throw error;
      const answer = await askPassphrase('バックアップのパスフレーズ');
      if (answer === null) return;
      result = await send('backup:import', { data: text, passphrase: answer });
    }
    const batch = await send('import:batch', { drafts: result.drafts });
    await load();
    toast(
      `${batch.added.length} 件を追加${batch.skipped.length ? ` / ${batch.skipped.length} 件スキップ` : ''}`,
    );
  } catch (error) {
    toast(error.message, true);
  }
});

// ---------------------------------------------------------------------------
// データ
// ---------------------------------------------------------------------------

$('wipeBtn').addEventListener('click', async () => {
  if (!state.accounts.length) {
    toast('アカウントがありません', true);
    return;
  }
  const answer = await askPassphrase(
    `${state.accounts.length} 件をすべて削除します。続けるにはパスフレーズを入力（未設定なら空欄でOK）`,
  );
  if (answer === null) return;

  try {
    if (state.encrypted) {
      await send('lock:unlock', { passphrase: answer });
    }
    for (const account of state.accounts) {
      await send('account:delete', { id: account.id });
    }
    await load();
    toast('削除しました');
  } catch (error) {
    toast(error.message, true);
  }
});

$('shortcutsBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }).catch(() => {
    toast('chrome://extensions/shortcuts を開いてください', true);
  });
});

// ---------------------------------------------------------------------------
// 初期化
// ---------------------------------------------------------------------------

async function load() {
  state = await send('state:get');
  applySettingsToForm();
}

load().catch((error) => toast(error.message, true));
