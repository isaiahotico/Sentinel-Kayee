
// app.js (module)
// Simplified user management via usernames instead of Telegram authentication.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, increment
} from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

// ---------- CONFIG ----------
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};

// Initialize Firebase
const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);

// ---------- Constants ----------
const REWARD_AMOUNT_DAILY = 0.01; // reward for daily ads
const REWARD_AMOUNT_ACTIVITY = 0.02; // reward per activity click
const DAILY_AD_COOLDOWN_HOURS = 2; // cooldown for daily ads
const DAILY_AD_COOLDOWN_MS = DAILY_AD_COOLDOWN_HOURS * 3600 * 1000; // in milliseconds
const ACTIVITY_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes for activity buttons

const MONETAG_DAILY = [
  { id: 1, zone: '10276123', sdk: 'show_10276123', name: 'Monetag Ad #1' }, // ID: 3136495
  { id: 2, zone: '10337795', sdk: 'show_10337795', name: 'Monetag Ad #2' }, // ID: 3152686
  { id: 3, zone: '10337853', sdk: 'show_10337853', name: 'Monetag Ad #3' }  // ID: 3152703
];

const MONETAG_ACTIVITY = [
  { id: 'activity1', zone: '10276123', sdk: 'show_10276123', name: 'Monetag 3136495' },
  { id: 'activity2', zone: '10337795', sdk: 'show_10337795', name: 'Monetag 3152686' },
  { id: 'activity3', zone: '10337853', sdk: 'show_10337853', name: 'Monetag 3152703' }
];

// ---------- State ----------
let CURRENT_USER_ID = null; // Firebase user document ID
let CURRENT_USER_DATA = null; // Holds user data after loading

// ---------- UI helpers ----------
// Show designated view, hide all others
const showView = (id) => {
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
  const el = document.getElementById(`view-${id}`);
  if (el) el.style.display = 'block';
};

// ---------- On click for login button to create user document ----------
document.getElementById('login-button').addEventListener('click', async () => {
  const usernameInput = document.getElementById('username-input');
  const username = usernameInput.value.trim();
  
  if (!username) {
    document.getElementById('error-message').textContent = "Username cannot be empty.";
    return;
  }

  // Create or load user by username
  await createOrLoadUser(username);
});

// ---------- Create or load user document ----------
async function createOrLoadUser(username) {
  const userRef = doc(db, 'users', username);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    // User exists
    CURRENT_USER_DATA = userSnap.data();
  } else {
    // Create new user
    const newUser = {
      username: username,
      balance: 0.00,
      adCooldowns: {},
      activityCooldowns: {},
      referralCount: 0,
      pendingReferralEarnings: 0.00,
      createdAt: new Date().toISOString()
    };
    await setDoc(userRef, newUser);
    CURRENT_USER_DATA = newUser;
  }

  CURRENT_USER_ID = username; // Username used as document ID
  localStorage.setItem('username', CURRENT_USER_ID); // Persist login state
  updateUIAfterLogin();
}

// ---------- Update UI After Successful Login ----------
function updateUIAfterLogin() {
  // Hide login section and show main application sections
  document.getElementById('login-section').style.display = 'none';
  document.getElementById('coin-display-container').style.display = 'block';
  document.getElementById('top-right-widgets').style.display = 'flex';
  document.getElementById('username-display').textContent = `@${CURRENT_USER_ID}`;
  updateAllBalances(CURRENT_USER_DATA.balance || 0);
  initializeAdsRoom(); 
  initializeActivityRoom();
  initializeReferralRoom();
}

// ---------- Coin display update ----------
function updateAllBalances(value) {
  document.getElementById('coin-balance').textContent = parseFloat(value).toFixed(2);
  const hb = document.querySelectorAll('.header-balance');
  hb.forEach(el => el.textContent = `${parseFloat(value).toFixed(2)} PESO`);
}

// ---------- DAILY ADS ROOM (2-hour cooldown) ----------
function initializeAdsRoom() {
  const adsButton = document.getElementById('ads-room-button');
  adsButton.addEventListener('click', () => {
    renderDailyAdSlots();
    showView('ads-room');
  });
  document.getElementById('back-from-ads').addEventListener('click', (e) => {
    e.preventDefault();
    showView('main');
  });
}

async function renderDailyAdSlots() {
  const container = document.getElementById('ad-slots-container');
  container.innerHTML = ''; // Clear previous slots
  if (!CURRENT_USER_ID) return;
  
  const userSnap = await getDoc(doc(db, 'users', CURRENT_USER_ID));
  const cooldowns = (userSnap.exists() && userSnap.data().adCooldowns) || {};

  MONETAG_DAILY.forEach(ad => {
    const last = cooldowns[ad.id] || 0;
    const elapsed = Date.now() - last;
    const isReady = elapsed >= DAILY_AD_COOLDOWN_MS;

    const slot = document.createElement('div');
    slot.className = 'ad-slot';
    slot.innerHTML = `
      <p><strong>${ad.name}</strong></p>
      <div class="ad-timer" id="daily-timer-${ad.id}">${isReady ? 'Ready to Watch' : ''}</div>
      <button id="daily-btn-${ad.id}" ${isReady ? '' : 'disabled'}>${isReady ? `Watch Ad (${REWARD_AMOUNT_DAILY.toFixed(2)} PESO)` : 'Cooling Down...'}</button>
    `;
    container.appendChild(slot);

    const btn = document.getElementById(`daily-btn-${ad.id}`);
    if (isReady) {
      btn.addEventListener('click', () => dailyWatchAd(ad, btn));
    } else {
      startDailyCountdown(ad.id, last);
    }
  });
}

function startDailyCountdown(adId, lastTs) {
  const el = document.getElementById(`daily-timer-${adId}`);
  if (!el) return;
  const interval = setInterval(() => {
    const remaining = DAILY_AD_COOLDOWN_MS - (Date.now() - lastTs);
    if (remaining <= 0) {
      clearInterval(interval);
      renderDailyAdSlots();
      return;
    }
    const s = Math.floor(remaining / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    el.textContent = `Ready in: ${h}h ${m}m ${sec}s`;
  }, 1000);
}

async function dailyWatchAd(ad, button) {
  button.disabled = true;
  button.textContent = 'Loading Ad...';
  loadMonetagScript(ad.zone, ad.sdk);

  // Simulate 5s watch time
  for (let i = 5; i > 0; i--) {
    button.textContent = `Watching... (${i}s)`;
    await new Promise(r => setTimeout(r, 1000));
  }

  const showFn = window[ad.sdk];
  if (typeof showFn === 'function') {
    try {
      await showFn('pop');
      await grantDailyReward(ad.id);
      alert(`You earned ${REWARD_AMOUNT_DAILY.toFixed(2)} PESO`);
    } catch (e) {
      console.error('Monetag error', e);
      alert('Ad failed or closed. No reward.');
    }
  } else {
    await grantDailyReward(ad.id);
    alert(`(Simulated) You earned ${REWARD_AMOUNT_DAILY.toFixed(2)} PESO`);
  }

  showView('main');
}

// Grant daily reward (increment balance, update cooldown)
async function grantDailyReward(adId) {
  if (!CURRENT_USER_ID) return;
  const ref = doc(db, 'users', CURRENT_USER_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  
  const data = snap.data();
  const newBalance = Number(data.balance || 0) + REWARD_AMOUNT_DAILY;
  const newCooldowns = data.adCooldowns || {};
  newCooldowns[adId] = Date.now();
  
  await updateDoc(ref, { balance: newBalance, adCooldowns: newCooldowns });
  updateAllBalances(newBalance);
}

// ---------- ACTIVITY ROOM ----------
function initializeActivityRoom() {
  document.getElementById('activity-room-link').addEventListener('click', (e) => {
    e.preventDefault();
    renderActivityButtons();
    showView('activity');
  });
  document.getElementById('back-from-activity').addEventListener('click', (e) => {
    e.preventDefault();
    showView('main');
  });
}

async function renderActivityButtons() {
  const container = document.getElementById('activity-buttons');
  container.innerHTML = '';
  if (!CURRENT_USER_ID) return;

  const snap = await getDoc(doc(db, 'users', CURRENT_USER_ID));
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
    if (ready) {
      btn.addEventListener('click', () => onActivityClick(ad, btn));
    } else {
      startActivityCountdown(ad.id, last);
    }
  });
}

function startActivityCountdown(adId, lastTs) {
  const el = document.getElementById(`act-timer-${adId}`);
  if (!el) return;
  const interval = setInterval(() => {
    const remaining = ACTIVITY_COOLDOWN_MS - (Date.now() - lastTs);
    if (remaining <= 0) {
      clearInterval(interval);
      renderActivityButtons();
      return;
    }
    const s = Math.floor(remaining / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    el.textContent = `Ready in ${m}m ${sec}s`;
  }, 1000);
}

async function onActivityClick(ad, button) {
  button.disabled = true;
  button.textContent = 'Loading Ads...';
  loadMonetagScript(ad.zone, ad.sdk);
  
  const fn = window[ad.sdk];
  try {
    if (typeof fn === 'function') {
      button.textContent = 'Showing ad 1 of 2...';
      await fn();
      button.textContent = 'Showing ad 2 of 2...';
      await fn();
    } else {
      button.textContent = 'Simulating ad 1 of 2...';
      await new Promise(r => setTimeout(r, ACTIVITY_AD_WATCH_SIM_MS));
      button.textContent = 'Simulating ad 2 of 2...';
      await new Promise(r => setTimeout(r, ACTIVITY_AD_WATCH_SIM_MS));
    }
    await grantActivityReward(ad.id);
    alert(`You earned ${REWARD_AMOUNT_ACTIVITY.toFixed(2)} PESO`);
  } catch (e) {
    console.error('Activity ad error', e);
    alert('Ad failed or closed. No reward.');
  }
  renderActivityButtons();
  showView('main');
}

// Grant activity reward
async function grantActivityReward(adId) {
  if (!CURRENT_USER_ID) return;
  const ref = doc(db, 'users', CURRENT_USER_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  
  const data = snap.data();
  const newBalance = (data.balance || 0) + REWARD_AMOUNT_ACTIVITY;
  const newCooldowns = data.activityCooldowns || {};
  newCooldowns[adId] = Date.now();
  
  await updateDoc(ref, { balance: newBalance, activityCooldowns: newCooldowns });
  updateAllBalances(newBalance);
}

// ---------- REFERRAL ROOM ----------
document.getElementById('referral-room-link').addEventListener('click', (e) => {
  e.preventDefault();
  renderReferralRoom();
  showView('referral');
});
document.getElementById('back-from-referral').addEventListener('click', (e) => {
  e.preventDefault();
  showView('main');
});

async function renderReferralRoom() {
  const input = document.getElementById('referral-link-input');
  const totalRef = document.getElementById('total-referrals');
  const pendingE = document.getElementById('pending-earnings');
  if (!CURRENT_USER_ID) {
    alert('Login required');
    showView('main');
    return;
  }
  const userSnap = await getDoc(doc(db, 'users', CURRENT_USER_ID));
  if (!userSnap.exists()) {
    alert('User data missing');
    return;
  }
  
  const data = userSnap.data();
  updateAllBalances(data.balance || 0);
  
  // Referral link format: APP_DOMAIN + "?ref=USER_ID"
  const refLink = `${window.location.origin}?ref=${CURRENT_USER_ID}`; // Current domain with referral id
  input.value = refLink;
  totalRef.textContent = data.referralCount || 0;
  pendingE.textContent = `${Number(data.pendingReferralEarnings || 0).toFixed(2)} PESO`;
  
  document.getElementById('copy-link-button').onclick = async () => {
    try {
      await navigator.clipboard.writeText(refLink);
      const btn = document.getElementById('copy-link-button');
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy Link', 1500);
    } catch (e) {
      alert('Could not copy link. Select and copy manually.');
    }
  };
}

// Load Monetag SDK (idempotent)
function loadMonetagScript(zone, sdk) {
  const existing = document.querySelector(`script[data-sdk="${sdk}"]`);
  if (existing) return;
  
  const s = document.createElement('script');
  s.src = '//libtl.com/sdk.js';
  s.setAttribute('data-zone', zone);
  s.setAttribute('data-sdk', sdk);
  document.head.appendChild(s);
}

// ---------- On load: show main view and render widget if not logged in ----------
function initApp() {
  // Show login view until username entered
  showView('main');
}

initApp();
