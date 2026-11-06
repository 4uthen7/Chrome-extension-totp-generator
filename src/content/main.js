/* global chrome */
(() => {
  'use strict';

  if (window.__totpRunnerInjected) return;
  window.__totpRunnerInjected = true;

  const isTopFrame = window === window.top;
  const hostname = location.hostname;

  // 極端に小さい iframe（広告枠など）では動かさない
  if (!hostname || window.innerWidth < 220 || window.innerHeight < 140) return;

  let modules = null;
  let activeTarget = null;
  let prefs = { autoFillSingle: false, suggestions: true };
  let fillInFlight = false;

  // -------------------------------------------------------------------------
  // メッセージ
  // -------------------------------------------------------------------------

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

  function reportDetected(found) {
    try {
      chrome.runtime.sendMessage({ type: 'otp:detected', found });
    } catch {
      /* 拡張が更新された直後など */
    }
  }

  // -------------------------------------------------------------------------
  // クリップボード
  // -------------------------------------------------------------------------

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* フォールバックへ */
    }
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.cssText = 'position:fixed;top:-1000px;opacity:0;';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // パネル
  // -------------------------------------------------------------------------


  async function handleCandidate(input) {
    if (!modules) return;

    const target = modules.detect.resolveOtpTarget(input);
    if (!target) return;
    activeTarget = target;

    const context = modules.detect.readLoginContext();
    let ranking;
    try {
      ranking = await send('rank:get', {
        hostname,
        username: context.username,
        pageText: context.pageText,
      });
    } catch {
      return;
    }

    if (ranking.excluded) return;
    if (!ranking.items.length && !ranking.hasAccounts) return;
    if (!prefs.suggestions) return;

    reportDetected(true);

    if (prefs.autoFillSingle && ranking.items.length === 1 && !ranking.locked) {
      try {
        const entry = await send('code:get', { accountId: ranking.items[0].id });
        modules.fill.fillTarget(target, entry.code);
        send('record:use', { accountId: ranking.items[0].id }).catch(() => {});
        if (isTopFrame) await copyText(entry.code).catch(() => {});
        return;
      } catch {
        /* パネル表示にフォールバック */
      }
    }

    modules.ui.openPanel({
      anchor: target.anchor,
      items: ranking.items,
      hostname,
      locked: Boolean(ranking.locked),
      hasAccounts: Boolean(ranking.hasAccounts),
      excluded: Boolean(ranking.excluded),
    });
  }

  async function fetchCode(accountId) {
    const result = await send('code:get', { accountId });
    return {
      ...result,
      display: modules.totp.formatCode(result.code, result.type),
    };
  }

  async function onFill(item, entry) {
    if (!activeTarget || fillInFlight) return;
    fillInFlight = true;
    try {
      const ok = modules.fill.fillTarget(activeTarget, entry.code);
      if (ok) {
        send('record:use', { accountId: item.id }).catch(() => {});
        reportDetected(false);
      } else {
        await copyText(entry.code);
      }
    } finally {
      fillInFlight = false;
    }
  }

  // -------------------------------------------------------------------------
  // パレット
  // -------------------------------------------------------------------------

  async function openPalette() {
    if (!modules) return;
    let payload;
    try {
      payload = await send('palette:get');
    } catch {
      return;
    }

    const items = (payload.items || []).map((item) => ({ ...item, sites: item.sites || [] }));

    await Promise.all(
      items.slice(0, 30).map(async (item) => {
        try {
          const entry = await send('code:get', { accountId: item.id, explicit: true });
          item.cachedCode = modules.totp.formatCode(entry.code, entry.type);
        } catch {
          item.cachedCode = '';
        }
      }),
    );

    const focused = document.activeElement;
    const fillable = focused instanceof HTMLInputElement ? modules.detect.resolveOtpTarget(focused) : null;
    const target = fillable || activeTarget;

    modules.ui.openPalette({
      items,
      hostname,
      locked: Boolean(payload.locked),
      onPick: async (item) => {
        try {
          const entry = await send('code:get', { accountId: item.id, explicit: true });
          if (target && target.fields.some((field) => field.isConnected)) {
            modules.fill.fillTarget(target, entry.code);
            activeTarget = target;
            send('record:use', { accountId: item.id }).catch(() => {});
          } else {
            await copyText(entry.code);
          }
          if (!item.bound) {
            send('site:bind', { accountId: item.id }).catch(() => {});
          }
        } catch {
          /* ロック中など */
        }
      },
    });
  }

  // -------------------------------------------------------------------------
  // 初期化
  // -------------------------------------------------------------------------

  async function boot() {
    const url = (path) => chrome.runtime.getURL(path);
    const [detect, fill, ui, totp] = await Promise.all([
      import(url('src/content/detect.js')),
      import(url('src/content/fill.js')),
      import(url('src/content/ui.js')),
      import(url('src/lib/totp.js')),
    ]);

    modules = { detect, fill, ui, totp };

    ui.initUi({
      fetchCode,
      onFill,
      onOpenPopup: () => {
        send('popup:open').catch(() => {});
      },
    });

    try {
      const ranking = await send('rank:get', { hostname });
      prefs = {
        suggestions: true,
        ...(ranking.prefs || {}),
      };
    } catch {
      /* 既定値で継続 */
    }

    document.addEventListener(
      'focusin',
      (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        window.setTimeout(() => handleCandidate(target), 80);
      },
      true,
    );

    document.addEventListener(
      'focusout',
      () => {
        window.setTimeout(() => {
          if (!modules.ui.isPanelOpen() || modules.ui.isPaletteOpen()) return;
          const focused = document.activeElement;
          if (focused instanceof HTMLInputElement && modules.detect.resolveOtpTarget(focused)) return;
          modules.ui.closePanel();
          reportDetected(false);
        }, 140);
      },
      true,
    );

    document.addEventListener(
      'input',
      (event) => {
        if (!modules.ui.isPanelOpen()) return;
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (target.value.length >= 6) {
          modules.ui.closePanel();
          reportDetected(false);
        }
      },
      true,
    );

    chrome.runtime.onMessage.addListener((message) => {
      if (message && message.type === 'palette:open') {
        openPalette();
      }
      return false;
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        modules.ui.closePanel();
        reportDetected(false);
      }
    });

    window.addEventListener(
      'pagehide',
      () => {
        modules.ui.closePanel();
        reportDetected(false);
      },
      { once: true },
    );
  }

  boot().catch(() => {
    /* ページ側の事情で読み込めない場合は静かに諦める */
  });
})();
