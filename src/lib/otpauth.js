import { base32Encode, isValidBase32, normalizeSecret } from './base32.js';

const ALGO_MAP = {
  SHA1: 'SHA-1',
  'SHA-1': 'SHA-1',
  SHA256: 'SHA-256',
  'SHA-256': 'SHA-256',
  SHA512: 'SHA-512',
  'SHA-512': 'SHA-512',
};

function normalizeAlgorithm(value) {
  const key = String(value || 'SHA-1').toUpperCase().replace(/\s/g, '');
  return ALGO_MAP[key] || 'SHA-1';
}

/** "Issuer:account" / "account" を分解する */
function splitLabel(label, issuerParam) {
  const raw = String(label || '').trim();
  if (!raw) return { issuer: issuerParam || '', username: '' };
  const idx = raw.indexOf(':');
  if (idx > 0) {
    const left = raw.slice(0, idx).trim();
    const right = raw.slice(idx + 1).trim();
    return { issuer: issuerParam || left, username: right };
  }
  return { issuer: issuerParam || '', username: raw };
}

/**
 * otpauth:// URI を 1 件のアカウント草案に変換する。
 * @returns {{type: string, issuer: string, username: string, label: string,
 *            secret: string, algorithm: string, digits: number, period: number, counter: number}}
 */
export function parseOtpauthUri(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('空の入力です');

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('URI として解釈できません');
  }

  if (url.protocol === 'otpauth-migration:') {
    throw new Error('migration URI は parseMigrationUri で処理してください');
  }
  if (url.protocol !== 'otpauth:') {
    throw new Error('otpauth:// 形式ではありません');
  }

  const schemeType = (url.host || '').toLowerCase();
  const params = url.searchParams;
  const secret = normalizeSecret(params.get('secret') || '');

  if (!secret) throw new Error('secret パラメータがありません');
  if (!isValidBase32(secret)) throw new Error('secret が Base32 として不正です');

  const { issuer, username } = splitLabel(
    decodeURIComponent(url.pathname.replace(/^\//, '')),
    params.get('issuer') || '',
  );

  const typeParam = (params.get('type') || '').toLowerCase();
  const type = schemeType === 'steam' || typeParam === 'steam' ? 'steam' : 'totp';

  const digitsRaw = Number(params.get('digits'));
  const periodRaw = Number(params.get('period'));

  return {
    type,
    issuer: issuer.trim(),
    username: username.trim(),
    label: '',
    secret,
    algorithm: normalizeAlgorithm(params.get('algorithm')),
    digits: type === 'steam' ? 5 : [6, 7, 8].includes(digitsRaw) ? digitsRaw : 6,
    period: periodRaw >= 1 && periodRaw <= 300 ? periodRaw : 30,
    counter: Number(params.get('counter')) || 0,
  };
}

export function buildOtpauthUri(account) {
  const issuer = account.issuer || '';
  const accountName = account.username || account.label || 'account';
  const label = issuer ? `${issuer}:${accountName}` : accountName;
  const params = new URLSearchParams();
  params.set('secret', normalizeSecret(account.secret));
  if (issuer) params.set('issuer', issuer);
  if (account.algorithm && account.algorithm !== 'SHA-1') {
    params.set('algorithm', account.algorithm.replace('-', ''));
  }
  if (account.type === 'steam') {
    params.set('digits', '5');
  } else if (account.digits && account.digits !== 6) {
    params.set('digits', String(account.digits));
  }
  if (account.period && account.period !== 30) params.set('period', String(account.period));
  const scheme = account.type === 'steam' ? 'steam' : 'totp';
  return `otpauth://${scheme}/${encodeURIComponent(label)}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Google Authenticator の otpauth-migration:// を読むための最小 protobuf リーダ
// ---------------------------------------------------------------------------

class ProtoReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.pos = 0;
  }

  eof() {
    return this.pos >= this.bytes.length;
  }

  varint() {
    let result = 0;
    let shift = 0;
    while (true) {
      if (this.pos >= this.bytes.length) throw new Error('protobuf: 予期しない終端');
      const byte = this.bytes[this.pos++];
      result += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) return result;
      shift += 7;
      if (shift > 63) throw new Error('protobuf: varint が長すぎます');
    }
  }

  lengthDelimited() {
    const length = this.varint();
    if (this.pos + length > this.bytes.length) throw new Error('protobuf: 長さが範囲外');
    const slice = this.bytes.subarray(this.pos, this.pos + length);
    this.pos += length;
    return slice;
  }

  skip(wireType) {
    if (wireType === 0) this.varint();
    else if (wireType === 1) this.pos += 8;
    else if (wireType === 2) this.lengthDelimited();
    else if (wireType === 5) this.pos += 4;
    else throw new Error(`protobuf: 未対応の wire type ${wireType}`);
  }
}

function decodeBase64Url(input) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function parseOtpParameters(bytes) {
  const reader = new ProtoReader(bytes);
  const entry = {
    secret: '',
    username: '',
    issuer: '',
    algorithm: 'SHA-1',
    digits: 6,
    type: 'totp',
    counter: 0,
  };

  while (!reader.eof()) {
    const tag = reader.varint();
    const field = tag >>> 3;
    const wire = tag & 0x7;

    if (field === 1 && wire === 2) {
      entry.secret = base32Encode(reader.lengthDelimited());
    } else if (field === 2 && wire === 2) {
      entry.username = new TextDecoder().decode(reader.lengthDelimited());
    } else if (field === 3 && wire === 2) {
      entry.issuer = new TextDecoder().decode(reader.lengthDelimited());
    } else if (field === 4 && wire === 0) {
      const value = reader.varint();
      entry.algorithm = ['SHA-1', 'SHA-1', 'SHA-256', 'SHA-512', 'MD5'][value] || 'SHA-1';
    } else if (field === 5 && wire === 0) {
      const value = reader.varint();
      entry.digits = value === 2 ? 8 : 6;
    } else if (field === 6 && wire === 0) {
      entry.type = reader.varint() === 2 ? 'totp' : 'hotp';
    } else if (field === 7 && wire === 0) {
      entry.counter = reader.varint();
    } else {
      reader.skip(wire);
    }
  }

  if (entry.username.includes(':')) {
    const [issuer, name] = entry.username.split(':');
    entry.issuer = entry.issuer || issuer.trim();
    entry.username = name.trim();
  }
  return entry;
}

/**
 * otpauth-migration://offline?data=... を配列に変換する。
 */
export function parseMigrationUri(input) {
  let url;
  try {
    url = new URL(String(input).trim());
  } catch {
    throw new Error('migration URI として解釈できません');
  }
  const data = url.searchParams.get('data');
  if (!data) throw new Error('data パラメータがありません');

  const bytes = decodeBase64Url(data);
  const reader = new ProtoReader(bytes);
  const entries = [];

  while (!reader.eof()) {
    const tag = reader.varint();
    const field = tag >>> 3;
    const wire = tag & 0x7;
    if (field === 1 && wire === 2) {
      entries.push(parseOtpParameters(reader.lengthDelimited()));
    } else {
      reader.skip(wire);
    }
  }

  if (entries.length === 0) throw new Error('移行データにアカウントが含まれていません');
  return entries.map((entry) => ({
    ...entry,
    label: '',
    period: 30,
    digits: entry.type === 'steam' ? 5 : entry.digits,
  }));
}

/**
 * 入力テキストから取り込めるものを全部拾う。
 * - otpauth:// (複数行)
 * - otpauth-migration://
 * - 裸の Base32 (issuer/username は空)
 */
export function parseAnyInput(text) {
  const source = String(text || '');
  const results = [];
  const errors = [];

  const uriMatches = source.match(/otpauth(?:-migration)?:\/\/[^\s"'<>]+/gi) || [];
  for (const uri of uriMatches) {
    try {
      if (/^otpauth-migration:/i.test(uri)) {
        results.push(...parseMigrationUri(uri));
      } else {
        results.push(parseOtpauthUri(uri));
      }
    } catch (error) {
      errors.push(`${uri.slice(0, 40)}…: ${error.message}`);
    }
  }

  if (uriMatches.length === 0) {
    const candidate = normalizeSecret(source);
    if (candidate && /^[A-Z2-7]+$/.test(candidate) && candidate.length >= 16) {
      results.push({
        type: 'totp',
        issuer: '',
        username: '',
        label: '',
        secret: candidate,
        algorithm: 'SHA-1',
        digits: 6,
        period: 30,
        counter: 0,
      });
    } else {
      errors.push('otpauth:// URI も Base32 シークレットも見つかりませんでした');
    }
  }

  return { results, errors };
}
