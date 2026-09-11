import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { Draggable } from 'gsap/Draggable';
import confetti from 'canvas-confetti';
import { claimSpin } from './api.js';

gsap.registerPlugin(CustomEase, Draggable);

/* ==========================================================================
   Prizes — 4 distinct prizes, each on 2 opposing slices.
   Slice probability = 1/8 (12.5%). Prize probability = 2/8 (25%). Equal.
   ========================================================================== */

const PRIZES = [
    { text: 'Aloo Roll\n+ Softy', label: 'Free Aloo Roll + Softy', code: 'ALOOSOFTY' },
    { text: '2 Free\nSofty',      label: 'Free 2 Softy',           code: '2SOFTY'    },
    { text: 'Large\nFries',       label: 'Free Large Fries',       code: 'FRIES'     },
    { text: 'Free\nAloo Roll',    label: 'Free Aloo Roll',         code: 'ALOO'      }
];

/** Slice i shows PRIZES[i % 4], so each prize sits on two opposite slices. */
const SLICES = [0, 1, 2, 3, 0, 1, 2, 3].map(i => PRIZES[i]);
const SLICE_COUNT = SLICES.length;
const SLICE_ANGLE = 360 / SLICE_COUNT;      // 45deg
const SPIN_DURATION = 4.6;
const JITTER = SLICE_ANGLE / 2 - 8;         // stay well inside the slice

const SVG_NS = 'http://www.w3.org/2000/svg';
const CX = 200, CY = 200, R_OUTER = 190, R_LABEL = 126, R_BULB = 190;

/* ==========================================================================
   Elements
   ========================================================================== */

const wheelEl    = document.getElementById('wheel');
const wheelWrap  = document.getElementById('wheel-wrap');
const pointerEl  = document.getElementById('pointer');
const spinBtn    = document.getElementById('spin-btn');
const hintEl     = document.getElementById('hint');
const liveRegion = document.getElementById('live-region');

const regOverlay = document.getElementById('registration-overlay');
const regForm    = document.getElementById('registration-form');
const regBtn     = document.getElementById('register-btn');
const nameInput  = document.getElementById('user-name');
const phoneInput = document.getElementById('user-phone');

const winModal   = document.getElementById('winner-modal');
const winEyebrow = document.getElementById('win-eyebrow');
const winTitle   = document.getElementById('win-title');
const winDesc    = document.getElementById('win-description');
const winCode    = document.getElementById('win-code');
const copyBtn    = document.getElementById('copy-btn');
const closeBtn   = document.getElementById('close-modal');


const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ==========================================================================
   Local tally — persistent count of how often each wheel item has come up
   ========================================================================== */

const TALLY_KEY = 'crTally';

function readTally() {
    try {
        const raw = JSON.parse(localStorage.getItem(TALLY_KEY));
        if (raw && typeof raw === 'object') return raw;
    } catch (_) { /* corrupt entry — rebuild below */ }
    return { totalSpins: 0, byPrize: {}, bySlice: {}, firstSpinAt: null, lastSpinAt: null };
}

function recordSpin(sliceIndex) {
    const t = readTally();
    const prize = SLICES[sliceIndex];
    const now = new Date().toISOString();

    t.totalSpins = (t.totalSpins || 0) + 1;
    t.byPrize[prize.code] = (t.byPrize[prize.code] || 0) + 1;
    t.bySlice[sliceIndex] = (t.bySlice[sliceIndex] || 0) + 1;
    t.firstSpinAt = t.firstSpinAt || now;
    t.lastSpinAt = now;

    try { localStorage.setItem(TALLY_KEY, JSON.stringify(t)); } catch (_) {}
    return t;
}

/** Console helper: crStats() prints the distribution with percentages. */
window.crStats = () => {
    const t = readTally();
    const rows = PRIZES.map(p => ({
        prize: p.label,
        count: t.byPrize[p.code] || 0,
        share: t.totalSpins ? (((t.byPrize[p.code] || 0) / t.totalSpins) * 100).toFixed(1) + '%' : '—'
    }));
    console.table(rows);
    console.log('total spins:', t.totalSpins, '| per slice:', t.bySlice);
    return t;
};

/** Console helper: crEntries() lists every customer + code stored on device. */
window.crEntries = () => {
    let entries = [];
    try { entries = JSON.parse(localStorage.getItem('crEntries')) || []; } catch (_) {}
    console.table(entries);
    return entries;
};

/** Console helper: crExportCsv() downloads the local ledger as a CSV file. */
window.crExportCsv = () => {
    const entries = window.crEntries();
    if (!entries.length) { console.warn('No entries stored on this device.'); return; }
    const cols = ['at', 'name', 'phone', 'code', 'prize', 'expiresAt', 'source'];
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.join(','), ...entries.map(e => cols.map(c => esc(e[c])).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `country-rolls-entries-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    return entries.length;
};

/* ==========================================================================
   Wheel construction (SVG — crisp at any DPR, real strokes, curved labels)
   ========================================================================== */

/** Polar -> cartesian. 0deg = 12 o'clock, angles increase clockwise. */
function polar(angleDeg, radius) {
    const rad = (angleDeg - 90) * Math.PI / 180;
    return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) };
}

function buildWheel() {
    const frag = document.createDocumentFragment();

    SLICES.forEach((prize, i) => {
        const start = i * SLICE_ANGLE;
        const end = start + SLICE_ANGLE;
        const p1 = polar(start, R_OUTER);
        const p2 = polar(end, R_OUTER);

        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', `M ${CX} ${CY} L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${R_OUTER} ${R_OUTER} 0 0 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} Z`);
        path.setAttribute('class', `slice-shape ${i % 2 === 0 ? 'is-dark' : 'is-light'}`);
        frag.appendChild(path);
    });

    // Labels drawn after all slices so they always sit on top.
    SLICES.forEach((prize, i) => {
        const mid = i * SLICE_ANGLE + SLICE_ANGLE / 2;
        const pos = polar(mid, R_LABEL);
        // Read outward along the radius, flipped on the left half so text is
        // never upside down.
        const flipped = mid > 180;
        const rotation = flipped ? mid + 90 : mid - 90;

        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('class', `slice-label ${i % 2 === 0 ? 'on-dark' : 'on-light'}`);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('transform', `rotate(${rotation} ${pos.x.toFixed(2)} ${pos.y.toFixed(2)})`);

        const lines = prize.text.split('\n');
        lines.forEach((line, li) => {
            const tspan = document.createElementNS(SVG_NS, 'tspan');
            tspan.setAttribute('x', pos.x.toFixed(2));
            tspan.setAttribute('y', (pos.y + (li - (lines.length - 1) / 2) * 17).toFixed(2));
            tspan.textContent = line;
            text.appendChild(tspan);
        });
        frag.appendChild(text);
    });

    // Rim
    const rim = document.createElementNS(SVG_NS, 'circle');
    rim.setAttribute('class', 'wheel-rim');
    rim.setAttribute('cx', CX); rim.setAttribute('cy', CY); rim.setAttribute('r', R_OUTER);
    frag.appendChild(rim);

    const rimInner = document.createElementNS(SVG_NS, 'circle');
    rimInner.setAttribute('class', 'wheel-rim-inner');
    rimInner.setAttribute('cx', CX); rimInner.setAttribute('cy', CY);
    rimInner.setAttribute('r', R_OUTER - 8);
    frag.appendChild(rimInner);

    // Bulbs on the rim, one per slice boundary + one per slice centre.
    const bulbs = [];
    for (let i = 0; i < SLICE_COUNT * 2; i++) {
        const pos = polar(i * (SLICE_ANGLE / 2), R_BULB);
        const c = document.createElementNS(SVG_NS, 'circle');
        c.setAttribute('class', 'bulb');
        c.setAttribute('cx', pos.x.toFixed(2));
        c.setAttribute('cy', pos.y.toFixed(2));
        c.setAttribute('r', 5.5);
        frag.appendChild(c);
        bulbs.push(c);
    }

    wheelEl.appendChild(frag);
    return bulbs;
}

const bulbs = buildWheel();

/* ==========================================================================
   Idle ambience
   ========================================================================== */

CustomEase.create('spinEase', 'M0,0 C0.05,0.34 0.06,0.86 0.2,0.94 0.36,1.03 0.72,1 1,1');

let chaseTl;
if (!reduceMotion) {
    // Rim chase-lights
    chaseTl = gsap.timeline({ repeat: -1 });
    bulbs.forEach((b, i) => {
        chaseTl.to(b, { attr: { r: 7 }, duration: 0.16, yoyo: true, repeat: 1,
            onStart: () => b.classList.add('is-lit'),
            onComplete: () => b.classList.remove('is-lit') }, i * 0.07);
    });

    // Background waves
    gsap.utils.toArray('.wave').forEach((w, i) => {
        gsap.fromTo(w, { xPercent: 0 }, {
            xPercent: -50, duration: 26 + i * 9, ease: 'none', repeat: -1
        });
        gsap.to(w, { y: i % 2 ? 12 : -10, duration: 5 + i, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    });

    gsap.to('#wheel-wrap', { y: -8, duration: 3.2, ease: 'sine.inOut', yoyo: true, repeat: -1 });
}

/**
 * GSAP drives everything from requestAnimationFrame. If rAF is throttled or
 * never fires — a link opened in a background tab, aggressive power saving,
 * some in-app webviews — a `.from()` tween leaves its target stuck at the
 * start value, i.e. an invisible wheel and an invisible CTA. This watchdog is
 * timer-based (setTimeout keeps running when rAF does not) and force-settles
 * the animation, firing its onComplete so dependent state still advances.
 */
function withWatchdog(anim, graceMs) {
    const id = setTimeout(() => {
        if (anim.progress() < 1) anim.progress(1);
    }, graceMs);
    return anim;
}

// Entrance
const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
intro.from('.hero__logo', { y: -30, opacity: 0, duration: .7, scale: .92 })
     .from('.hero__title', { y: 20, opacity: 0, duration: .5 }, '-=.35')
     .from('.hero__sub', { y: 14, opacity: 0, duration: .45 }, '-=.3')
     .from('#wheel-wrap', { scale: .84, opacity: 0, duration: .8, ease: 'back.out(1.3)' }, '-=.4')
     .from('#spin-btn', { y: 24, opacity: 0, duration: .5 }, '-=.45')
     .from('#hint', { opacity: 0, duration: .4 }, '-=.25');
withWatchdog(intro, 4000);

/* ==========================================================================
   Spin mechanics
   ========================================================================== */

/**
 * Safari private mode throws QuotaExceededError on every setItem, and a full
 * quota throws too. An unguarded write here would abort finishSpin() after
 * the server already consumed a campaign slot, leaving the customer with no
 * visible code, or strand a user forever on the registration screen.
 */
function store(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (err) { console.warn('[storage] write failed', key, err); return false; }
}

function read(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
}

let rotation = 0;
let isSpinning = false;
let hasSpun = read('hasSpun') === 'true';

/** Cryptographically uniform integer in [0, max). */
function randomInt(max) {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0xFFFFFFFF / max) * max;   // reject bias
    let v;
    do { crypto.getRandomValues(buf); v = buf[0]; } while (v >= limit);
    return v % max;
}

/**
 * Rotation that parks the CENTRE of `sliceIndex` under the pointer at 12
 * o'clock. The old build used `360 - i*45`, which parked the slice's leading
 * EDGE on the pointer, so half of all spins visually landed on the neighbour.
 */
function rotationForSlice(sliceIndex, turns) {
    const target = sliceIndex * SLICE_ANGLE + SLICE_ANGLE / 2;
    const jitter = (Math.random() * 2 - 1) * JITTER;
    const base = Math.ceil(rotation / 360) * 360;
    return base + turns * 360 - target + jitter;
}

/** Which slice is under the pointer for a given absolute rotation. */
function sliceUnderPointer(deg) {
    const local = ((-deg % 360) + 360) % 360;
    return Math.floor(local / SLICE_ANGLE) % SLICE_COUNT;
}

function tickPointer() {
    if (reduceMotion) return;
    gsap.fromTo(pointerEl, { rotate: -13 },
        { rotate: 0, duration: 0.34, ease: 'elastic.out(1, 0.32)', overwrite: true });
}

function startSpin() {
    if (spinLocked()) return;
    isSpinning = true;
    spinBtn.disabled = true;
    spinBtn.classList.add('is-busy');
    hintEl.textContent = 'Good luck!';
    if (chaseTl) chaseTl.timeScale(3);

    // 1. Pick the prize fairly, up front — single source of truth.
    const sliceIndex = randomInt(SLICE_COUNT);
    const prize = SLICES[sliceIndex];
    const targetRotation = rotationForSlice(sliceIndex, 6);

    // 2. Claim the code from the sheet while the wheel is spinning.
    const claim = claimSpin({
        name: localStorage.getItem('userName') || '',
        phone: localStorage.getItem('userPhone') || '',
        prizeText: prize.label,
        prizeCode: prize.code
    });

    // 3. Animate.
    let lastTick = Math.floor(rotation / (SLICE_ANGLE / 2));
    const spinTl = gsap.timeline({
        onComplete: async () => {
            rotation = targetRotation;
            const landed = sliceUnderPointer(rotation);
            const tally = recordSpin(landed);
            console.debug('[wheel] landed on slice', landed, '=', SLICES[landed].label, '| tally', tally.byPrize);

            const result = await claim;
            finishSpin(SLICES[landed], result);
        }
    });

    spinTl.to({ v: rotation }, {
        v: targetRotation,
        duration: reduceMotion ? 0.4 : SPIN_DURATION,
        ease: reduceMotion ? 'none' : 'spinEase',
        onUpdate() {
            const v = this.targets()[0].v;
            gsap.set(wheelEl, { rotate: v });
            const tick = Math.floor(v / (SLICE_ANGLE / 2));
            if (tick !== lastTick) { lastTick = tick; tickPointer(); }
        }
    });

    if (!reduceMotion) {
        spinTl.to('#wheel-wrap', { scale: 1.04, duration: .5, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 0);
    }

    // A stalled rAF must never strand the customer on a spinning wheel with
    // no prize, so settle the result on a timer if the tween never lands.
    withWatchdog(spinTl, (reduceMotion ? 0.4 : SPIN_DURATION) * 1000 + 2000);
}

/**
 * Local customer ledger. Every issued coupon is appended here as well as
 * being sent to the sheet, so there is always an on-device record of who won
 * what even if the network was down. Read it with crEntries() / crExportCsv().
 */
function recordEntry(entry) {
    let entries = [];
    try { entries = JSON.parse(read('crEntries')) || []; } catch (_) { entries = []; }
    if (!Array.isArray(entries)) entries = [];
    entries.push(entry);
    store('crEntries', JSON.stringify(entries));
    return entries;
}

function finishSpin(prize, result) {
    isSpinning = false;
    if (chaseTl) chaseTl.timeScale(1);
    spinBtn.classList.remove('is-busy');

    hasSpun = true;
    store('hasSpun', 'true');
    store('winningCode', result.code);
    store('winningPrize', prize.label);
    store('winningSource', result.source);

    recordEntry({
        name: read('userName') || '',
        phone: read('userPhone') || '',
        code: result.code,
        prize: prize.label,
        at: new Date().toISOString(),
        expiresAt: new Date(result.expiresAt).toISOString(),
        source: result.source
    });

    spinBtn.querySelector('.btn__label').textContent = 'Spin Used';
    hintEl.textContent = '';

    showWinner(prize.label, result.code, false);
}

/* ==========================================================================
   Winner modal
   ========================================================================== */

function fireConfetti() {
    if (reduceMotion) return;
    const opts = { colors: ['#FFC72C', '#111111', '#FFFFFF'], disableForReducedMotion: true };
    confetti({ ...opts, particleCount: 90, spread: 75, origin: { y: .62 } });
    setTimeout(() => confetti({ ...opts, particleCount: 55, angle: 60, spread: 60, origin: { x: 0, y: .65 } }), 160);
    setTimeout(() => confetti({ ...opts, particleCount: 55, angle: 120, spread: 60, origin: { x: 1, y: .65 } }), 260);
}

function showWinner(prizeLabel, code, returning) {
    winEyebrow.textContent = returning ? 'Welcome back' : 'You won';
    winTitle.textContent = prizeLabel;
    winDesc.textContent = returning
        ? 'Here is the code you already won.'
        : 'Show this code at the counter to claim it.';
    winCode.textContent = code || '—';
    liveRegion.textContent = `You won ${prizeLabel}. Your code is ${code}.`;
    openOverlay(winModal, closeBtn);
    if (!returning) fireConfetti();
}

/* ==========================================================================
   Overlay helpers (animation + focus management)
   ========================================================================== */

let lastFocused = null;

function openOverlay(overlay, focusTarget) {
    lastFocused = document.activeElement;
    overlay.classList.add('active');
    const card = overlay.querySelector('.card');
    withWatchdog(gsap.fromTo(card, { y: 26, scale: .94, opacity: 0 },
        { y: 0, scale: 1, opacity: 1, duration: reduceMotion ? .01 : .55, ease: 'back.out(1.5)' }), 1400);
    setTimeout(() => focusTarget && focusTarget.focus(), 120);
}

function closeOverlay(overlay) {
    const card = overlay.querySelector('.card');
    withWatchdog(gsap.to(card, {
        y: 18, scale: .96, opacity: 0, duration: reduceMotion ? .01 : .28, ease: 'power2.in',
        onComplete: () => {
            overlay.classList.remove('active');
            gsap.set(card, { clearProps: 'all' });
            if (lastFocused) lastFocused.focus();
        }
    }), 900);
}

// Keep focus inside whichever overlay is open.
document.addEventListener('keydown', e => {
    const open = document.querySelector('.overlay.active');
    if (!open || e.key !== 'Tab') return;
    const items = open.querySelectorAll('button, input, [href]');
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

/* ==========================================================================
   Registration
   ========================================================================== */

function setError(input, message) {
    const field = input.closest('.field');
    field.classList.toggle('has-error', Boolean(message));
    field.querySelector('.field__error').textContent = message || '';
    if (message && !reduceMotion) gsap.fromTo(field, { x: -7 }, { x: 0, duration: .4, ease: 'elastic.out(1, .35)' });
}

phoneInput.addEventListener('input', () => {
    phoneInput.value = phoneInput.value.replace(/\D/g, '').slice(0, 10);
    if (phoneInput.value.length === 10) setError(phoneInput, '');
});

nameInput.addEventListener('input', () => {
    if (nameInput.value.trim().length >= 2) setError(nameInput, '');
});

regForm.addEventListener('submit', e => {
    e.preventDefault();
    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    let ok = true;

    if (name.length < 2) { setError(nameInput, 'Please enter your name'); ok = false; }
    if (!/^[6-9]\d{9}$/.test(phone)) { setError(phoneInput, 'Enter a valid 10-digit mobile number'); ok = false; }
    if (!ok) return;

    store('userName', name);
    store('userPhone', phone);

    regBtn.classList.add('is-busy');
    regBtn.disabled = true;

    setTimeout(() => {
        regBtn.classList.remove('is-busy');
        regBtn.disabled = false;
        closeOverlay(regOverlay);
        restoreIfSpun();
    }, 420);
});

/* ==========================================================================
   Returning users
   ========================================================================== */

function restoreIfSpun() {
    if (!hasSpun) return;
    spinBtn.disabled = true;
    spinBtn.querySelector('.btn__label').textContent = 'Spin Used';
    hintEl.textContent = '';
    setTimeout(() => showWinner(
        read('winningPrize') || 'Your prize',
        read('winningCode') || '—',
        true
    ), 500);
}

if (read('userName')) {
    regOverlay.classList.remove('active');
    restoreIfSpun();
} else {
    setTimeout(() => nameInput.focus(), 400);
}


/* ==========================================================================
   Input bindings
   ========================================================================== */

spinBtn.addEventListener('click', startSpin);

closeBtn.addEventListener('click', () => closeOverlay(winModal));

copyBtn.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(winCode.textContent);
    } catch (_) {
        const t = document.createElement('textarea');
        t.value = winCode.textContent;
        document.body.appendChild(t); t.select();
        document.execCommand('copy'); t.remove();
    }
    copyBtn.textContent = 'Copied';
    copyBtn.classList.add('is-done');
    setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('is-done'); }, 2000);
});

/* Flick-to-spin.
   The Draggable is bound to an off-DOM proxy, never to .wheel-wrap: rotating
   the wrapper itself would drag the hub and the pointer around with it. We
   read the proxy's angle and apply it to the wheel only. */
const dragProxy = document.createElement('div');
let dragStartRotation = 0;

/** True whenever spinning must be refused: mid-spin or already used. */
function spinLocked() {
    return isSpinning || hasSpun;
}

Draggable.create(dragProxy, {
    type: 'rotation',
    trigger: wheelWrap,
    inertia: false,
    allowNativeTouchScrolling: false,
    onPress() {
        if (spinLocked()) return;
        dragStartRotation = rotation;
    },
    onDrag() {
        if (spinLocked()) return;
        gsap.set(wheelEl, { rotate: dragStartRotation + this.rotation });
    },
    onDragEnd() {
        if (spinLocked()) {
            gsap.set(wheelEl, { rotate: rotation });
            return;
        }
        // Only a deliberate flick counts; a stray tap just snaps back.
        if (Math.abs(this.rotation) < 12) {
            gsap.to(wheelEl, { rotate: rotation, duration: .35, ease: 'power2.out' });
            return;
        }
        rotation = dragStartRotation + this.rotation;
        startSpin();
    }
});
