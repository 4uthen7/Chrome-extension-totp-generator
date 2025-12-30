let accounts = [];
let updateInterval;
let editingIndex = null;

async function loadAccounts() {
  const data = await chrome.storage.local.get(['accounts', 'enabled', 'darkMode']);
  accounts = data.accounts || [];
  document.getElementById('enableNotifications').checked = data.enabled || false;
  
  if (data.darkMode) {
    document.body.classList.add('dark-mode');
    document.getElementById('themeToggle').textContent = '🌙';
  }
  
  renderAccounts();
}

async function generateTOTP(secret) {
  const key = base32Decode(secret);
  const time = Math.floor(Date.now() / 1000 / 30);
  const timeBuffer = new ArrayBuffer(8);
  const timeView = new DataView(timeBuffer);
  timeView.setUint32(4, time);
  
  const keyData = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
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
    if (val === -1) throw new Error('無効なBase32文字');
    bits += val.toString(2).padStart(5, '0');
  }
  
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.substr(i * 8, 8), 2);
  }
  
  return bytes;
}

async function renderAccounts() {
  const list = document.getElementById('accountsList');
  list.innerHTML = '';
  
  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    const div = document.createElement('div');
    div.className = 'account-item';
    
    try {
      const code = await generateTOTP(account.secret);
      div.innerHTML = `
        <div class="account-header">
          <div class="account-name" data-index="${i}">${account.name}</div>
        </div>
        <div class="code-container">
          <div class="code">${code}</div>
          <button class="copy-btn" data-code="${code}">コピー</button>
          <button class="delete-btn" data-index="${i}">削除</button>
        </div>
      `;
    } catch (error) {
      div.innerHTML = `
        <div class="account-header">
          <div class="account-name" data-index="${i}">${account.name}</div>
        </div>
        <div class="error-text">コード生成エラー</div>
        <button class="delete-btn" data-index="${i}" style="margin-top: 8px;">削除</button>
      `;
    }
    
    list.appendChild(div);
  }
  
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', deleteAccount);
  });
  
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', copyCode);
  });
  
  document.querySelectorAll('.account-name').forEach(name => {
    name.addEventListener('click', startEditName);
  });
}

async function copyCode(e) {
  const code = e.target.dataset.code;
  await navigator.clipboard.writeText(code);
  
  const btn = e.target;
  const originalText = btn.textContent;
  btn.textContent = '✓';
  btn.classList.add('copied');
  
  setTimeout(() => {
    btn.textContent = originalText;
    btn.classList.remove('copied');
  }, 1000);
}

function startEditName(e) {
  const index = parseInt(e.target.dataset.index);
  const nameEl = e.target;
  
  if (editingIndex !== null) return;
  
  editingIndex = index;
  const currentName = accounts[index].name;
  
  nameEl.contentEditable = true;
  nameEl.classList.add('editing');
  nameEl.focus();
  
  const range = document.createRange();
  range.selectNodeContents(nameEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  
  const finishEdit = async () => {
    nameEl.contentEditable = false;
    nameEl.classList.remove('editing');
    
    const newName = nameEl.textContent.trim();
    if (newName && newName !== currentName) {
      accounts[index].name = newName;
      await chrome.storage.local.set({ accounts });
    } else {
      nameEl.textContent = currentName;
    }
    
    editingIndex = null;
  };
  
  nameEl.addEventListener('blur', finishEdit, { once: true });
  nameEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nameEl.blur();
    } else if (e.key === 'Escape') {
      nameEl.textContent = currentName;
      nameEl.blur();
    }
  });
}

async function deleteAccount(e) {
  const index = parseInt(e.target.dataset.index);
  accounts.splice(index, 1);
  await chrome.storage.local.set({ accounts });
  renderAccounts();
}

document.getElementById('addAccount').addEventListener('click', async () => {
  const name = document.getElementById('accountName').value.trim();
  const secret = document.getElementById('secretKey').value.trim().replace(/\s/g, '');
  
  if (!name || !secret) {
    alert('アカウント名とシークレットキーを入力してください');
    return;
  }
  
  try {
    await generateTOTP(secret);
    accounts.push({ name, secret });
    await chrome.storage.local.set({ accounts });
    document.getElementById('accountName').value = '';
    document.getElementById('secretKey').value = '';
    renderAccounts();
  } catch (error) {
    alert('無効なシークレットキーです');
  }
});

document.getElementById('enableNotifications').addEventListener('change', async (e) => {
  const enabled = e.target.checked;
  await chrome.storage.local.set({ enabled });
  
  if (enabled) {
    chrome.alarms.create('authNotification', { periodInMinutes: 0.5 });
  } else {
    chrome.alarms.clear('authNotification');
  }
});

document.getElementById('themeToggle').addEventListener('click', async () => {
  const body = document.body;
  const btn = document.getElementById('themeToggle');
  
  body.classList.toggle('dark-mode');
  const isDark = body.classList.contains('dark-mode');
  
  btn.textContent = isDark ? '🌙' : '☀️';
  await chrome.storage.local.set({ darkMode: isDark });
});

loadAccounts();
updateInterval = setInterval(renderAccounts, 1000);