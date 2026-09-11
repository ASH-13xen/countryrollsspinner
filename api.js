/**
 * Country Rolls — Spin & Win Client API Module
 *
 * Claims a coupon code from the Google Apps Script backend, which assigns a
 * sequential number under a script lock so two simultaneous scanners can never
 * receive the same code. There is no winner cap: the campaign runs until the
 * client stops it.
 *
 * On ANY failure (network, non-2xx, malformed JSON, invalid sequence, timeout)
 * this resolves with a locally generated collision-free code instead of
 * throwing, so a customer is never left without a prize.
 */

/** Coupon lifetime. Deliberately not surfaced anywhere in the UI. */
export const VALIDITY_HOURS = 72;

const DEFAULT_SHEET_URL =
  'https://script.google.com/macros/s/AKfycbxF2Z5p6GiEag6o8sQJWg8YXHKPhAGa3Mg1O8U2IkkNS-jwNMAwqOJ14xfobtlOGmhC/exec';

function getSheetUrl() {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SHEET_URL) {
      return import.meta.env.VITE_SHEET_URL;
    }
  } catch (_) {}
  try {
    if (typeof process !== 'undefined' && process.env?.VITE_SHEET_URL) {
      return process.env.VITE_SHEET_URL;
    }
  } catch (_) {}
  return DEFAULT_SHEET_URL;
}

function generateFallbackCode() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const buffer = new Uint8Array(16);
  let code = '';
  while (code.length < 6) {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(buffer);
      for (let i = 0; i < buffer.length && code.length < 6; i++) {
        // Reject the tail of the byte range so every character is equally likely.
        if (buffer[i] < 252) code += chars[buffer[i] % chars.length];
      }
    } else {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return `CR-${code}`;
}

function getClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'cid-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

/**
 * @returns {Promise<{sequence:number|null, code:string, expiresAt:number,
 *                    expiresLabel:string, source:'server'|'fallback'}>}
 */
export async function claimSpin({ name = '', phone = '', prizeText = '', prizeCode = '' } = {}) {
  const now = Date.now();
  const expiresAt = now + VALIDITY_HOURS * 60 * 60 * 1000;
  const expiresLabel = new Date(expiresAt).toLocaleString();

  // Must exceed the Apps Script lock wait (6s) plus its execution time,
  // otherwise ordinary concurrent traffic aborts client-side and is issued an
  // unrecorded fallback code.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const payload = {
      name,
      phone,
      prize: prizeText,
      prizeText,
      prizeCode,
      tzOffset: new Date().getTimezoneOffset(),
      clientId: getClientId()
    };

    // text/plain keeps this a "simple" request, so the browser skips the CORS
    // preflight that Apps Script cannot answer.
    const res = await fetch(getSheetUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    // fetch does not reject on 4xx/5xx, and an error body can still be valid
    // JSON — this check is what stops a dead endpoint silently issuing
    // everybody the same code.
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (!data || !Number.isInteger(data.sequence) || data.sequence < 1) {
      throw new Error('Invalid sequence returned from server');
    }

    const code = 'C' + String(data.sequence).padStart(3, '0');
    return { sequence: data.sequence, code, expiresAt, expiresLabel, source: 'server' };
  } catch (err) {
    console.warn('claimSpin request failed, falling back to local code:', err?.message || err);
    return {
      sequence: null,
      code: generateFallbackCode(),
      expiresAt,
      expiresLabel,
      source: 'fallback'
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
