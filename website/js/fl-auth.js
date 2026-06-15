// ═══════════════════════════════════════════════════════
// FIRST LIGHT — Auth Gate
//   • PIN (4–8 digit) with PBKDF2 hash in IDB
//   • WebAuthn biometric (Face ID / Touch ID on iOS, fingerprint on Android, Windows Hello on desktop)
//   • Runs BEFORE admin-* modules. Blocks the UI until unlock.
//   • Falls back gracefully if WebAuthn not supported.
// ═══════════════════════════════════════════════════════

(function () {
  'use strict';

  const DB_NAME = 'fl-auth';
  const DB_VER = 1;
  const PIN_ATTEMPT_KEY = 'fl_pin_attempts';
  const SESSION_KEY = 'fl_unlock_session';
  const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12h grace after unlock
  const MAX_ATTEMPTS = 5;
  const LOCKOUT_MS = 1000 * 60 * 5; // 5 min lockout after 5 wrong PINs

  // ── IDB ──
  function openDB() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('vault')) db.createObjectStore('vault', { keyPath: 'key' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function vGet(key) {
    const db = await openDB();
    return new Promise((res) => {
      const t = db.transaction('vault', 'readonly');
      const r = t.objectStore('vault').get(key);
      r.onsuccess = () => res(r.result ? r.result.value : null);
      r.onerror = () => res(null);
    });
  }
  async function vPut(key, value) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const t = db.transaction('vault', 'readwrite');
      t.objectStore('vault').put({ key, value });
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  }

  // ── PBKDF2 ──
  async function hashPin(pin, saltBytes) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey('raw', enc.encode(pin), { name: 'PBKDF2' }, false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: saltBytes, iterations: 200000, hash: 'SHA-256' },
      baseKey,
      256
    );
    return new Uint8Array(bits);
  }

  function randomBytes(n) {
    const b = new Uint8Array(n);
    crypto.getRandomValues(b);
    return b;
  }

  function bytesToB64(b) {
    let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s);
  }
  function b64ToBytes(s) {
    const bin = atob(s);
    const b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return b;
  }
  function constEq(a, b) {
    if (a.length !== b.length) return false;
    let r = 0;
    for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
    return r === 0;
  }

  // ── session ──
  function hasFreshSession() {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}');
      return s.until && s.until > Date.now();
    } catch (_) { return false; }
  }
  function markUnlocked() {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ until: Date.now() + SESSION_TTL_MS }));
  }

  // ── WebAuthn (biometric) ──
  function webAuthnAvailable() {
    return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
  }

  async function platformAuthAvailable() {
    if (!webAuthnAvailable()) return false;
    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch (_) { return false; }
  }

  async function biometricRegister() {
    if (!await platformAuthAvailable()) throw new Error('Biometric not available on this device');
    const challenge = randomBytes(32);
    const userId = randomBytes(16);
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'First Light', id: location.hostname },
        user: { id: userId, name: 'firstlight-user', displayName: 'First Light' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
        attestation: 'none',
      },
    });
    if (!cred) throw new Error('Biometric registration cancelled');
    const credIdB64 = bytesToB64(new Uint8Array(cred.rawId));
    await vPut('biometric_cred_id', credIdB64);
    return credIdB64;
  }

  async function biometricVerify() {
    const credIdB64 = await vGet('biometric_cred_id');
    if (!credIdB64) throw new Error('No biometric registered');
    const challenge = randomBytes(32);
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: b64ToBytes(credIdB64), type: 'public-key' }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return !!assertion;
  }

  // ── PIN ──
  async function pinIsSet() {
    return !!(await vGet('pin_hash'));
  }
  async function setPin(pin) {
    if (!/^\d{4,8}$/.test(pin)) throw new Error('PIN must be 4–8 digits');
    const salt = randomBytes(16);
    const hash = await hashPin(pin, salt);
    await vPut('pin_hash', bytesToB64(hash));
    await vPut('pin_salt', bytesToB64(salt));
    localStorage.removeItem(PIN_ATTEMPT_KEY);
  }
  async function verifyPin(pin) {
    const lockUntil = parseInt(localStorage.getItem(PIN_ATTEMPT_KEY + '_lock') || '0', 10);
    if (lockUntil > Date.now()) {
      const mins = Math.ceil((lockUntil - Date.now()) / 60000);
      throw new Error(`Locked. Try again in ${mins} min.`);
    }
    const saltB64 = await vGet('pin_salt');
    const hashB64 = await vGet('pin_hash');
    if (!saltB64 || !hashB64) throw new Error('No PIN set');
    const got = await hashPin(pin, b64ToBytes(saltB64));
    const ok = constEq(got, b64ToBytes(hashB64));
    if (!ok) {
      const attempts = (parseInt(localStorage.getItem(PIN_ATTEMPT_KEY) || '0', 10)) + 1;
      localStorage.setItem(PIN_ATTEMPT_KEY, String(attempts));
      if (attempts >= MAX_ATTEMPTS) {
        localStorage.setItem(PIN_ATTEMPT_KEY + '_lock', String(Date.now() + LOCKOUT_MS));
        localStorage.setItem(PIN_ATTEMPT_KEY, '0');
        throw new Error(`Too many wrong PINs. Locked 5 min.`);
      }
      throw new Error(`Wrong PIN. ${MAX_ATTEMPTS - attempts} left.`);
    }
    localStorage.removeItem(PIN_ATTEMPT_KEY);
    return true;
  }

  // ── UI ──
  function buildGate() {
    const wrap = document.createElement('div');
    wrap.id = 'fl-auth-gate';
    wrap.style.cssText = `
      position:fixed;inset:0;z-index:99999;
      background:radial-gradient(circle at 50% 35%,#101723 0%,#0A0C10 60%,#000 100%);
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      font-family:'IBM Plex Mono',monospace;color:#F0EDE5;
    `;
    wrap.innerHTML = `
      <style>
        #fl-auth-gate .brand{font-size:11px;letter-spacing:6px;color:#00D4FF;font-weight:600;margin-bottom:6px}
        #fl-auth-gate h1{font-family:'Inter',sans-serif;font-size:28px;font-weight:800;letter-spacing:1px;margin:0 0 6px;text-align:center}
        #fl-auth-gate .sub{font-size:10px;letter-spacing:2px;color:#8a9aa8;text-transform:uppercase;margin-bottom:32px;text-align:center}
        #fl-auth-gate .pin-dots{display:flex;gap:12px;margin-bottom:28px;justify-content:center}
        #fl-auth-gate .pin-dot{width:14px;height:14px;border-radius:50%;border:2px solid rgba(0,212,255,0.35);background:transparent;transition:all .15s}
        #fl-auth-gate .pin-dot.on{background:#00D4FF;border-color:#00D4FF;box-shadow:0 0 12px rgba(0,212,255,0.5)}
        #fl-auth-gate .keypad{display:grid;grid-template-columns:repeat(3,68px);gap:14px;margin-bottom:24px}
        #fl-auth-gate .key{width:68px;height:68px;border-radius:50%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);
          font-family:'Inter',sans-serif;font-size:24px;font-weight:600;color:#F0EDE5;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;transition:all .12s;display:flex;align-items:center;justify-content:center}
        #fl-auth-gate .key:active{background:rgba(0,212,255,0.18);border-color:rgba(0,212,255,0.5);transform:scale(0.95)}
        #fl-auth-gate .key.fn{font-size:11px;letter-spacing:1.5px;color:#8a9aa8;font-weight:600}
        #fl-auth-gate .err{color:#FF5252;font-size:11px;letter-spacing:0.8px;min-height:16px;text-align:center;margin-bottom:14px}
        #fl-auth-gate .bio-btn{margin-top:8px;background:linear-gradient(135deg,#00D4FF,#0099CC);color:#0A0C10;border:none;padding:11px 24px;border-radius:24px;
          font:600 11px 'IBM Plex Mono',monospace;letter-spacing:2.5px;cursor:pointer;display:flex;align-items:center;gap:8px;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
        #fl-auth-gate .bio-btn:active{transform:scale(0.96)}
        #fl-auth-gate .setup-msg{font-size:10px;color:#F5A623;letter-spacing:1px;text-align:center;margin-bottom:14px;max-width:280px;line-height:1.5}
        @media(max-height:680px){#fl-auth-gate .keypad{grid-template-columns:repeat(3,56px);gap:10px}#fl-auth-gate .key{width:56px;height:56px;font-size:20px}}
      </style>
      <div class="brand">FIRST LIGHT</div>
      <h1 id="fl-auth-title">Enter PIN</h1>
      <div class="sub" id="fl-auth-sub">Unlock Command Center</div>
      <div class="setup-msg" id="fl-setup-msg" style="display:none"></div>
      <div class="pin-dots" id="fl-pin-dots"></div>
      <div class="err" id="fl-auth-err">&nbsp;</div>
      <div class="keypad" id="fl-keypad"></div>
      <button id="fl-bio-btn" class="bio-btn" style="display:none">⚡ FACE ID / TOUCH ID</button>
    `;
    document.documentElement.appendChild(wrap); // append to <html>, not <body>, so it shows even if body is empty
    return wrap;
  }

  function renderDots(n, len) {
    const wrap = document.getElementById('fl-pin-dots');
    if (!wrap) return;
    wrap.innerHTML = '';
    for (let i = 0; i < len; i++) {
      const d = document.createElement('div');
      d.className = 'pin-dot' + (i < n ? ' on' : '');
      wrap.appendChild(d);
    }
  }

  function attachKeypad(onDigit, onBack) {
    const pad = document.getElementById('fl-keypad');
    pad.innerHTML = '';
    const keys = ['1','2','3','4','5','6','7','8','9','clear','0','back'];
    keys.forEach((k) => {
      const btn = document.createElement('button');
      btn.className = 'key' + (k === 'clear' || k === 'back' ? ' fn' : '');
      btn.textContent = k === 'back' ? '⌫' : k === 'clear' ? 'CLR' : k;
      btn.addEventListener('click', () => {
        if (k === 'back') onBack(1);
        else if (k === 'clear') onBack(-1);
        else onDigit(k);
      });
      pad.appendChild(btn);
    });
  }

  function showErr(msg) {
    const e = document.getElementById('fl-auth-err');
    if (e) { e.textContent = msg || ' '; }
  }

  async function runSetupFlow(gate) {
    const PIN_LEN = 6;
    const title = document.getElementById('fl-auth-title');
    const sub = document.getElementById('fl-auth-sub');
    const setupMsg = document.getElementById('fl-setup-msg');
    title.textContent = 'Set a PIN';
    sub.textContent = 'First-time setup — pick 6 digits';
    setupMsg.style.display = 'block';
    setupMsg.textContent = 'This PIN unlocks the app on this device. After setup we\'ll offer Face ID / Touch ID.';

    let stage = 1; // 1 = create, 2 = confirm
    let first = '';
    let buf = '';
    renderDots(0, PIN_LEN);
    attachKeypad(
      (d) => {
        if (buf.length < PIN_LEN) { buf += d; renderDots(buf.length, PIN_LEN); }
        if (buf.length === PIN_LEN) {
          setTimeout(async () => {
            if (stage === 1) {
              first = buf; buf = '';
              renderDots(0, PIN_LEN);
              title.textContent = 'Confirm PIN';
              sub.textContent = 'Enter the same 6 digits again';
              stage = 2;
            } else {
              if (buf !== first) {
                showErr('Mismatch — start over');
                buf = ''; first = ''; stage = 1;
                title.textContent = 'Set a PIN';
                sub.textContent = 'First-time setup — pick 6 digits';
                renderDots(0, PIN_LEN);
                return;
              }
              try {
                await setPin(buf);
                // Offer biometric
                if (await platformAuthAvailable()) {
                  title.textContent = 'Add biometric?';
                  sub.textContent = 'Optional but fast';
                  setupMsg.textContent = 'Tap below to register Face ID / Touch ID. You can always use PIN.';
                  document.getElementById('fl-keypad').style.display = 'none';
                  document.getElementById('fl-pin-dots').style.display = 'none';
                  const bio = document.getElementById('fl-bio-btn');
                  bio.style.display = 'flex';
                  bio.onclick = async () => {
                    try {
                      await biometricRegister();
                      markUnlocked();
                      gate.remove();
                    } catch (e) {
                      // Skip silently — PIN still works
                      markUnlocked();
                      gate.remove();
                    }
                  };
                  // also auto-skip button
                  const skip = document.createElement('button');
                  skip.textContent = 'SKIP — USE PIN ONLY';
                  skip.style.cssText = 'margin-top:12px;background:transparent;color:#8a9aa8;border:1px solid rgba(255,255,255,0.1);padding:9px 18px;border-radius:24px;font:600 10px "IBM Plex Mono",monospace;letter-spacing:2px;cursor:pointer';
                  skip.onclick = () => { markUnlocked(); gate.remove(); };
                  bio.parentElement.appendChild(skip);
                } else {
                  markUnlocked();
                  gate.remove();
                }
              } catch (e) {
                showErr(e.message);
                buf = ''; first = ''; stage = 1;
                renderDots(0, PIN_LEN);
                title.textContent = 'Set a PIN';
              }
            }
          }, 150);
        }
      },
      (n) => {
        if (n === -1) { buf = ''; renderDots(0, PIN_LEN); }
        else { buf = buf.slice(0, -1); renderDots(buf.length, PIN_LEN); }
      }
    );
  }

  async function runUnlockFlow(gate) {
    const PIN_LEN = 6;
    document.getElementById('fl-auth-title').textContent = 'Enter PIN';
    document.getElementById('fl-auth-sub').textContent = 'Unlock Command Center';
    const bio = document.getElementById('fl-bio-btn');
    let buf = '';
    renderDots(0, PIN_LEN);

    // Show biometric button if registered + supported
    const hasBio = !!(await vGet('biometric_cred_id'));
    if (hasBio && await platformAuthAvailable()) {
      bio.style.display = 'flex';
      bio.onclick = async () => {
        try {
          const ok = await biometricVerify();
          if (ok) { markUnlocked(); gate.remove(); }
          else showErr('Biometric failed — use PIN');
        } catch (e) { showErr(e.message || 'Biometric error — use PIN'); }
      };
      // Try biometric immediately (one tap shorter — user already saw the gate)
      // but only if not just clicked away. Delay slightly so the gate paints first.
      setTimeout(() => {
        bio.click();
      }, 300);
    }

    attachKeypad(
      (d) => {
        if (buf.length < PIN_LEN) { buf += d; renderDots(buf.length, PIN_LEN); }
        // also allow 4-digit unlock for users who set short PINs — try verify on any submit length
        if (buf.length >= 4) {
          // Don't verify on every digit; only on full or enter (full PIN length expected)
        }
        if (buf.length === PIN_LEN) {
          setTimeout(async () => {
            try {
              await verifyPin(buf);
              markUnlocked();
              gate.remove();
            } catch (e) {
              showErr(e.message);
              buf = '';
              renderDots(0, PIN_LEN);
            }
          }, 100);
        }
      },
      (n) => {
        if (n === -1) { buf = ''; renderDots(0, PIN_LEN); }
        else { buf = buf.slice(0, -1); renderDots(buf.length, PIN_LEN); }
      }
    );
  }

  // ── boot ──
  async function gate() {
    if (hasFreshSession()) return; // recently unlocked, skip
    const wrap = buildGate();
    // Block scroll while gate is up
    document.documentElement.style.overflow = 'hidden';
    const cleanup = new MutationObserver(() => {
      if (!document.getElementById('fl-auth-gate')) {
        document.documentElement.style.overflow = '';
        cleanup.disconnect();
        window.dispatchEvent(new CustomEvent('fl-unlocked'));
      }
    });
    cleanup.observe(document.documentElement, { childList: true, subtree: false });

    if (await pinIsSet()) await runUnlockFlow(wrap);
    else await runSetupFlow(wrap);
  }

  // ── public API ──
  window.FL = window.FL || {};
  window.FL.auth = {
    lock: () => { sessionStorage.removeItem(SESSION_KEY); location.reload(); },
    isUnlocked: hasFreshSession,
    resetAll: async () => {
      if (!confirm('Reset PIN + biometric? You\'ll set them again on next unlock.')) return;
      await vPut('pin_hash', null); await vPut('pin_salt', null); await vPut('biometric_cred_id', null);
      sessionStorage.removeItem(SESSION_KEY);
      location.reload();
    },
  };

  // Run as early as possible
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', gate);
  } else {
    gate();
  }
})();
