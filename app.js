
// app.js (module)
// No login. Permanent local random ID stored in localStorage. Firebase user doc id = local id.
// Replace FIREBASE_CONFIG and APP_DOMAIN with your values.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, increment
} from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

// ---------- CONFIG (REPLACE) ----------
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};
// Optional: if you want referral link to use a specific domain (recommended)
const APP_DOMAIN = window.location.origin;

// ---------- Constants ----------
const REWARD_AMOUNT_DAILY = 0.01;
const REWARD_AMOUNT_ACTIVITY = 0.02;
const DAILY_AD_COOLDOWN_HOURS = 2;
const DAILY_AD_COOLDOWN_MS = DAILY_AD_COOLDOWN_HOURS * 3600 * 1000;
const ACTIVITY_COOLDOWN_MS = 5 * 60 * 1000;

const MONETAG_DAILY = [
  { id: 1, zone: '10276123', sdk: 'show_10276123', name: 'Monetag Ad #1' },
  { id: 2, zone: '10337795', sdk: 'show_10337795', name: 'Monetag Ad #2' },
  { id: 3, zone: '10337853', sdk: 'show_10337853', name: 'Monetag Ad #3' }
];
const MONETAG_ACTIVITY = [
  { id: 'activity1', zone: '10276123', sdk: 'show_10276123', name: 'Monetag 3136495' },
  { id: 'activity2', zone: '10337795', sdk: 'show_10337795', name: 'Monetag 3152686' },
  { id: 'activity3', zone: '10337853', sdk: 'show_10337853', name: 'Monetag 3152703' }
];

// ---------- Firebase init ----------
const firebaseApp = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(firebaseApp);

// ---------- Utilities ----------
function generateUUIDv4() {
  // using crypto API
  if (crypto && crypto.getRandomValues) {
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    // set version bits
    buf[6] = (buf[6] & 0x0f) | 0x40;
    buf[8] = (buf[8] & 0x3f) | 0x80;
    const hex = Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.substr(0,8)}-${hex.substr(8,4)}-${hex.substr(12,4)}-${hex.substr(16,4)}-${hex.substr(20,12)}`;
  }
  // fallback
  return 'id-' + Math.random().toString(36).slice(2, 12);
}

const USER_KEY = 'sentinel_user_id';
let USER_ID = localStorage.getItem(USER_KEY);
if (!USER_ID) {
  USER_ID = generateUUIDv4();
  localStorage.setItem(USER_KEY, USER_ID);
}

// capture referral param if present (store until first create)
(function captureReferralParam() {
  const p = new URLSearchParams(window.location.search);
  const ref = p.get('ref');
  if (ref) localStorage.setItem('pending_referrer', ref);
})();

// ---------- State ----------
let USER_DATA = null;

// ---------- SPA helpers ----------
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
  if (name === 'main') {
    document.getElementById('view-main').style.display = 'block';
  } else {
    const el = document.getElementById(`view-${name}`);
    if (el) el.style.display = 'block';
  }
}

// ---------- Initialize user doc (create if missing) ----------
async function initUserDoc() {
  const userRef = doc(db, 'users', USER_ID);
  const snap = await getDoc(userRef);
  const pendingReferrer = localStorage.getItem('pending_referrer') || null;

  if (snap.exists()) {
    USER_DATA = snap.data();
  } else {
    const newUser = {
      id: USER_ID,
      balance: 0.00,
      adCooldowns: {},
      activityCooldowns: {},
      referrerId: pendingReferrer || null,
      referralCount: 0,
      pendingReferralEarnings: 0.00,
      createdAt: new Date().toISOString()
    };
    await setDoc(userRef, newUser);
    USER_DATA = newUser;

    if (pendingReferrer) {
      try {
        const rRef = doc(db, 'users', pendingReferrer);
        await updateDoc(rRef, { referralCount: increment(1) });
      } catch (e) {
        console.warn('Could not increment referrer (maybe missing):', e);
      }
      localStorage.removeItem('pending_referrer');
    }
  }

  // show UI controls
  document.getElementById('top-right-widgets').style.display = 'flex';
  document.getElementById('profile-container').style.display = 'flex';
  document.getElementById('ads-room-button').style.display = 'block';
  document.getElementById('activity-room-link').style.display = 'block';
  document.getElementById('referral-room-link').style.display = 'block';
  document.getElementById('user-id-display').textContent = USER_ID.slice(0,10) + '…';
  updateBalances(USER_DATA.balance || 0);
}

// ---------- Balance update helper ----------
function updateBalances(val) {
  const formatted = Number(val || 0).toFixed(2);
  document.getElementById('coin-balance').textContent = formatted;
  document.querySelectorAll('.header-balance').forEach(el => el.textContent = `${formatted} PESO`);
}

// ---------- DAILY ADS ROOM ----------
document.getElementById('ads-room-button').addEventListener('click', async (e) => {
  e.preventDefault();
  await renderDailyAdSlots();
  showView('ads-room');
});
document.getElementById('back-from-ads').addEventListener('click', (e) => { e.preventDefault(); showView('main'); });

async function renderDailyAdSlots() {
  const container = document.getElementById('ad-slots-container');
  container.innerHTML = '';
  const snap = await getDoc(doc(db, 'users', USER_ID));
  const cooldowns = (snap.exists() && snap.data().adCooldowns) || {};

  MONETAG_DAILY.forEach(ad => {
    const last = cooldowns[ad.id] || 0;
    const elapsed = Date.now() - last;
    const ready = elapsed >= DAILY_AD_COOLDOWN_MS;
    const card = document.createElement('div');
    card.className = 'ad-slot';
    card.innerHTML = `
      <p><strong>${ad.name}</strong></p>
      <div id="daily-timer-${ad.id}" class="ad-timer">${ready ? 'Ready to Watch' : ''}</div>
      <button id="daily-btn-${ad.id}" ${ready ? '' : 'disabled'}>${ready ? `Watch Ad (${REWARD_AMOUNT_DAILY.toFixed(2)} PESO)` : 'Cooling Down...'}</button>
    `;
    container.appendChild(card);
    const btn = document.getElementById(`daily-btn-${ad.id}`);
    if (ready) btn.addEventListener('click', () => dailyWatch(ad, btn));
    else startCountdown(`daily-timer-${ad.id}`, DAILY_AD_COOLDOWN_MS, last, () => renderDailyAdSlots());
  });
}

function startCountdown(elId, cooldownMs, lastTs, onReady) {
  const el = document.getElementById(elId);
  if (!el) return;
  const iv = setInterval(() => {
    const remaining = cooldownMs - (Date.now() - lastTs);
    if (remaining <= 0) {
      clearInterval(iv);
      onReady();
      return;
    }
    const s = Math.floor(remaining / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    el.textContent = `Ready in: ${h}h ${m}m ${sec}s`;
  }, 1000);
}

async function dailyWatch(ad, btn) {
  btn.disabled = true;
  btn.textContent = 'Loading Ad...';
  loadMonetagScript(ad.zone, ad.sdk);

  for (let i=5;i>0;i--) {
    btn.textContent = `Watching... (${i}s)`;
    await new Promise(r => setTimeout(r, 1000));
  }

  const fn = window[ad.sdk];
  try {
    if (typeof fn === 'function') {
      await fn('pop');
    } else {
      // fallback simulated success
    }
    await applyDailyReward(ad.id);
    alert(`You earned ${REWARD_AMOUNT_DAILY.toFixed(2)} PESO`);
  } catch (e) {
    console.error('Ad error', e);
    alert('Ad failed or closed. No reward.');
  }
  showView('main');
}

async function applyDailyReward(adId) {
  const ref = doc(db, 'users', USER_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const newBalance = Number(data.balance || 0) + REWARD_AMOUNT_DAILY;
  const newCooldowns = data.adCooldowns || {};
  newCooldowns[adId] = Date.now();
  await updateDoc(ref, { balance: newBalance, adCooldowns: newCooldowns });
  updateBalances(newBalance);
}

// ---------- ACTIVITY ROOM ----------
document.getElementById('activity-room-link').addEventListener('click', async (e) => { e.preventDefault(); await renderActivityButtons(); showView('activity'); });
document.getElementById('back-from-activity').addEventListener('click', (e) => { e.preventDefault(); showView('main'); });

async function renderActivityButtons() {
  const container = document.getElementById('activity-buttons');
  container.innerHTML = '';
  const snap = await getDoc(doc(db, 'users', USER_ID));
  const cooldowns = (snap.exists() && snap.data().activityCooldowns) || {};

  MONETAG_ACTIVITY.forEach(ad => {
    const last = cooldowns[ad.id] || 0;
    const elapsed = Date.now() - last;
    const ready = elapsed >= ACTIVITY_COOLDOWN_MS;
    const card = document.createElement('div');
    card.className = 'activity-card';
    card.innerHTML = `
      <h3>${ad.name}</h3>
      <div id="act-timer-${ad.id}" class="activity-timer">${ready ? 'Ready' : ''}</div>
      <button id="act-btn-${ad.id}" ${ready ? '' : 'disabled'}>Watch Ads (earn ${REWARD_AMOUNT_ACTIVITY.toFixed(2)} PESO)</button>
    `;
    container.appendChild(card);
    const btn = document.getElementById(`act-btn-${ad.id}`);
    if (ready) btn.addEventListener('click', () => onActivityClick(ad, btn));
    else startCountdown(`act-timer-${ad.id}`, ACTIVITY_COOLDOWN_MS, last, () => renderActivityButtons());
  });
}

async function onActivityClick(ad, btn) {
  btn.disabled = true;
  btn.textContent = 'Loading Ads...';
  loadMonetagScript(ad.zone, ad.sdk);
  const fn = window[ad.sdk];
  try {
    if (typeof fn === 'function') {
      btn.textContent = 'Showing ad 1 of 2...';
      await fn();
      btn.textContent = 'Showing ad 2 of 2...';
      await fn();
    } else {
      btn.textContent = 'Simulating ad 1 of 2...';
      await new Promise(r => setTimeout(r, 1500));
      btn.textContent = 'Simulating ad 2 of 2...';
      await new Promise(r => setTimeout(r, 1500));
    }
    await applyActivityReward(ad.id);
    alert(`You earned ${REWARD_AMOUNT_ACTIVITY.toFixed(2)} PESO`);
  } catch (e) {
    console.error('Activity ad error', e);
    alert('Ad failed or closed. No reward.');
  }
  await renderActivityButtons();
  showView('main');
}

async function applyActivityReward(adId) {
  const ref = doc(db, 'users', USER_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const newBalance = Number(data.balance || 0) + REWARD_AMOUNT_ACTIVITY;
  const newCooldowns = data.activityCooldowns || {};
  newCooldowns[adId] = Date.now();
  await updateDoc(ref, { balance: newBalance, activityCooldowns: newCooldowns });
  updateBalances(newBalance);
}

// ---------- REFERRAL ROOM ----------
document.getElementById('referral-room-link').addEventListener('click', (e) => { e.preventDefault(); renderReferralRoom(); showView('referral'); });
document.getElementById('back-from-referral').addEventListener('click', (e) => { e.preventDefault(); showView('main'); });

async function renderReferralRoom() {
  const input = document.getElementById('referral-link-input');
  const totalRef = document.getElementById('total-referrals');
  const pendingE = document.getElementById('pending-earnings');
  const snap = await getDoc(doc(db, 'users', USER_ID));
  if (!snap.exists()) return;
  const data = snap.data();
  updateBalances(data.balance || 0);
  const refLink = `${APP_DOMAIN}?ref=${USER_ID}`;
  input.value = refLink;
  totalRef.textContent = data.referralCount || 0;
  pendingE.textContent = `${Number(data.pendingReferralEarnings || 0).toFixed(2)} PESO`;
  document.getElementById('copy-link-button').onclick = async () => {
    try { await navigator.clipboard.writeText(refLink); const btn = document.getElementById('copy-link-button'); btn.textContent = 'Copied!'; setTimeout(()=>btn.textContent='Copy Link',1500); }
    catch (e) { alert('Could not copy link.'); }
  };
}

// ---------- Monetag loader ----------
function loadMonetagScript(zone, sdk) {
  if (document.querySelector(`script[data-sdk="${sdk}"]`)) return;
  const s = document.createElement('script');
  s.src = '//libtl.com/sdk.js';
  s.setAttribute('data-zone', zone);
  s.setAttribute('data-sdk', sdk);
  document.head.appendChild(s);
}

// ---------- Init ----------
async function init() {
  // Immediately create or load user doc
  await initUserDoc();
  // show main view
  showView('main');
}
init();
