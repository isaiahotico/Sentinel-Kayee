
// activity.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-app.js";
import { getFirestore, doc, getDoc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

// ---------- CONFIG ----------
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};

const REWARD_AMOUNT = 0.02; // PESO per successful click (after two ads)
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// Monetag ad definitions for the three buttons
const ACTIVITY_ADS = [
  { id: 'activity1', name: 'Monetag 3136495', zone: '10276123', sdk: 'show_10276123' },
  { id: 'activity2', name: 'Monetag 3152686', zone: '10337795', sdk: 'show_10337795' },
  { id: 'activity3', name: 'Monetag 3152703', zone: '10337853', sdk: 'show_10337853' }
];

// ---------- INIT FIREBASE ----------
const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);

// ---------- AUTH (from localStorage set by index.js) ----------
let CURRENT_USER_ID = localStorage.getItem('tg_user_id');
if (!CURRENT_USER_ID) {
  alert('You must log in with Telegram first.');
  // redirect back to index for login
  window.location.href = 'index.html';
}

// ---------- UI helpers ----------
const activityContainer = document.getElementById('activity-buttons');
const headerBalance = document.getElementById('header-balance');

function formatBalance(num) {
  return Number(num).toFixed(2);
}

// ---------- Load user data & render buttons ----------
async function init() {
  const userRef = doc(db, 'users', CURRENT_USER_ID);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    // create default user doc if missing (shouldn't normally happen)
    await setDoc(userRef, {
      telegramId: CURRENT_USER_ID,
      balance: 0.00,
      activityCooldowns: {},
      createdAt: new Date().toISOString()
    });
    renderButtons({});
    updateHeaderBalance(0);
    return;
  }

  const userData = userSnap.data();
  updateHeaderBalance(userData.balance || 0);
  renderButtons(userData.activityCooldowns || {});
}

// ---------- Render activity buttons with cooldowns ----------
function renderButtons(cooldowns) {
  activityContainer.innerHTML = '';

  ACTIVITY_ADS.forEach(ad => {
    const last = cooldowns && cooldowns[ad.id] ? cooldowns[ad.id] : 0;
    const elapsed = Date.now() - last;
    const isReady = elapsed >= COOLDOWN_MS;

    const card = document.createElement('div');
    card.className = 'activity-card';
    card.innerHTML = `
      <h3>${ad.name}</h3>
      <div class="activity-timer" id="timer-${ad.id}">${isReady ? 'Ready' : ''}</div>
      <button id="btn-${ad.id}" ${isReady ? '' : 'disabled'}>
        Watch Ads (earn ${REWARD_AMOUNT.toFixed(2)} PESO)
      </button>
    `;
    activityContainer.appendChild(card);

    const btn = document.getElementById(`btn-${ad.id}`);
    if (isReady) {
      btn.addEventListener('click', () => onActivityClick(ad, btn));
    } else {
      // start countdown display
      startCountdown(ad.id, last);
    }
  });
}

// ---------- Countdown timer per button ----------
const timers = {};
function startCountdown(adId, lastWatchedTimestamp) {
  const el = document.getElementById(`timer-${adId}`);
  if (!el) return;
  function tick() {
    const remaining = COOLDOWN_MS - (Date.now() - lastWatchedTimestamp);
    if (remaining <= 0) {
      clearInterval(timers[adId]);
      // re-fetch cooldowns to re-render the UI enabled
      refreshCooldownsAndRender();
      return;
    }
    const s = Math.floor(remaining / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    el.textContent = `Ready in ${m}m ${sec}s`;
  }
  tick();
  timers[adId] = setInterval(tick, 1000);
}

// ---------- Click handler: show two interstitial ads sequentially ----------
async function onActivityClick(ad, button) {
  if (!button) return;
  button.disabled = true;
  button.textContent = 'Loading ad...';

  // Load Monetag SDK for this ad dynamically (script attributes for zone/sdk)
  // If SDK script is already present for a zone, we won't append a duplicate.
  loadMonetagScript(ad);

  // Wait briefly for SDK to load (best-effort)
  await new Promise(r => setTimeout(r, 800));

  // Try to call the SDK interstitial function twice sequentially
  const sdkFn = window[ad.sdk];

  try {
    if (typeof sdkFn === 'function') {
      // first interstitial
      button.textContent = 'Showing ad 1 of 2...';
      await sdkFn(); // many Monetag examples return a Promise

      // second interstitial
      button.textContent = 'Showing ad 2 of 2...';
      await sdkFn();

      // Reward user after successful completion of both
      await grantActivityReward(ad.id);
      alert(`Success — you earned ${REWARD_AMOUNT.toFixed(2)} PESO!`);
    } else {
      // Monetag SDK absent — simulate both ads for testing
      button.textContent = 'Simulating ad 1 of 2...';
      await new Promise(r => setTimeout(r, 1500));
      button.textContent = 'Simulating ad 2 of 2...';
      await new Promise(r => setTimeout(r, 1500));

      await grantActivityReward(ad.id);
      alert(`(Simulated) You earned ${REWARD_AMOUNT.toFixed(2)} PESO`);
    }
  } catch (err) {
    console.error('Ad playback error', err);
    alert('Ad failed or was closed. No reward given.');
  }

  // refresh UI
  await refreshCooldownsAndRender();
}

// ---------- Load Monetag script for ad (idempotent) ----------
function loadMonetagScript(ad) {
  // SDK script url is //libtl.com/sdk.js. We pass attributes data-zone and data-sdk.
  const existing = document.querySelector(`script[data-sdk="${ad.sdk}"]`);
  if (existing) return;
  const s = document.createElement('script');
  s.src = '//libtl.com/sdk.js';
  s.setAttribute('data-zone', ad.zone);
  s.setAttribute('data-sdk', ad.sdk);
  document.head.appendChild(s);
}

// ---------- Grant reward and update Firestore cooldowns + balance ----------
async function grantActivityReward(adId) {
  const userRef = doc(db, 'users', CURRENT_USER_ID);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) {
    console.warn('User doc missing while granting activity reward.');
    return;
  }
  const data = userSnap.data();
  const prevBalance = Number(data.balance || 0);
  const newBalance = prevBalance + REWARD_AMOUNT;

  const prevCooldowns = data.activityCooldowns || {};
  prevCooldowns[adId] = Date.now();

  await updateDoc(userRef, {
    balance: newBalance,
    activityCooldowns: prevCooldowns
  });

  updateHeaderBalance(newBalance);
}

// ---------- Refresh cooldowns & re-render ----------
async function refreshCooldownsAndRender() {
  const userRef = doc(db, 'users', CURRENT_USER_ID);
  const s = await getDoc(userRef);
  if (!s.exists()) return;
  const d = s.data();
  renderButtons(d.activityCooldowns || {});
  updateHeaderBalance(d.balance || 0);
}

// ---------- Update balance header ----------
function updateHeaderBalance(balance) {
  headerBalance.textContent = `${formatBalance(balance)} PESO`;
}

// ---------- Init page ----------
init();
