
// app.js (module)
// Full SPA logic: Telegram login, Firestore integration, Daily Ads Room, Activity Room, Referral Room.
// IMPORTANT: Replace FIREBASE_CONFIG and APP_DOMAIN and BOT_USERNAME below.
// Also: Register your app domain with BotFather for your bot to avoid "domain invalid" errors.
// BotFather steps (manual):
//  - Open BotFather in Telegram
//  - /setdomain -> choose your bot -> enter the domain (e.g. yoursite.com or localhost)
//  - For testing on localhost use 'localhost' and ensure the same port is used when testing.

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

// Your public app domain (used for referral link generation).
// Replace with your real deployed domain, e.g. "https://my-earning-app.com"
// Use same domain that you register at BotFather.
const APP_DOMAIN = "https://YOUR_APP_DOMAIN";

// Telegram bot username (without @). Replace with your bot, e.g. Sentinel_KRo_earning_bot
const BOT_USERNAME = "Sentinel_KRo_earning_bot";

// ---------- Constants ----------
const REWARD_AMOUNT_DAILY = 0.01; // peso
const REWARD_AMOUNT_ACTIVITY = 0.02; // peso per activity button (2 interstitial ads)
const DAILY_AD_COOLDOWN_HOURS = 2;
const DAILY_AD_COOLDOWN_MS = DAILY_AD_COOLDOWN_HOURS * 3600 * 1000;
const ACTIVITY_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const ACTIVITY_AD_WATCH_SIM_MS = 1500; // simulated wait per ad for fallback
const DAILY_AD_WATCH_SIM_MS = 1000; // simulated per-second countdown for daily

const MONETAG_DAILY = [
  { id: 1, zone: '10276123', sdk: 'show_10276123', name: 'Monetag Ad #1' }, // 3136495
  { id: 2, zone: '10337795', sdk: 'show_10337795', name: 'Monetag Ad #2' }, // 3152686
  { id: 3, zone: '10337853', sdk: 'show_10337853', name: 'Monetag Ad #3' }  // 3152703
];

const MONETAG_ACTIVITY = [
  { id: 'activity1', zone: '10276123', sdk: 'show_10276123', name: 'Monetag 3136495' },
  { id: 'activity2', zone: '10337795', sdk: 'show_10337795', name: 'Monetag 3152686' },
  { id: 'activity3', zone: '10337853', sdk: 'show_10337853', name: 'Monetag 3152703' }
];

// ---------- Firebase init ----------
const firebaseApp = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(firebaseApp);

// ---------- State ----------
let CURRENT_USER_ID = null; // telegram numeric id as string
let CURRENT_USER_DATA = null;

// ---------- View helpers ----------
const showView = (id) => {
  document.querySelectorAll('.view, section.view').forEach(v => v.style.display = 'none');
  const el = document.getElementById(`view-${id}`) || document.getElementById(`view-${id}`) ;
  // for main we used id view-main
  if (id === 'main') {
    document.getElementById('view-main').style.display = 'block';
  } else {
    const viewId = `view-${id}`;
    const viewEl = document.getElementById(viewId);
    if (viewEl) viewEl.style.display = 'block';
  }
};

// ---------- Telegram Widget injection ----------
function renderTelegramWidget() {
  // The widget requires the domain registered in BotFather to accept the login.
  // We'll create the widget tag that calls the global TelegramLoginWidgetCallback.
  const placeholder = document.getElementById('widget-placeholder');
  placeholder.innerHTML = ''; // clear
  const script = document.createElement('script');
  script.setAttribute('data-telegram-login', BOT_USERNAME);
  script.setAttribute('data-size', 'large');
  script.setAttribute('data-userpic', 'true');
  script.setAttribute('data-onauth', 'TelegramLoginWidgetCallback(user)');
  // The script source is preloaded in index.html, but this tag is needed.
  placeholder.appendChild(script);
}

// Global callback required by the widget
window.TelegramLoginWidgetCallback = async function(user) {
  // user object example: {id, first_name, last_name, username, photo_url, auth_date, hash}
  console.log('Telegram auth:', user);
  CURRENT_USER_ID = String(user.id);
  localStorage.setItem('tg_user_id', CURRENT_USER_ID);
  // If there was a referral in URL stored in localStorage, it'll be attached when creating user doc.
  // Show UI
  document.getElementById('telegram-login-widget').style.display = 'none';
  document.getElementById('profile-container').style.display = 'flex';
  document.getElementById('ads-room-button').style.display = 'block';
  document.getElementById('activity-room-link').style.display = 'block';
  document.getElementById('referral-room-link').style.display = 'block';
  document.getElementById('telegram-username').textContent = `@${user.username || user.first_name || 'User'}`;
  document.getElementById('profile-avatar').src = user.photo_url || 'default-avatar.png';

  // Create or load user document (include referral handling)
  await loadOrCreateUser(user);
};

// ---------- Referral param capture (if user visits via referral link) ----------
(function captureReferralParam() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  if (ref) {
    localStorage.setItem('pending_referrer', ref);
  }
})();

// ---------- Load or create user doc ----------
async function loadOrCreateUser(telegramUser) {
  if (!CURRENT_USER_ID) return;
  const userRef = doc(db, 'users', CURRENT_USER_ID);
  const snap = await getDoc(userRef);
  const pendingReferrer = localStorage.getItem('pending_referrer') || null;

  if (snap.exists()) {
    CURRENT_USER_DATA = snap.data();
    updateAllBalances(CURRENT_USER_DATA.balance || 0);
  } else {
    // create
    const newUser = {
      telegramId: telegramUser.id,
      telegramUsername: telegramUser.username || null,
      firstName: telegramUser.first_name || null,
      balance: 0.00,
      adCooldowns: {}, // daily ads cooldown map adId -> timestamp
      activityCooldowns: {}, // activity cooldowns map buttonId -> timestamp
      referrerId: pendingReferrer || null,
      referralCount: 0,
      pendingReferralEarnings: 0.00,
      createdAt: new Date().toISOString()
    };
    await setDoc(userRef, newUser);
    CURRENT_USER_DATA = newUser;

    // If referral present, increment referrer's referralCount atomically
    if (pendingReferrer) {
      try {
        const refRef = doc(db, 'users', pendingReferrer);
        await updateDoc(refRef, { referralCount: increment(1) });
      } catch (e) {
        console.warn('Could not increment referrer count (maybe referrer doc missing).', e);
      }
      // remove pending ref so it won't reapply
      localStorage.removeItem('pending_referrer');
    }
    updateAllBalances(0);
  }

  // initialize ad & activity UI
  initializeAdsRoom(); // daily
  initializeActivityRoom(); // activity buttons
}

// ---------- Coin display update ----------
function updateAllBalances(value) {
  const formatted = Number(value || 0).toFixed(2);
  document.getElementById('coin-balance').textContent = formatted;
  const hb = document.querySelectorAll('.header-balance');
  hb.forEach(el => el.textContent = `${formatted} PESO`);
}

// ---------- DAILY ADS ROOM (2-hour cooldown, 0.01 reward) ----------
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
  container.innerHTML = '';
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
  // load Monetag SDK (idempotent)
  loadMonetagScript(ad.zone, ad.sdk);

  // Simulate 5s watch time (visual)
  for (let i = 5; i > 0; i--) {
    button.textContent = `Watching... (${i}s)`;
    await new Promise(r => setTimeout(r, 1000));
  }

  const showFn = window[ad.sdk];
  if (typeof showFn === 'function') {
    try {
      await showFn('pop'); // Monetag promise
      await grantDailyReward(ad.id);
      alert(`You earned ${REWARD_AMOUNT_DAILY.toFixed(2)} PESO`);
    } catch (e) {
      console.error('Monetag error', e);
      alert('Ad failed or closed. No reward.');
    }
  } else {
    // simulated fallback
    await grantDailyReward(ad.id);
    alert(`(Simulated) You earned ${REWARD_AMOUNT_DAILY.toFixed(2)} PESO`);
  }

  showView('main');
}

// update balance & cooldown in Firestore for daily reward
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

// ---------- ACTIVITY ROOM (3 buttons; each click runs 2 interstitials; reward 0.02; 5-minute cooldown) ----------
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
  button.textContent = 'Loading ads...';
  loadMonetagScript(ad.zone, ad.sdk);
  // Try calling SDK twice sequentially; fallback to simulated waits
  const fn = window[ad.sdk];
  try {
    if (typeof fn === 'function') {
      button.textContent = 'Showing ad 1 of 2...';
      await fn();
      button.textContent = 'Showing ad 2 of 2...';
      await fn();
    } else {
      // simulate two interstitials
      button.textContent = 'Simulating ad 1 of 2...';
      await new Promise(r => setTimeout(r, ACTIVITY_AD_WATCH_SIM_MS));
      button.textContent = 'Simulating ad 2 of 2...';
      await new Promise(r => setTimeout(r, ACTIVITY_AD_WATCH_SIM_MS));
    }
    // Reward user
    await grantActivityReward(ad.id);
    alert(`You earned ${REWARD_AMOUNT_ACTIVITY.toFixed(2)} PESO`);
  } catch (e) {
    console.error('Activity ad error', e);
    alert('Ad failed or closed. No reward.');
  }
  renderActivityButtons();
  showView('main');
}

async function grantActivityReward(adId) {
  if (!CURRENT_USER_ID) return;
  const ref = doc(db, 'users', CURRENT_USER_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const newBalance = Number(data.balance || 0) + REWARD_AMOUNT_ACTIVITY;
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
  const refLink = `${APP_DOMAIN}?ref=${CURRENT_USER_ID}`;
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

// ---------- Monetag SDK loader (idempotent) ----------
function loadMonetagScript(zone, sdk) {
  // ensure only one global sdk script is added (Monetag uses script attributes)
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
  showView('main');

  // if user id in localStorage, auto-show UI
  const stored = localStorage.getItem('tg_user_id');
  if (stored) {
    CURRENT_USER_ID = stored;
    // show UI elements
    document.getElementById('telegram-login-widget').style.display = 'none';
    document.getElementById('profile-container').style.display = 'flex';
    document.getElementById('ads-room-button').style.display = 'block';
    document.getElementById('activity-room-link').style.display = 'block';
    document.getElementById('referral-room-link').style.display = 'block';
    // set username placeholder (could fetch actual username from Firestore)
    document.getElementById('telegram-username').textContent = `@user`;
    // load user doc
    loadOrCreateUser({ id: stored });
  } else {
    renderTelegramWidget();
  }

  // Back button behaviors are already attached in initialize functions, but ensure main back links exist
  // Also ensure top-left/back navigation works for returning to main
}

initApp();
