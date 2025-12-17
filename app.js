
// --- Configuration ---
const DAILY_REWARD_AMOUNT = 0.01; // Peso for Daily Ads
const DAILY_COOLDOWN_TIME_MS = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

const ACTIVITY_REWARD_AMOUNT = 0.02; // Peso for Activity Ads (Original room)
const ACTIVITY_COOLDOWN_TIME_MS = 5 * 60 * 1000; // 5 minutes in milliseconds for Activity Ads (Original room)

const ACTIVITY1_REWARD_AMOUNT = 0.02; // Peso for Activity Ads #1 (NEW room)
const ACTIVITY1_COOLDOWN_TIME_MS = 5 * 60 * 1000; // 5 minutes in milliseconds for Activity Ads #1 (NEW room)

const REWARD_DELAY_SECONDS = 5; // Delay after ad closes before reward is given

// Monetag Zone IDs (same IDs used for both popup and interstitial, Monetag differentiates by function call)
const MONETAG_ZONES = {
    '1': '10276123',
    '2': '10337795',
    '3': '10337853'
};

// --- DOM Elements ---
const currentCoinsSpan = document.getElementById('current-coins');
const mainAppContent = document.getElementById('main-app-content');

// Daily Ads Room elements
const openDailyAdsRoomBtn = document.getElementById('open-daily-ads-room');
const closeDailyAdsRoomBtn = document.getElementById('close-daily-ads-room');
const dailyAdsRoomDiv = document.getElementById('daily-ads-room'); // Updated ID
const dailyWatchAdButtons = document.querySelectorAll('.watch-ad-btn[data-ad-type="daily"]');

// Activity Room (Original) elements
const openActivityRoomBtn = document.getElementById('open-activity-room');
const closeActivityRoomBtn = document.getElementById('close-activity-room');
const activityRoomDiv = document.getElementById('activity-room');
const activityWatchAdButtons = document.querySelectorAll('.watch-ad-btn[data-ad-type="activity"]');

// Activity Room #1 (NEW) elements
const openActivityRoom1Btn = document.getElementById('open-activity-room-1');
const closeActivityRoom1Btn = document.getElementById('close-activity-room-1');
const activityRoom1Div = document.getElementById('activity-room-1');
const activity1WatchAdButtons = document.querySelectorAll('.watch-ad-btn[data-ad-type="activity1"]');


// --- State Variables ---
let coins = 0.00;
let dailyAdCooldowns = {}; // Stores { 'adId': cooldownEndTimeMs } for daily ads
let activityAdCooldowns = {}; // Stores { 'adId': cooldownEndTimeMs } for original activity ads
let activity1AdCooldowns = {}; // Stores { 'adId': cooldownEndTimeMs } for NEW activity ads


// --- Utility Functions ---

/**
 * Formats milliseconds into HH:MM:SS string.
 * @param {number} ms - Milliseconds remaining.
 * @returns {string} Formatted time string.
 */
function formatTime(ms) {
    if (ms <= 0) return 'Ready!';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (num) => num.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// --- Core Logic Functions ---

/**
 * Updates the coin display and saves to local storage.
 */
function updateCoinDisplay() {
    currentCoinsSpan.textContent = coins.toFixed(2);
    localStorage.setItem('userCoins', coins.toFixed(2));
}

/**
 * Loads user data from local storage.
 */
function loadUserData() {
    const storedCoins = localStorage.getItem('userCoins');
    if (storedCoins) {
        coins = parseFloat(storedCoins);
    }
    const storedDailyCooldowns = localStorage.getItem('dailyAdCooldowns');
    if (storedDailyCooldowns) {
        dailyAdCooldowns = JSON.parse(storedDailyCooldowns);
    }
    const storedActivityCooldowns = localStorage.getItem('activityAdCooldowns');
    if (storedActivityCooldowns) {
        activityAdCooldowns = JSON.parse(storedActivityCooldowns);
    }
    const storedActivity1Cooldowns = localStorage.getItem('activity1AdCooldowns'); // Load new cooldown
    if (storedActivity1Cooldowns) {
        activity1AdCooldowns = JSON.parse(storedActivity1Cooldowns);
    }
    updateCoinDisplay();
}

/**
 * Saves all ad cooldowns to local storage.
 */
function saveCooldowns() {
    localStorage.setItem('dailyAdCooldowns', JSON.stringify(dailyAdCooldowns));
    localStorage.setItem('activityAdCooldowns', JSON.stringify(activityAdCooldowns));
    localStorage.setItem('activity1AdCooldowns', JSON.stringify(activity1AdCooldowns)); // Save new cooldown
}

/**
 * Updates the timer and button state for a specific ad.
 * @param {string} adId - The ID of the ad (e.g., '1', '2', '3').
 * @param {string} adType - 'daily', 'activity', or 'activity1'.
 */
function updateAdState(adId, adType) {
    const watchBtn = document.querySelector(`.watch-ad-btn[data-ad-type="${adType}"][data-ad-id="${adId}"]`);
    const timerDiv = document.querySelector(`.ad-timer[data-ad-type="${adType}"][data-ad-id="${adId}"]`);

    if (!watchBtn || !timerDiv) return;

    let cooldowns, cooldownTimeMs;
    switch (adType) {
        case 'daily':
            cooldowns = dailyAdCooldowns;
            cooldownTimeMs = DAILY_COOLDOWN_TIME_MS;
            break;
        case 'activity':
            cooldowns = activityAdCooldowns;
            cooldownTimeMs = ACTIVITY_COOLDOWN_TIME_MS;
            break;
        case 'activity1': // NEW activity room
            cooldowns = activity1AdCooldowns;
            cooldownTimeMs = ACTIVITY1_COOLDOWN_TIME_MS;
            break;
        default:
            return; // Invalid adType
    }

    const cooldownEndTime = cooldowns[adId];
    const now = Date.now();

    if (cooldownEndTime && now < cooldownEndTime) {
        const remainingTime = cooldownEndTime - now;
        timerDiv.textContent = formatTime(remainingTime);
        watchBtn.disabled = true;
    } else {
        timerDiv.textContent = 'Ready!';
        watchBtn.disabled = false;
        // Clean up past cooldowns
        if (cooldowns[adId]) {
            delete cooldowns[adId];
            saveCooldowns();
        }
    }
}

/**
 * Updates all ad timers and button states for a given type.
 * @param {string} adType - 'daily', 'activity', or 'activity1'.
 */
function updateAllTimers(adType) {
    Object.keys(MONETAG_ZONES).forEach(adId => {
        updateAdState(adId, adType);
    });
}

/**
 * Handles the click event for watching a Daily Ad (Rewarded Popup).
 * @param {Event} event - The click event.
 */
async function handleWatchDailyAd(event) {
    const button = event.target;
    const adId = button.dataset.adId;
    const zoneId = MONETAG_ZONES[adId];
    const rewardMessageDiv = document.querySelector(`.reward-message[data-ad-type="daily"][data-ad-id="${adId}"]`);

    if (!zoneId) {
        console.error(`Monetag zone ID not found for ad ID: ${adId}`);
        rewardMessageDiv.textContent = 'Error: Ad not configured.';
        return;
    }

    const showMonetagAd = window[`show_${zoneId}`];

    if (typeof showMonetagAd !== 'function') {
        console.error(`Monetag SDK function show_${zoneId} not available.`);
        rewardMessageDiv.textContent = 'Error: Ad SDK not loaded.';
        return;
    }

    button.disabled = true;
    rewardMessageDiv.textContent = 'Opening ad...';

    try {
        await showMonetagAd('pop'); // This is for Rewarded Popup
        rewardMessageDiv.textContent = `Ad watched! Rewarding in ${REWARD_DELAY_SECONDS} seconds...`;

        await new Promise(resolve => setTimeout(resolve, REWARD_DELAY_SECONDS * 1000));

        coins += DAILY_REWARD_AMOUNT;
        updateCoinDisplay();
        dailyAdCooldowns[adId] = Date.now() + DAILY_COOLDOWN_TIME_MS;
        saveCooldowns();
        updateAdState(adId, 'daily');
        rewardMessageDiv.textContent = `+${DAILY_REWARD_AMOUNT.toFixed(2)} peso awarded!`;
        setTimeout(() => rewardMessageDiv.textContent = '', 3000);

    } catch (e) {
        console.error(`Error showing Daily Monetag ad for zone ${zoneId}:`, e);
        rewardMessageDiv.textContent = 'Ad could not be displayed or was closed early.';
        button.disabled = false;
        setTimeout(() => rewardMessageDiv.textContent = '', 3000);
    }
}

/**
 * Handles the click event for watching an Activity Ad (2x Rewarded Interstitial - Original Room).
 * @param {Event} event - The click event.
 */
async function handleWatchActivityAd(event) {
    const button = event.target;
    const adId = button.dataset.adId;
    const zoneId = MONETAG_ZONES[adId];
    const rewardMessageDiv = document.querySelector(`.reward-message[data-ad-type="activity"][data-ad-id="${adId}"]`);

    if (!zoneId) {
        console.error(`Monetag zone ID not found for ad ID: ${adId}`);
        rewardMessageDiv.textContent = 'Error: Ad not configured.';
        return;
    }

    const showMonetagAd = window[`show_${zoneId}`];

    if (typeof showMonetagAd !== 'function') {
        console.error(`Monetag SDK function show_${zoneId} not available.`);
        rewardMessageDiv.textContent = 'Error: Ad SDK not loaded.';
        return;
    }

    // Disable all activity buttons in this room immediately as per cooldown logic
    activityWatchAdButtons.forEach(btn => btn.disabled = true);
    rewardMessageDiv.textContent = 'Opening ads...';

    let adsShownSuccessfully = false;
    try {
        rewardMessageDiv.textContent = 'Showing 1st interstitial ad...';
        await showMonetagAd(); // First interstitial ad
        rewardMessageDiv.textContent = 'Showing 2nd interstitial ad...';
        await showMonetagAd(); // Second interstitial ad
        adsShownSuccessfully = true;

        rewardMessageDiv.textContent = `Ads watched! Rewarding in ${REWARD_DELAY_SECONDS} seconds...`;
        await new Promise(resolve => setTimeout(resolve, REWARD_DELAY_SECONDS * 1000));

        coins += ACTIVITY_REWARD_AMOUNT;
        updateCoinDisplay();

        // Apply cooldown to ALL activity ad buttons in this room
        const cooldownEndTime = Date.now() + ACTIVITY_COOLDOWN_TIME_MS;
        Object.keys(MONETAG_ZONES).forEach(id => {
            activityAdCooldowns[id] = cooldownEndTime;
        });
        saveCooldowns();
        updateAllTimers('activity'); // Update all activity timers for this room
        rewardMessageDiv.textContent = `+${ACTIVITY_REWARD_AMOUNT.toFixed(2)} peso awarded!`;
        setTimeout(() => rewardMessageDiv.textContent = '', 3000);

    } catch (e) {
        console.error(`Error showing Activity Monetag ad for zone ${zoneId}:`, e);
        rewardMessageDiv.textContent = 'One or both ads could not be displayed or were closed early.';
        // If ads failed, re-enable buttons (if they weren't already on cooldown from a previous successful click)
        if (!adsShownSuccessfully) {
             Object.keys(MONETAG_ZONES).forEach(id => {
                const btn = document.querySelector(`.watch-ad-btn[data-ad-type="activity"][data-ad-id="${id}"]`);
                if (btn && (!activityAdCooldowns[id] || activityAdCooldowns[id] <= Date.now())) {
                    btn.disabled = false;
                }
            });
        }
        setTimeout(() => rewardMessageDiv.textContent = '', 3000);
    }
}


/**
 * Handles the click event for watching an Activity Ad (2x Rewarded Interstitial - NEW Room #1).
 * @param {Event} event - The click event.
 */
async function handleWatchActivity1Ad(event) {
    const button = event.target;
    const adId = button.dataset.adId;
    const zoneId = MONETAG_ZONES[adId];
    const rewardMessageDiv = document.querySelector(`.reward-message[data-ad-type="activity1"][data-ad-id="${adId}"]`);

    if (!zoneId) {
        console.error(`Monetag zone ID not found for ad ID: ${adId}`);
        rewardMessageDiv.textContent = 'Error: Ad not configured.';
        return;
    }

    const showMonetagAd = window[`show_${zoneId}`];

    if (typeof showMonetagAd !== 'function') {
        console.error(`Monetag SDK function show_${zoneId} not available.`);
        rewardMessageDiv.textContent = 'Error: Ad SDK not loaded.';
        return;
    }

    // Disable all activity #1 buttons in this room immediately as per cooldown logic
    activity1WatchAdButtons.forEach(btn => btn.disabled = true);
    rewardMessageDiv.textContent = 'Opening ads...';

    let adsShownSuccessfully = false;
    try {
        rewardMessageDiv.textContent = 'Showing 1st interstitial ad...';
        await showMonetagAd(); // First interstitial ad
        rewardMessageDiv.textContent = 'Showing 2nd interstitial ad...';
        await showMonetagAd(); // Second interstitial ad
        adsShownSuccessfully = true;

        rewardMessageDiv.textContent = `Ads watched! Rewarding in ${REWARD_DELAY_SECONDS} seconds...`;
        await new Promise(resolve => setTimeout(resolve, REWARD_DELAY_SECONDS * 1000));

        coins += ACTIVITY1_REWARD_AMOUNT;
        updateCoinDisplay();

        // Apply cooldown to ALL activity #1 ad buttons in this room
        const cooldownEndTime = Date.now() + ACTIVITY1_COOLDOWN_TIME_MS;
        Object.keys(MONETAG_ZONES).forEach(id => {
            activity1AdCooldowns[id] = cooldownEndTime;
        });
        saveCooldowns();
        updateAllTimers('activity1'); // Update all activity #1 timers for this room
        rewardMessageDiv.textContent = `+${ACTIVITY1_REWARD_AMOUNT.toFixed(2)} peso awarded!`;
        setTimeout(() => rewardMessageDiv.textContent = '', 3000);

    } catch (e) {
        console.error(`Error showing Activity #1 Monetag ad for zone ${zoneId}:`, e);
        rewardMessageDiv.textContent = 'One or both ads could not be displayed or were closed early.';
        // If ads failed, re-enable buttons (if they weren't already on cooldown from a previous successful click)
        if (!adsShownSuccessfully) {
             Object.keys(MONETAG_ZONES).forEach(id => {
                const btn = document.querySelector(`.watch-ad-btn[data-ad-type="activity1"][data-ad-id="${id}"]`);
                if (btn && (!activity1AdCooldowns[id] || activity1AdCooldowns[id] <= Date.now())) {
                    btn.disabled = false;
                }
            });
        }
        setTimeout(() => rewardMessageDiv.textContent = '', 3000);
    }
}


// --- Event Listeners and Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    loadUserData(); // Load coins and cooldowns on page load
    updateAllTimers('daily'); // Initialize daily timer displays
    updateAllTimers('activity'); // Initialize activity timer displays (Original)
    updateAllTimers('activity1'); // Initialize activity #1 timer displays (NEW)

    // Update all timers every second
    setInterval(() => {
        updateAllTimers('daily');
        updateAllTimers('activity');
        updateAllTimers('activity1'); // Update new room's timers
    }, 1000);

    // Open/Close Daily Ads Room
    openDailyAdsRoomBtn.addEventListener('click', () => {
        mainAppContent.style.display = 'none';
        dailyAdsRoomDiv.style.display = 'block';
    });
    closeDailyAdsRoomBtn.addEventListener('click', () => {
        dailyAdsRoomDiv.style.display = 'none';
        mainAppContent.style.display = 'block';
    });

    // Open/Close Activity Room (Original)
    openActivityRoomBtn.addEventListener('click', () => {
        mainAppContent.style.display = 'none';
        activityRoomDiv.style.display = 'block';
    });
    closeActivityRoomBtn.addEventListener('click', () => {
        activityRoomDiv.style.display = 'none';
        mainAppContent.style.display = 'block';
    });

    // Open/Close Activity Room #1 (NEW)
    openActivityRoom1Btn.addEventListener('click', () => {
        mainAppContent.style.display = 'none';
        activityRoom1Div.style.display = 'block';
    });
    closeActivityRoom1Btn.addEventListener('click', () => {
        activityRoom1Div.style.display = 'none';
        mainAppContent.style.display = 'block';
    });

    // Attach event listeners to all "Watch Ad" buttons
    dailyWatchAdButtons.forEach(button => {
        button.addEventListener('click', handleWatchDailyAd);
    });

    activityWatchAdButtons.forEach(button => {
        button.addEventListener('click', handleWatchActivityAd);
    });

    activity1WatchAdButtons.forEach(button => { // NEW event listener
        button.addEventListener('click', handleWatchActivity1Ad);
    });
});
