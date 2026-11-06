const PANEL_CSS = `
:host { all: initial; }
* { box-sizing: border-box; margin: 0; padding: 0; }
.panel {
  position: fixed;
  min-width: 272px;
  max-width: 380px;
  padding: 6px;
  background: #ffffff;
  color: #131720;
  border: 1px solid rgba(19, 23, 32, .10);
  border-radius: 12px;
  box-shadow: 0 14px 36px rgba(19, 23, 32, .18), 0 2px 6px rgba(19, 23, 32, .08);
  font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif;
  z-index: 2147483647;
  opacity: 0;
  transform: translateY(-4px);
  transition: opacity .12s ease, transform .12s ease;
}
.panel.ready { opacity: 1; transform: translateY(0); }
.panel.dark {
  background: #1c2029; color: #e8ecf4;
  border-color: rgba(255,255,255,.10);
  box-shadow: 0 14px 36px rgba(0,0,0,.45), 0 2px 6px rgba(0,0,0,.3);
}
.head {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 8px 6px; font-size: 11px; font-weight: 600;
  letter-spacing: .02em; color: #6b7280; text-transform: none;
}
.panel.dark .head { color: #9aa4b8; }
.head .dot { width: 6px; height: 6px; border-radius: 50%; background: #1a73e8; flex: none; }
.head .host { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.head .pill {
  margin-left: auto; padding: 1px 6px; border-radius: 999px;
  background: rgba(26,115,232,.10); color: #1a73e8; font-size: 10px; font-weight: 700;
}
.panel.dark .head .pill { background: rgba(138,180,248,.16); color: #8ab4f8; }
.rows { display: flex; flex-direction: column; gap: 2px; }
.row {
  display: flex; align-items: center; gap: 9px;
  padding: 7px 8px; border-radius: 8px; cursor: pointer;
  transition: background .1s ease;
}
.row:hover, .row.sel { background: rgba(26,115,232,.09); }
.panel.dark .row:hover, .panel.dark .row.sel { background: rgba(138,180,248,.14); }
.row.used { opacity: .55; }
.avatar {
  width: 24px; height: 24px; border-radius: 7px; flex: none;
  display: flex; align-items: center; justify-content: center;
  background: rgba(26,115,232,.12); color: #1a73e8;
  font-size: 12px; font-weight: 700; text-transform: uppercase;
}
.panel.dark .avatar { background: rgba(138,180,248,.16); color: #8ab4f8; }
.meta { flex: 1; min-width: 0; }
.name {
  font-size: 13px; font-weight: 600; line-height: 1.2;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sub {
  font-size: 11px; color: #6b7280; line-height: 1.3;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.panel.dark .sub { color: #9aa4b8; }
.code {
  font: 600 14px/1 ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  letter-spacing: .06em; flex: none;
}
.code.pending { color: #9aa4b8; }
.ring { width: 16px; height: 16px; flex: none; transform: rotate(-90deg); }
.ring .track { fill: none; stroke: rgba(19,23,32,.12); stroke-width: 2.5; }
.ring .bar { fill: none; stroke: #1a73e8; stroke-width: 2.5; stroke-linecap: round; transition: stroke-dashoffset .25s linear; }
.panel.dark .ring .track { stroke: rgba(255,255,255,.14); }
.panel.dark .ring .bar { stroke: #8ab4f8; }
.ring.warn .bar { stroke: #e8710a; }
.foot {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 8px 2px; font-size: 10px; color: #9aa4b8;
}
.foot .brand { margin-left: auto; font-weight: 600; letter-spacing: .04em; }
.foot kbd {
  font: inherit; padding: 0 3px; border-radius: 3px;
  background: rgba(19,23,32,.07);
}
.panel.dark .foot kbd { background: rgba(255,255,255,.10); }
.hint {
  display: flex; align-items: center; gap: 9px; padding: 9px 10px;
  border-radius: 8px; cursor: pointer;
}
.hint:hover { background: rgba(26,115,232,.09); }
.panel.dark .hint:hover { background: rgba(138,180,248,.14); }
.hint .title { font-size: 12.5px; font-weight: 600; }
.hint .desc { font-size: 11px; color: #6b7280; }
.panel.dark .hint .desc { color: #9aa4b8; }
`;

const PALETTE_CSS = `
:host { all: initial; }
* { box-sizing: border-box; margin: 0; padding: 0; }
.scrim {
  position: fixed; inset: 0; background: rgba(15, 18, 25, .32);
  backdrop-filter: blur(2px); z-index: 2147483646;
}
.sheet {
  position: fixed; left: 50%; top: 18%; transform: translateX(-50%);
  width: min(460px, calc(100vw - 32px));
  background: #ffffff; color: #131720;
  border: 1px solid rgba(19,23,32,.10); border-radius: 14px;
  box-shadow: 0 24px 64px rgba(19,23,32,.3);
  font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif;
  overflow: hidden; z-index: 2147483647;
}
.sheet.dark { background: #1c2029; color: #e8ecf4; border-color: rgba(255,255,255,.10); }
.search {
  width: 100%; padding: 14px 16px; border: none; outline: none;
  font: 600 15px/1.2 inherit; color: inherit; background: transparent;
  border-bottom: 1px solid rgba(19,23,32,.08);
}
.sheet.dark .search { border-bottom-color: rgba(255,255,255,.10); }
.list { max-height: 46vh; overflow-y: auto; padding: 6px; }
.item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border-radius: 8px; cursor: pointer;
}
.item:hover, .item.sel { background: rgba(26,115,232,.09); }
.sheet.dark .item:hover, .sheet.dark .item.sel { background: rgba(138,180,248,.14); }
.item .avatar {
  width: 26px; height: 26px; border-radius: 7px; flex: none;
  display: flex; align-items: center; justify-content: center;
  background: rgba(26,115,232,.12); color: #1a73e8; font-size: 12px; font-weight: 700;
}
.item .meta { flex: 1; min-width: 0; }
.item .name { font-size: 13px; font-weight: 600; }
.item .sub { font-size: 11px; color: #6b7280; }
.sheet.dark .item .sub { color: #9aa4b8; }
.item .code { font: 600 13px/1 ui-monospace, Menlo, Consolas, monospace; letter-spacing: .05em; }
.item .tag {
  font-size: 10px; padding: 2px 6px; border-radius: 999px;
  background: rgba(232,113,10,.12); color: #b45309;
}
.empty { padding: 20px 16px; font-size: 12px; color: #6b7280; text-align: center; }
.footer {
  display: flex; gap: 10px; padding: 8px 14px; font-size: 10px; color: #9aa4b8;
  border-top: 1px solid rgba(19,23,32,.08);
}
.sheet.dark .footer { border-top-color: rgba(255,255,255,.10); }
`;

const NS = 'http://www.w3.org/2000/svg';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function prefersDark() {
  try {
    return matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

function makeHost(id, css) {
  const host = document.createElement('div');
  host.id = id;
  host.style.cssText =
    'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'closed' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  root.adoptedStyleSheets = [sheet];
  document.documentElement.appendChild(host);
  return { host, root };
}

function ringSvg() {
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
  bar.style.strokeDashoffset = '0';
  svg.append(track, bar);
  return { svg, bar, circumference };
}

function initialOf(item) {
  const source = item.label || item.issuer || item.username || '?';
  return source.trim().slice(0, 1) || '?';
}

function subtitleOf(item) {
  if (item.username) return item.username;
  if (item.issuer) return item.issuer;
  return item.type === 'steam' ? 'Steam Guard' : 'このサイト';
}

// ---------------------------------------------------------------------------
// 状態
// ---------------------------------------------------------------------------

let config = {
  fetchCode: async () => null,
  onFill: () => {},
  onOpenPopup: () => {},
};

let panel = null;
let panelHost = null;
let panelRoot = null;
let panelState = null;
let ticker = null;
let globalListenersBound = false;

let palette = null;
let paletteHost = null;
let paletteRoot = null;
let paletteState = null;

export function initUi(options) {
  config = { ...config, ...options };
}

export function isPanelOpen() {
  return Boolean(panelState);
}

export function isPaletteOpen() {
  return Boolean(paletteState);
}

// ---------------------------------------------------------------------------
// パネル
// ---------------------------------------------------------------------------

function ensurePanel() {
  if (panelHost && panelHost.isConnected) return;
  const made = makeHost('__totp_runner_panel__', PANEL_CSS);
  panelHost = made.host;
  panelRoot = made.root;
}

function closePanelNow() {
  if (ticker) {
    clearInterval(ticker);
    ticker = null;
  }
  if (panelHost) {
    panelHost.remove();
    panelHost = null;
    panelRoot = null;
  }
  panel = null;
  panelState = null;
}

export function closePanel() {
  closePanelNow();
}

function place() {
  if (!panel || !panelState) return;
  const anchor = panelState.anchor;
  if (!anchor || !anchor.isConnected) {
    closePanelNow();
    return;
  }
  const rect = anchor.getBoundingClientRect();
  if (rect.bottom < -40 || rect.top > innerHeight + 40) {
    closePanelNow();
    return;
  }

  const panelRect = panel.getBoundingClientRect();
  const margin = 8;
  let top = rect.bottom + 8;
  if (top + panelRect.height > innerHeight - margin) {
    top = rect.top - panelRect.height - 8;
    if (top < margin) top = Math.min(innerHeight - panelRect.height - margin, rect.bottom + 8);
  }
  let left = rect.left + Math.min(40, rect.width / 2);
  if (left + panelRect.width > innerWidth - margin) {
    left = Math.max(margin, innerWidth - panelRect.width - margin);
  }
  if (left < margin) left = margin;

  panel.style.top = `${Math.round(top)}px`;
  panel.style.left = `${Math.round(left)}px`;
}

function updateCountdowns() {
  if (!panelState || !panel) return;
  const now = Date.now();
  let needsRefresh = false;

  for (const row of panelState.rows) {
    const entry = panelState.codes.get(row.item.id);
    if (!entry) continue;

    const period = entry.period || 30;
    const remaining = Math.max(0, entry.validUntil - now);
    if (remaining <= 0) {
      needsRefresh = true;
      row.codeEl.classList.add('pending');
      row.codeEl.textContent = '••• •••';
      continue;
    }

    const ratio = remaining / (period * 1000);
    row.bar.style.strokeDashoffset = String(row.circumference * (1 - ratio));
    row.svg.classList.toggle('warn', remaining < 5000);
    row.row.title = `残り ${Math.ceil(remaining / 1000)} 秒`;
  }

  if (needsRefresh) refreshCodes();
}

async function refreshCodes() {
  if (!panelState) return;
  const jobs = panelState.rows.map(async (row) => {
    try {
      const entry = await config.fetchCode(row.item.id);
      if (!entry || !panelState || panelState.rows.indexOf(row) === -1) return;
      panelState.codes.set(row.item.id, entry);
      row.codeEl.textContent = entry.display || entry.code;
      row.codeEl.classList.remove('pending');
    } catch (error) {
      if (panelState && panelState.rows.indexOf(row) !== -1) {
        row.codeEl.textContent = error?.code === 'LOCKED' ? 'ロック中' : '取得失敗';
      }
    }
  });
  await Promise.all(jobs);
  updateCountdowns();
}

function buildRow(item, index) {
  const row = el('div', 'row');
  row.dataset.index = String(index);

  const avatar = el('div', 'avatar', initialOf(item));
  const meta = el('div', 'meta');
  const name = el('div', 'name', item.label || subtitleOf(item));
  const sub = el('div', 'sub', subtitleOf(item));
  meta.append(name, sub);

  const codeEl = el('div', 'code pending', '••• •••');
  const { svg, bar, circumference } = ringSvg();

  row.append(avatar, meta, codeEl, svg);

  row.addEventListener('mousedown', (event) => event.preventDefault());
  row.addEventListener('click', () => {
    if (panelState) commit(index);
  });

  return {
    item,
    row,
    codeEl,
    svg,
    bar,
    circumference,
    originalSub: subtitleOf(item),
  };
}

function commit(index) {
  if (!panelState) return;
  const row = panelState.rows[index];
  if (!row) return;
  const entry = panelState.codes.get(row.item.id);
  if (!entry || !entry.code) return;

  config.onFill(row.item, entry);
  row.row.classList.add('used');
  closePanelNow();
}

function move(delta) {
  if (!panelState || panelState.rows.length === 0) return;
  const count = panelState.rows.length;
  panelState.index = (panelState.index + delta + count) % count;
  panelState.rows.forEach((row, i) => row.row.classList.toggle('sel', i === panelState.index));
  panelState.rows[panelState.index].row.scrollIntoView({ block: 'nearest' });
}

function onDocumentKeydown(event) {
  if (!panelState) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closePanelNow();
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    event.stopPropagation();
    move(1);
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    event.stopPropagation();
    move(-1);
    return;
  }
  if (event.key === 'Enter') {
    if (panelState.rows.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    commit(panelState.index);
    return;
  }
  if (event.key === 'Tab') {
    closePanelNow();
  }
}

function bindGlobalListeners() {
  if (globalListenersBound) return;
  globalListenersBound = true;
  window.addEventListener('keydown', onDocumentKeydown, true);
  window.addEventListener('scroll', () => place(), { capture: true, passive: true });
  window.addEventListener('resize', () => place(), { passive: true });
}

export function openPanel({ anchor, items, hostname, locked, hasAccounts, excluded }) {
  closePanelNow();
  ensurePanel();
  bindGlobalListeners();

  const isDark = prefersDark();
  const wrapper = el('div', isDark ? 'panel dark' : 'panel');

  const head = el('div', 'head');
  head.append(el('span', 'dot'), el('span', 'host', hostname || location.hostname));
  if (items.length > 1) head.append(el('span', 'pill', 'おすすめ'));
  wrapper.append(head);

  if (items.length === 0) {
    const hint = el('div', 'hint');
    const avatar = el('div', 'avatar', '?');
    const meta = el('div', 'meta');
    let title = 'このサイトは未登録';
    let desc = 'クリックしてアカウントを紐付け';
    if (locked) {
      title = 'ロック中';
      desc = 'クリックしてパスフレーズを入力';
    } else if (excluded) {
      title = 'このサイトでは無効';
      desc = '設定で除外されています';
    } else if (!hasAccounts) {
      title = 'アカウント未登録';
      desc = 'クリックして追加';
    }
    meta.append(el('div', 'title', title), el('div', 'desc', desc));
    hint.append(avatar, meta);
    hint.addEventListener('mousedown', (event) => event.preventDefault());
    hint.addEventListener('click', () => {
      config.onOpenPopup();
      closePanelNow();
    });
    wrapper.append(hint);

    panel = wrapper;
    panelRoot.append(wrapper);
    panelState = { anchor, rows: [], codes: new Map(), index: 0, hostname };
    requestAnimationFrame(() => {
      place();
      wrapper.classList.add('ready');
      requestAnimationFrame(place);
    });
    return;
  }

  const list = el('div', 'rows');
  const rows = items.map((item, index) => {
    const built = buildRow(item, index);
    list.append(built.row);
    return built;
  });
  wrapper.append(list);

  const foot = el('div', 'foot');
  const hint = el('span');
  hint.innerHTML = '<kbd>↑</kbd><kbd>↓</kbd> 選択 · <kbd>Enter</kbd> 入力 · <kbd>Esc</kbd>';
  foot.append(hint, el('span', 'brand', 'TOTP Runner'));
  wrapper.append(foot);

  panel = wrapper;
  panelRoot.append(wrapper);
  panelState = { anchor, rows, codes: new Map(), index: 0, hostname };

  rows.forEach((row, i) => row.row.classList.toggle('sel', i === 0));

  requestAnimationFrame(() => {
    place();
    wrapper.classList.add('ready');
    requestAnimationFrame(place);
  });

  if (ticker) clearInterval(ticker);
  ticker = setInterval(updateCountdowns, 250);
  refreshCodes();
}

export function repanel() {
  place();
}

export function setPanelAnchor(anchor) {
  if (panelState) {
    panelState.anchor = anchor;
    place();
  }
}

// ---------------------------------------------------------------------------
// パレット（Alt+Shift+L）
// ---------------------------------------------------------------------------

function closePaletteNow() {
  if (paletteHost) {
    paletteHost.remove();
    paletteHost = null;
    paletteRoot = null;
  }
  palette = null;
  paletteState = null;
}

export function closePalette() {
  closePaletteNow();
}

function buildPalette() {
  const isDark = prefersDark();
  const scrim = el('div', 'scrim');
  const sheet = el('div', isDark ? 'sheet dark' : 'sheet');
  const search = document.createElement('input');
  search.className = 'search';
  search.placeholder = 'アカウントを検索…';
  search.spellcheck = false;

  const list = el('div', 'list');
  const footer = el('div', 'footer');
  footer.innerHTML =
    '<span><kbd>Enter</kbd> 入力/コピー</span><span><kbd>Esc</kbd> 閉じる</span>';

  sheet.append(search, list, footer);
  paletteRoot.append(scrim, sheet);
  return { scrim, sheet, search, list };
}

function renderPaletteItems(filter = '') {
  if (!paletteState) return;
  const query = filter.trim().toLowerCase();
  paletteState.filtered = paletteState.items.filter((item) => {
    if (!query) return true;
    return `${item.label} ${item.issuer} ${item.username} ${item.sites.join(' ')}`
      .toLowerCase()
      .includes(query);
  });
  paletteState.index = 0;

  paletteState.list.textContent = '';
  if (paletteState.filtered.length === 0) {
    paletteState.list.append(el('div', 'empty', '該当するアカウントがありません'));
    return;
  }

  paletteState.filtered.forEach((item, index) => {
    const row = el('div', index === 0 ? 'item sel' : 'item');
    row.append(el('div', 'avatar', initialOf(item)));

    const meta = el('div', 'meta');
    meta.append(el('div', 'name', item.label || subtitleOf(item)));
    meta.append(el('div', 'sub', subtitleOf(item)));
    row.append(meta);

    row.append(el('div', 'code', item.cachedCode || ''));

    if (!item.bound) row.append(el('span', 'tag', '未登録'));

    row.addEventListener('mousedown', (event) => event.preventDefault());
    row.addEventListener('click', () => pickPalette(index));
    paletteState.list.append(row);
  });
}

function movePalette(delta) {
  if (!paletteState || paletteState.filtered.length === 0) return;
  const count = paletteState.filtered.length;
  paletteState.index = (paletteState.index + delta + count) % count;
  [...paletteState.list.children].forEach((child, i) => {
    child.classList.toggle('sel', i === paletteState.index);
  });
}

function pickPalette(index) {
  if (!paletteState) return;
  const item = paletteState.filtered[index];
  if (!item) return;
  const state = paletteState;
  closePaletteNow();
  state.onPick(item);
}

export function openPalette({ items, hostname, locked, onPick }) {
  closePaletteNow();
  closePanelNow();
  if (!paletteHost || !paletteHost.isConnected) {
    const made = makeHost('__totp_runner_palette__', PALETTE_CSS);
    paletteHost = made.host;
    paletteRoot = made.root;
  }

  const { scrim, sheet, search, list } = buildPalette();
  paletteState = { items, filtered: items, index: 0, list, hostname, locked, onPick };

  scrim.addEventListener('mousedown', () => closePaletteNow());

  let composing = false;
  search.addEventListener('compositionstart', () => {
    composing = true;
  });
  search.addEventListener('compositionend', () => {
    composing = false;
    renderPaletteItems(search.value);
  });
  search.addEventListener('input', () => {
    if (!composing) renderPaletteItems(search.value);
  });

  search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closePaletteNow();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      movePalette(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      movePalette(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (!event.isComposing) pickPalette(paletteState.index);
    }
  });

  renderPaletteItems('');
  search.focus();

  if (locked) {
    list.textContent = '';
    list.append(el('div', 'empty', 'ロック中です。ポップアップから解除してください。'));
  }
}

export function isPaletteVisible() {
  return Boolean(paletteState);
}
