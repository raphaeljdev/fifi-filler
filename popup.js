// popup.js

const FIELDS = [
  'firstName','lastName','email','phone','password',
  'address','city','state','zip',
  'cpf','dateOfBirth','cie','validityDate','institutionName','course'
];

let activeProfile = 1; // 1 or 2

// ── Password show/hide toggle ──
document.getElementById('pwToggle').addEventListener('click', () => {
  const input = document.getElementById('password');
  const btn = document.getElementById('pwToggle');
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁️';
  }
});

function storageKey(field) {
  return `p${activeProfile}_${field}`;
}

function showFlash(msg, color = '#00c37d') {
  const el = document.getElementById('flash');
  el.textContent = msg;
  el.style.background = color;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

function loadProfile(profileNum) {
  const keys = FIELDS.map(f => `p${profileNum}_${f}`);
  chrome.storage.local.get(keys, (data) => {
    FIELDS.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = data[`p${profileNum}_${id}`] || '';
    });
  });
}

function saveCurrentProfile(callback) {
  const data = {};
  FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) data[storageKey(id)] = el.value.trim();
  });
  chrome.storage.local.set(data, callback);
}

// ── Init ──
chrome.storage.local.get(['activeProfile', 'autoFill', 'saveProfile'], (data) => {
  activeProfile = data.activeProfile || 1;
  updateProfileUI();
  loadProfile(activeProfile);

  if (data.autoFill !== undefined) document.getElementById('autoFill').checked = data.autoFill;
  if (data.saveProfile !== undefined) document.getElementById('saveProfile').checked = data.saveProfile;
});

function updateProfileUI() {
  document.querySelectorAll('.profile-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.profile) === activeProfile);
  });
  document.getElementById('profileLabel').textContent = `Perfil ${activeProfile}`;
}

// ── Profile switcher ──
document.querySelectorAll('.profile-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const newProfile = parseInt(btn.dataset.profile);
    if (newProfile === activeProfile) return;

    saveCurrentProfile(() => {
      activeProfile = newProfile;
      chrome.storage.local.set({ activeProfile });
      updateProfileUI();
      loadProfile(activeProfile);
      showFlash(`✓ Perfil ${activeProfile} carregado`);
    });
  });
});

// ── Check if on Website ──
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  const url = tab?.url || '';
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');

  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) {
    text.textContent = 'Nenhuma página detectada';
    return;
  }

  chrome.scripting.executeScript(
    {
      target: { tabId: tab.id },
      func: () => {
        const inputs = document.querySelectorAll(
          'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea, select'
        );
        return inputs.length;
      }
    },
    (results) => {
      if (chrome.runtime.lastError || !results?.[0]) return;
      const fieldCount = results[0].result || 0;
      if (fieldCount > 0) {
        dot.classList.add('active');
        text.textContent = `Website detectado ✓`;
        text.style.color = '#00c37d';
      } else {
        text.textContent = 'Nenhum formulário encontrado';
        text.style.color = '#e09a00';
      }
    }
  );
});

// ── Save ──
document.getElementById('saveBtn').addEventListener('click', () => {
  saveCurrentProfile(() => showFlash(`✓ Perfil ${activeProfile} salvo!`));
});

// ── Clear ──
document.getElementById('clearBtn').addEventListener('click', () => {
  FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const keys = FIELDS.map(f => storageKey(f));
  chrome.storage.local.remove(keys, () => showFlash('🗑️ Campos limpos', '#e05555'));
});

// ── Toggles ──
document.getElementById('autoFill').addEventListener('change', (e) => {
  chrome.storage.local.set({ autoFill: e.target.checked });
});
document.getElementById('saveProfile').addEventListener('change', (e) => {
  chrome.storage.local.set({ saveProfile: e.target.checked });
});

// ── Fill Now ──
document.getElementById('fillBtn').addEventListener('click', () => {
  const profile = {};
  FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) profile[id] = el.value.trim();
  });

  const hasData = Object.values(profile).some(v => v.length > 0);
  if (!hasData) {
    showFlash('⚠️ Preencha seus dados primeiro', '#e09a00');
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id) return;

    function handleResponse(response) {
      const count = response?.filled || 0;
      showFlash(
        count > 0 ? `⚡ ${count} campo(s) preenchido(s)!` : '⚠️ Nenhum campo encontrado',
        count > 0 ? '#00c37d' : '#e09a00'
      );
    }

    chrome.tabs.sendMessage(tab.id, { action: 'fillForms', profile }, (response) => {
      if (chrome.runtime.lastError) {
        chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }, () => {
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, { action: 'fillForms', profile }, handleResponse);
          }, 400);
        });
      } else {
        handleResponse(response);
      }
    });
  });

  if (document.getElementById('saveProfile').checked) {
    saveCurrentProfile();
  }
});
