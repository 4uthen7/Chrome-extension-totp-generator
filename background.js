async function generateTOTP(secret, timeStep = 30) {
  const key = base32Decode(secret);
  const time = Math.floor(Date.now() / 1000 / timeStep);
  const timeBuffer = new ArrayBuffer(8);
  const timeView = new DataView(timeBuffer);
  timeView.setUint32(4, time);
  
  const keyData = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', keyData, timeBuffer);
  const signatureArray = new Uint8Array(signature);
  const offset = signatureArray[signatureArray.length - 1] & 0x0f;
  
  const code = (
    ((signatureArray[offset] & 0x7f) << 24) |
    ((signatureArray[offset + 1] & 0xff) << 16) |
    ((signatureArray[offset + 2] & 0xff) << 8) |
    (signatureArray[offset + 3] & 0xff)
  ) % 1000000;
  
  return code.toString().padStart(6, '0');
}

function base32Decode(base32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  base32 = base32.toUpperCase().replace(/=+$/, '');
  
  let bits = '';
  for (let i = 0; i < base32.length; i++) {
    const val = alphabet.indexOf(base32[i]);
    bits += val.toString(2).padStart(5, '0');
  }
  
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.substr(i * 8, 8), 2);
  }
  
  return bytes;
}

async function sendNotification(accounts) {
  const codes = [];
  
  for (const account of accounts) {
    try {
      const code = await generateTOTP(account.secret);
      codes.push(`${account.name}: ${code}`);
    } catch (error) {
      console.error('コード生成エラー:', error);
    }
  }
  
  if (codes.length > 0) {
    chrome.notifications.create({
      type: 'basic',
      title: '認証コード',
      message: codes.join('\n'),
      priority: 2
    });
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'authNotification') {
    const data = await chrome.storage.local.get(['accounts', 'enabled']);
    if (data.enabled && data.accounts && data.accounts.length > 0) {
      await sendNotification(data.accounts);
    }
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    accounts: [],
    enabled: false,
    darkMode: false,
    interval: 30
  });
});