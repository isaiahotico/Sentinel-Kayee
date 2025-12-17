
// app.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

// --- Configuration ---
// IMPORTANT: REPLACE THESE WITH YOUR ACTUAL FIREBASE PROJECT CREDENTIALS.
// For public GitHub repositories, use environment variables or a secure configuration method.
const FIREBASE_CONFIG = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "SENDER_ID",
    appId: "APP_ID"
};

const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);

let CURRENT_USER_ID = null;
const REWARD_AMOUNT_DAILY = 0.01;
const AD_COOLDOWN_HOURS = 2;
const AD_COOLDOWN_MS = AD_COOLDOWN_HOURS * 60 * 60 * 1000;
const AD_WATCH_DURATION_MS = 5000; // 5 seconds view requirement

const MONETAG_ADS = [
    { id: 1, zone: '10276123', sdk: 'show_10276123', name: 'Monetag Ad #1' },
    { id: 2, zone: '10337795', sdk: 'show_10337795', name: 'Monetag Ad #2' },
    { id: 3, zone: '10337853', sdk: 'show_10337853', name: 'Monetag Ad #3' }
];

// --- Global Telegram Callback Function (Must be global for the widget to call it) ---
window.TelegramLoginWidgetCallback = async function(user) {
    console.log("Telegram User Authenticated:", user);

    // 1. Set the global user ID and persist to localStorage for multi-page use
    CURRENT_USER_ID = user.id.toString(); 
    localStorage.setItem('tg_user_id', CURRENT_USER_ID);

    // 2. Hide the login widget and show the app UI
    document.getElementById('telegram-login-widget').style.display = 'none';
    document.getElementById('profile-container').style.display = 'flex';
    document.getElementById('ads-room-button').style.display = 'block';
    document.getElementById('activity-room-link').style.display = 'block';

    // 3. Update Profile UI
    document.getElementById('telegram-username').textContent = `@${user.username || 'User'}`;
    document.getElementById('profile-avatar').src = user.photo_url || 'default-avatar.png';

    // 4. Load or Create User Data in Firebase
    await loadOrCreateUser(user);
};

// --- Firebase Data Management ---

async function loadOrCreateUser(telegramUser) {
    const userRef = doc(db, "users", CURRENT_USER_ID);
    const docSnap = await getDoc(userRef);

    if (docSnap.exists()) {
        const data = docSnap.data();
        updateCoinDisplay(data.balance || 0);
    } else {
        // New user, create initial data
        const initialUserData = {
            telegramId: telegramUser.id,
            telegramUsername: telegramUser.username,
            firstName: telegramUser.first_name,
            balance: 0.00,
            adCooldowns: {}, // Daily Ads Room cooldowns
            activityCooldowns: {}, // Activity Room cooldowns (used by activity.js)
            createdAt: new Date().toISOString()
        };
        await setDoc(userRef, initialUserData);
        updateCoinDisplay(0.00);
    }
    
    // Initialize the daily ads room functionality
    initializeAdsRoom();
}

function updateCoinDisplay(balance) {
    // Format to two decimal places (Peso)
    document.getElementById('coin-balance').textContent = Number(balance).toFixed(2);
}

async function rewardUser(adId) {
    if (!CURRENT_USER_ID) return;

    const userRef = doc(db, "users", CURRENT_USER_ID);
    const docSnap = await getDoc(userRef);
    
    if (docSnap.exists()) {
        const data = docSnap.data();
        const newBalance = data.balance + REWARD_AMOUNT_DAILY;
        
        // Update balance and cooldown time
        const newCooldowns = data.adCooldowns || {};
        newCooldowns[adId] = Date.now();

        await updateDoc(userRef, {
            balance: newBalance,
            adCooldowns: newCooldowns
        });

        updateCoinDisplay(newBalance);
        console.log(`User rewarded ${REWARD_AMOUNT_DAILY}. New balance: ${newBalance}`);
        
        // Re-render the ad slots to update timers
        renderAdSlots(newCooldowns);
    }
}

// --- Daily Ads Room Logic (2-hour cooldown) ---

function initializeAdsRoom() {
    document.getElementById('ads-room-button').addEventListener('click', openAdsRoomModal);
    document.getElementById('close-modal-button').addEventListener('click', closeAdsRoomModal);
    
    // Load initial cooldowns to render the slots
    loadAdCooldowns();
}

async function loadAdCooldowns() {
    if (!CURRENT_USER_ID) return;
    const userRef = doc(db, "users", CURRENT_USER_ID);
    const docSnap = await getDoc(userRef);
    if (docSnap.exists()) {
        renderAdSlots(docSnap.data().adCooldowns || {});
    }
}

function openAdsRoomModal() {
    document.getElementById('ads-room-modal').style.display = 'flex';
    loadAdCooldowns(); // Ensure timers are fresh when opened
}

function closeAdsRoomModal() {
    document.getElementById('ads-room-modal').style.display = 'none';
}

function renderAdSlots(cooldowns) {
    const container = document.getElementById('ad-slots-container');
    container.innerHTML = '';

    MONETAG_ADS.forEach(ad => {
        const lastWatched = cooldowns[ad.id] || 0;
        const timeSinceLastWatch = Date.now() - lastWatched;
        const isReady = timeSinceLastWatch >= AD_COOLDOWN_MS;

        const adSlot = document.createElement('div');
        adSlot.className = 'ad-slot';
        adSlot.innerHTML = `
            <p><strong>${ad.name}</strong></p>
            <div id="ad-timer-${ad.id}" class="ad-timer">${isReady ? 'Ready to Watch' : ''}</div>
            <button id="watch-ad-${ad.id}" ${!isReady ? 'disabled' : ''}>
                ${isReady ? `Watch Ad (${REWARD_AMOUNT_DAILY.toFixed(2)} PESO)` : 'Cooling Down...'}
            </button>
        `;
        container.appendChild(adSlot);

        const button = document.getElementById(`watch-ad-${ad.id}`);
        
        if (isReady) {
            button.addEventListener('click', () => watchAd(ad, button));
        } else {
            // Start countdown timer if not ready
            startCountdownTimer(ad.id, lastWatched);
        }
    });
}

function startCountdownTimer(adId, lastWatchedTime) {
    const timerElement = document.getElementById(`ad-timer-${adId}`);
    const update = () => {
        const timePassed = Date.now() - lastWatchedTime;
        const remainingTime = AD_COOLDOWN_MS - timePassed;

        if (remainingTime <= 0) {
            // Cooldown finished
            clearInterval(interval);
            loadAdCooldowns(); // Re-render to enable the button
            return;
        }

        const totalSeconds = Math.floor(remainingTime / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        timerElement.textContent = `Ready in: ${hours}h ${minutes}m ${seconds}s`;
    };

    update();
    const interval = setInterval(update, 1000);
}

// --- Monetag Integration (Rewarded Popup) ---

async function watchAd(ad, button) {
    button.disabled = true;
    button.textContent = "Loading Ad...";

    // Dynamically load the Monetag SDK script for this zone
    const script = document.createElement('script');
    script.src = `//libtl.com/sdk.js`;
    script.setAttribute('data-zone', ad.zone);
    script.setAttribute('data-sdk', ad.sdk);
    document.head.appendChild(script);

    // Simulate the 5-second watch time requirement
    for (let i = 5; i > 0; i--) {
        button.textContent = `Watching... (${i}s)`;
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Execute the Monetag Rewarded Popup
    const showAdFunction = window[ad.sdk];

    if (typeof showAdFunction === 'function') {
        try {
            button.textContent = "Ad Displayed. Close to continue.";
            await showAdFunction('pop'); 
            
            // Reward the user and update the cooldown
            await rewardUser(ad.id);
            alert(`Reward successful! You earned ${REWARD_AMOUNT_DAILY.toFixed(2)} PESO.`);
            
        } catch (e) {
            console.error("Monetag Ad Error:", e);
            alert("Ad failed or was closed prematurely. No reward given.");
        }
    } else {
        console.warn(`Monetag SDK function ${ad.sdk} not found. Simulating reward.`);
        // Fallback for testing without the live SDK
        await rewardUser(ad.id);
        alert(`(Simulated) Reward successful! You earned ${REWARD_AMOUNT_DAILY.toFixed(2)} PESO.`);
    }
    
    // Close the modal upon completion/failure
    closeAdsRoomModal();
}

// --- Initial Check on Page Load ---
// If the user ID is already in localStorage (meaning they logged in previously), 
// load their coin balance and initialize the UI.
const storedUserId = localStorage.getItem('tg_user_id');
if (storedUserId) {
    CURRENT_USER_ID = storedUserId;
    // Simulate the user object needed for loadOrCreateUser
    const dummyUser = { id: storedUserId }; 
    
    // Show UI elements immediately
    document.getElementById('telegram-login-widget').style.display = 'none';
    document.getElementById('profile-container').style.display = 'flex';
    document.getElementById('ads-room-button').style.display = 'block';
    document.getElementById('activity-room-link').style.display = 'block';
    
    loadOrCreateUser(dummyUser);
}
