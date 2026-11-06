import { parseAnyInput } from '../lib/otpauth.js';

const $ = (id) => document.getElementById(id);
const decoder = window.jsQR;

let results = [];

// ---------------------------------------------------------------------------
// 共通
// ---------------------------------------------------------------------------

function setStatus(text, kind = '') {
  const node = $('status');
  node.textContent = text;
  node.className = `status ${kind}`;
}

function initials(draft) {
  const source = draft.issuer || draft.username || draft.type || '?';
  return source.trim().slice(0, 1).toUpperCase();
}

function draftName(draft) {
  if (draft.issuer && draft.username) return `${draft.issuer} — ${draft.username}`;
  return draft.issuer || draft.username || '名称未設定';
}

function maskedSecret(secret) {
  if (!secret) return '';
  if (secret.length <= 8) return '••••';
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// 結果一覧
// ---------------------------------------------------------------------------

function renderResults() {
  const card = $('resultsCard');
  const list = $('results');
  list.textContent = '';

  if (results.length === 0) {
    card.classList.add('hidden');
    return;
  }
  card.classList.remove('hidden');

  results.forEach((entry, index) => {
    const row = document.createElement('div');
    row.className = 'result';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = entry.selected;
    checkbox.addEventListener('change', () => {
      entry.selected = checkbox.checked;
    });

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = initials(entry.draft);

    const meta = document.createElement('div');
    meta.className = 'meta';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = draftName(entry.draft);
    const detail = document.createElement('div');
    detail.className = 'detail';
    detail.textContent = `${maskedSecret(entry.draft.secret)} · ${entry.draft.algorithm} · ${
      entry.draft.type === 'steam' ? 'Steam Guard' : `${entry.draft.digits}桁/${entry.draft.period}秒`
    }`;
    meta.append(name, detail);

    const tag = document.createElement('span');
    tag.className = entry.draft.type === 'steam' ? 'tag steam' : 'tag';
    tag.textContent = entry.draft.type === 'steam' ? 'Steam' : 'TOTP';

    row.append(checkbox, avatar, meta, tag);
    list.append(row);
  });

  $('selectAll').checked = results.every((entry) => entry.selected);
}

function addParsed(parsed, errors) {
  for (const draft of parsed) {
    results.push({
      selected: true,
      draft: {
        type: draft.type === 'steam' ? 'steam' : 'totp',
        issuer: draft.issuer || '',
        username: draft.username || '',
        label: draft.label || draft.issuer || draft.username || 'インポート',
        secret: draft.secret,
        algorithm: draft.algorithm || 'SHA-1',
        digits: draft.digits || 6,
        period: draft.period || 30,
      },
    });
  }
  renderResults();

  const okCount = parsed.length;
  if (okCount > 0) {
    setStatus(`${okCount} 件を読み取りました${errors.length ? ` / ${errors.length} 件失敗` : ''}`, 'ok');
  } else {
    setStatus(errors[0] || '読み取れませんでした', 'error');
  }
}

// ---------------------------------------------------------------------------
// ペースト
// ---------------------------------------------------------------------------

$('parseBtn').addEventListener('click', () => {
  const { results: parsed, errors } = parseAnyInput($('pasteArea').value);
  addParsed(parsed, errors);
});

$('demoBtn').addEventListener('click', () => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let secret = '';
  for (let i = 0; i < 32; i++) {
    secret += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  $('pasteArea').value = `otpauth://totp/Demo:user@example.com?secret=${secret}&issuer=Demo&algorithm=SHA1&digits=6&period=30`;
  setStatus('サンプルを入れました。「解析」を押してください。');
});

// ---------------------------------------------------------------------------
// タブ
// ---------------------------------------------------------------------------

function selectTab(name) {
  for (const tab of ['Paste', 'Image', 'Camera']) {
    $(`tab${tab}`).classList.toggle('active', tab.toLowerCase() === name);
    $(`panel${tab}`).classList.toggle('hidden', tab.toLowerCase() !== name);
  }
  if (name !== 'camera') stopCamera();
}

$('tabPaste').addEventListener('click', () => selectTab('paste'));
$('tabImage').addEventListener('click', () => selectTab('image'));
$('tabCamera').addEventListener('click', () => selectTab('camera'));

// ---------------------------------------------------------------------------
// 画像
// ---------------------------------------------------------------------------

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('画像を読み込めません'));
    image.src = url;
  });
}

async function decodeImageFile(file) {
  if (!decoder) throw new Error('QR デコーダが読み込まれていません');

  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const found = decoder(pixels.data, pixels.width, pixels.height, {
      inversionAttempts: 'attemptBoth',
    });
    return found ? found.data : null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

$('imageFile').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;

  setStatus('QR コードを探しています…');
  try {
    const text = await decodeImageFile(file);
    if (!text) {
      setStatus('QR コードが見つかりませんでした', 'error');
      return;
    }
    const { results: parsed, errors } = parseAnyInput(text);
    addParsed(parsed, errors);
  } catch (error) {
    setStatus(error.message, 'error');
  }
});

// ---------------------------------------------------------------------------
// カメラ
// ---------------------------------------------------------------------------

let stream = null;
let rafId = null;
let frameCount = 0;

const video = $('camera');
const canvas = document.createElement('canvas');
const context = canvas.getContext('2d', { willReadFrequently: true });

function stopCamera() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  if (stream) {
    for (const track of stream.getTracks()) track.stop();
    stream = null;
  }
  video.srcObject = null;
  $('cameraHint').classList.remove('hidden');
  $('cameraHint').textContent = 'カメラは停止しています';
}

function scanFrame() {
  if (!stream) return;
  rafId = requestAnimationFrame(scanFrame);

  if (video.readyState !== video.HAVE_ENOUGH_DATA) return;
  frameCount += 1;
  if (frameCount % 3 !== 0) return;

  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return;

  canvas.width = width;
  canvas.height = height;
  context.drawImage(video, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const found = decoder(pixels.data, pixels.width, pixels.height, {
    inversionAttempts: 'dontInvert',
  });

  if (found && found.data) {
    const text = found.data;
    stopCamera();
    const { results: parsed, errors } = parseAnyInput(text);
    addParsed(parsed, errors);
    if (parsed.length) navigator.vibrate?.(40);
  }
}

$('cameraStart').addEventListener('click', async () => {
  if (!decoder) {
    setStatus('QR デコーダが読み込まれていません', 'error');
    return;
  }
  try {
    stopCamera();
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    $('cameraHint').classList.add('hidden');
    setStatus('QR コードを読み取っています…');
    frameCount = 0;
    scanFrame();
  } catch (error) {
    setStatus(`カメラを起動できません: ${error.message}`, 'error');
  }
});

$('cameraStop').addEventListener('click', () => {
  stopCamera();
  setStatus('カメラを停止しました');
});

// ---------------------------------------------------------------------------
// 取り込み
// ---------------------------------------------------------------------------

$('selectAll').addEventListener('change', (event) => {
  for (const entry of results) entry.selected = event.target.checked;
  renderResults();
});

$('importBtn').addEventListener('click', async () => {
  const drafts = results.filter((entry) => entry.selected).map((entry) => entry.draft);
  if (drafts.length === 0) {
    setStatus('追加するものを選択してください', 'error');
    return;
  }

  $('importBtn').disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'import:batch', drafts });
    if (!response?.ok) throw new Error(response?.error || 'インポートに失敗しました');

    const { added, skipped } = response.result;
    results = results.filter((entry) => !entry.selected || skipped.some((s) => s.label === entry.draft.label));
    renderResults();

    const lines = [`${added.length} 件を追加しました`];
    if (skipped.length) {
      lines.push(`${skipped.length} 件スキップ:`);
      for (const item of skipped.slice(0, 5)) lines.push(`・${item.label}: ${item.reason}`);
    }
    setStatus(lines.join('\n'), added.length ? 'ok' : 'error');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    $('importBtn').disabled = false;
  }
});

window.addEventListener('beforeunload', stopCamera);
