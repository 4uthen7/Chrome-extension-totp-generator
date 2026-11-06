/**
 * React / Vue / Angular の controlled input に値を入れる。
 * インスタンス側の value setter を迂回するため、プロトタイプの setter を直接呼ぶ。
 */
export function setNativeValue(el, value) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  if (!descriptor || !descriptor.set) {
    el.value = value;
    return;
  }

  // React 18 系で change が拾われない場合の保険
  if (el._valueTracker && typeof el._valueTracker.setValue === 'function') {
    try {
      el._valueTracker.setValue('');
    } catch {
      /* 無視 */
    }
  }

  descriptor.set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function insertTextFallback(el, value) {
  try {
    el.focus();
    el.select?.();
    if (document.execCommand('insertText', false, value)) return true;
  } catch {
    /* 無視 */
  }
  return false;
}

function fillSingle(el, code) {
  el.focus();
  const before = el.value;
  setNativeValue(el, code);
  if (el.value !== code) {
    // サイト側のリスナが値を戻した場合は挿入イベントで再挑戦
    if (!insertTextFallback(el, code)) {
      el.value = code;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  if (before !== el.value) {
    el.dispatchEvent(new Event('keyup', { bubbles: true, key: code.at(-1) || '' }));
  }
}

function fillSplit(fields, code) {
  const digits = [...code];
  fields.forEach((el, index) => {
    if (index >= digits.length) return;
    insertTextFallback(el, digits[index]);
    if (el.value !== digits[index]) setNativeValue(el, digits[index]);
    el.dispatchEvent(new KeyboardEvent('keyup', { key: digits[index], bubbles: true }));
  });

  const last = fields[Math.min(digits.length, fields.length) - 1];
  if (last) last.focus();
}

/** @returns {boolean} 入力できたか */
export function fillTarget(target, code) {
  if (!target) return false;
  if (target.mode === 'single') {
    const el = target.fields[0];
    if (!el || !el.isConnected) return false;
    fillSingle(el, code);
    return el.value === code;
  }
  fillSplit(target.fields, code);
  return true;
}
