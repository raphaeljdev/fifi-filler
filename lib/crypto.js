// lib/crypto.js — AES-GCM encryption with PBKDF2-derived keys (WebCrypto).
// Classic script shared by popup and background (global FF).
(function (root) {
  'use strict';
  const FF = (root.FF = root.FF || {});
  const subtle = root.crypto.subtle;
  const ITERATIONS = 310000;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function b64(buf) {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  }

  function unb64(str) {
    return Uint8Array.from(atob(str), c => c.charCodeAt(0));
  }

  function randomB64(len) {
    return b64(root.crypto.getRandomValues(new Uint8Array(len)));
  }

  async function deriveKey(password, saltB64, iterations = ITERATIONS) {
    const base = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey(
      { name: 'PBKDF2', salt: unb64(saltB64), iterations, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
  }

  async function encrypt(key, text) {
    const iv = root.crypto.getRandomValues(new Uint8Array(12));
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
    return { iv: b64(iv), ct: b64(ct) };
  }

  /** Throws when the key is wrong or the data was tampered with. */
  async function decrypt(key, box) {
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct));
    return dec.decode(pt);
  }

  async function exportKey(key) {
    return b64(await subtle.exportKey('raw', key));
  }

  async function importKey(rawB64) {
    return subtle.importKey('raw', unb64(rawB64), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  }

  FF.crypto = { ITERATIONS, randomB64, deriveKey, encrypt, decrypt, exportKey, importKey };
})(globalThis);
