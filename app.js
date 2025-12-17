
// --- Configuration ---
const DAILY_REWARD_AMOUNT = 0.01; // Peso for Daily Ads
const ACTIVITY_REWARD_AMOUNT = 0.02; // Peso for Activity Ads (Original room)
const ACTIVITY1_REWARD_AMOUNT = 0.02; // Peso for Activity Ads #1 (NEW room - COMBINED)

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
const dailyAdsRoomDiv = document.getElementById('daily-ads-room');
const dailyWatchAdButtons = document.querySelectorAll('.watch-ad-btn[data-ad-type="daily"]');

// Activity Room (Original) elements
const openActivityRoomBtn = document.getElementById('open-activity-room');
const closeActivityRoomBtn = document.getElementById('close-activity-room');
const activityRoomDiv = document.getElementById('activity-room');
const activityWatchAdButtons = document.querySelectorAll('.watch-ad-btn[data-ad-type="activity"]');

// Activity Room #1 (NEW - COMBINED ADS) elements
const openActivityRoom1Btn = document.getElementById('open-activity-room-1');
const closeActivityRoom1Btn = document.getElementById('close-activity-room-1');
const activityRoom1Div = document.getElementById('activity-room-1');
// Selects only the single button in Activity Room #1
const activity1WatchAdButtons = document.querySelectorAll('.watch-ad-btn[data-ad-type="activity1"]');


// --- State Variables ---
let coins = 0.00;


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
    updateCoinDisplay();
}

/**
 * Resets the state of a specific ad button/timer (always to ready since no cooldowns).
 * @param {string} adId - The ID of the ad (e.g., '1', '2', '3').
 * @param {string} adType - 'daily', 'activity', or 'activity1'.
 */
function resetAdState(adId, adType) {
    const watchBtn = document.querySelector(`.watch-ad-btn[data-ad-type="${adType}"][data-ad-id="${adId}"]`);
    const timerDiv = document.querySelector(`.ad-timer[data-ad-type="${adType}"][data-ad-id="${adId}"]`);
    const rewardMessageDiv = document.querySelector(`.reward-message[data-ad-type="${adType}"][data-ad-id="${adId}"]`);


    if (!watchBtn || !timerDiv) return;

    timerDiv.textContent = 'Ready!';
    watchBtn.disabled = false;
    rewardMessageDiv.textContent = ''; // Clear any previous messages
}

/**
 * Resets the state of all ad buttons/timers for a given type.
 * @param {string} adType - 'daily', 'activity', or 'activity1'.
 */
function resetAllAdStates(adType) {
    // For activity1, there's only one button, so we hardcode adId '1'
    if (adType === 'activity1') {
        resetAdState('1', adType);
    } else {
        Object.keys(MONETAG_ZONES).forEach(adId => {
            resetAdState(adId, adType);
        });
    }
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
        resetAdState(adId, 'daily'); // Re-enable button and clear message
        rewardMessageDiv.textContent = `+${DAILY_REWARD_AMOUNT.toFixed(2)} peso awarded!`;
        setTimeout(() => rewardMessageDiv.textContent = '', 3000); // Clear message after 3 seconds

    } catch (e) {
        console.error(`Error showing Daily Monetag ad for zone ${zoneId}:`, e);
        rewardMessageDiv.textContent = 'Ad could not be displayed or was closed early.';
        button.disabled = false; // Re-enable button
        setTimeout(() => rewardMessageDiv.textContent = '', 3000); // Clear message after 3 seconds
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

    // Disable all activity buttons in this room temporarily while ads are processed
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
        resetAllAdStates('activity'); // Re-enable all buttons in this room
        rewardMessageDiv.textContent = `+${ACTIVITY_REWARD_AMOUNT.toFixed(2)} peso awarded!`;
        setTimeout(() => rewardMessageDiv.textContent = '', 3000); // Clear message after 3 seconds

    } catch (e) {
        console.error(`Error showing Activity Monetag ad for zone ${zoneId}:`, e);
        rewardMessageDiv.textContent = 'One or both ads could not be displayed or were closed early.';
        resetAllAdStates('activity'); // Ensure all buttons are re-enabled
        setTimeout(() => rewardMessageDiv.textContent = '', 3000); // Clear message after 3 seconds
    }
}


/**
 * Handles the click event for watching the COMBINED Activity Ads (6x Rewarded Interstitial - NEW Room #1).
 * @param {Event} event - The click event.
 */
async function handleWatchActivity1Ad(event) {
    const button = event.target; // This is the single button in Activity Room #1
    const adId = '1'; // Hardcoded adId for the single button in this room
    const rewardMessageDiv = document.querySelector(`.reward-message[data-ad-type="activity1"][data-ad-id="${adId}"]`);

    // Disable the single button temporarily while ads are processed
    button.disabled = true;
    rewardMessageDiv.textContent = 'Opening all 6 ads... Please wait.';

    let adsShownSuccessfully = false;
    try {
        // Trigger 2 interstitial ads for each of the 3 Monetag zones
        for (const zoneKey in MONETAG_ZONES) {
            const zoneId = MONETAG_ZONES[zoneKey];
            const showMonetagAd = window[`show_${zoneId}`];

            if (typeof showMonetagAd !== 'function') {
                console.error(`Monetag SDK function show_${zoneId} not available.`);
                rewardMessageDiv.textContent = `Error: Ad SDK for zone ${zoneId} not loaded. Skipping this zone.`;
                // If an SDK is missing, we'll log the error and skip that zone's ads.
                continue; // Continue to the next zone
            }

            // Show 2 ads for the current zone
            rewardMessageDiv.textContent = `Showing 1st ad from Zone ${zoneKey}...`;
            await showMonetagAd(); 
            rewardMessageDiv.textContent = `Showing 2nd ad from Zone ${zoneKey}...`;
            await showMonetagAd(); 
        }
        adsShownSuccessfully = true; // All ads successfully attempted (even if some zones skipped)

        rewardMessageDiv.textContent = `All 6 ads watched! Rewarding in ${REWARD_DELAY_SECONDS} seconds...`;
        await new Promise(resolve => setTimeout(resolve, REWARD_DELAY_SECONDS * 1000));

        coins += ACTIVITY1_REWARD_AMOUNT;
        updateCoinDisplay();
        resetAdState(adId, 'activity1'); // Re-enable the single button and clear messages
        rewardMessageDiv.textContent = `+${ACTIVITY1_REWARD_AMOUNT.toFixed(2)} peso awarded!`;
        setTimeout(() => rewardMessageDiv.textContent = '', 3000); // Clear message after 3 seconds

    } catch (e) {
        console.error(`Error showing one or more Monetag ads in Activity #1 Room:`, e);
        rewardMessageDiv.textContent = 'One or more ads could not be displayed or were closed early.';
        resetAdState(adId, 'activity1'); // Ensure the button is re-enabled
        setTimeout(() => rewardMessageDiv.textContent = '', 3000);
    }
}


// --- Event Listeners and Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    loadUserData(); // Load coins on page load
    resetAllAdStates('daily');    // Initialize all daily ad states to 'Ready!'
    resetAllAdStates('activity'); // Initialize all activity ad states to 'Ready!'
    resetAllAdStates('activity1'); // Initialize the single activity #1 ad state to 'Ready!'

    // Removed setInterval for updating timers as there are no cooldowns.

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

    // Open/Close Activity Room #1 (NEW - COMBINED ADS)
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

    // For the combined ads, the loop will naturally only run once for the single button
    activity1WatchAdButtons.forEach(button => {
        button.addEventListener('click', handleWatchActivity1Ad);
    });
});
