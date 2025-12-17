/**
 * app.js - Handles static logic, rewards, and cooldowns.
 */

const REWARD_AMOUNT = 0.02; // Reward per single ad view
const COOLDOWN_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

// --- Utility Functions ---

function getBalance() {
    // Retrieve balance from localStorage, default to 0.00
    const balance = parseFloat(localStorage.getItem('userBalance')) || 0.00;
    return balance;
}

function updateBalance(amount) {
    const currentBalance = getBalance();
    const newBalance = currentBalance + amount;
    localStorage.setItem('userBalance', newBalance.toFixed(2));
    displayBalance(newBalance);
}

function displayBalance(balance) {
    const displayElement = document.getElementById('balance-display');
    if (displayElement) {
        displayElement.textContent = `Current Balance: P${balance.toFixed(2)}`;
    }
}

function setCooldown(key) {
    const expiryTime = Date.now() + COOLDOWN_DURATION;
    localStorage.setItem(key, expiryTime);
}

function getRemainingCooldown(key) {
    const expiryTime = parseInt(localStorage.getItem(key));
    if (!expiryTime || expiryTime < Date.now()) {
        return 0; // Cooldown finished
    }
    return expiryTime - Date.now();
}

function formatTime(ms) {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
}

// --- Ad and Reward Logic ---

/**
 * Handles the full ad sequence: two repeated interstitial ads.
 * @param {string} adId - The Monetag ad ID (e.g., '10276123').
 * @param {string} cooldownKey - The localStorage key for the cooldown.
 * @param {HTMLElement} button - The button element to disable/enable.
 */
async function triggerAdSequence(adId, cooldownKey, button) {
    // Disable button immediately
    button.disabled = true;
    button.textContent = "Loading Ads...";

    // Helper function to show a single ad and handle the reward
    const showSingleAd = async (adNum) => {
        // NOTE: Monetag functions (show_XXXXXXX) are assumed to be globally available 
        // due to the scripts included in rewards.html.
        
        // Check if the show function exists before calling
        const showFunction = window[`show_${adId}`];
        if (typeof showFunction !== 'function') {
            alert(`Error: Monetag function show_${adId} not found.`);
            return false;
        }

        try {            button.textContent = `Watching Ad ${adNum} of 2...`;
            await showFunction();
            
            // Reward the user P0.02 after successful ad view
            updateBalance(REWARD_AMOUNT);
            console.log(`Rewarded P${REWARD_AMOUNT.toFixed(2)} for Ad ${adNum}.`);
            return true;
        } catch (error) {
            // This catches if the user closes the ad prematurely or if there's an error.
            console.error(`Ad ${adNum} failed or was skipped:`, error);
            alert(`Ad ${adNum} was skipped or failed. No reward given for this ad.`);
            return false;
        }
    };

    // 1. Show the first ad
    await showSingleAd(1);

    // 2. Show the second ad (Repeated)
    await showSingleAd(2);

    // 3. Set Cooldown and Update UI
    setCooldown(cooldownKey);
    startCooldownTimer(button, cooldownKey);
}

// --- Cooldown UI Logic ---

function startCooldownTimer(button, key) {
    const update = () => {
        const remaining = getRemainingCooldown(key);

        if (remaining > 0) {
            button.disabled = true;
            button.classList.add('cooldown');
            button.textContent = `Cooldown: ${formatTime(remaining)}`;
            
            // Re-run update after 1 second
            setTimeout(update, 1000);
        } else {
            // Cooldown finished
            button.disabled = false;
            button.classList.remove('cooldown');
            button.textContent = `Watch Ad Set (${(REWARD_AMOUNT * 2).toFixed(2)})`;
            localStorage.removeItem(key); // Clean up storage
        }
    };
    // Start the timer
    update();
}


// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    // Only run reward logic on the rewards page
    if (document.getElementById('reward-buttons-container')) {
        
        displayBalance(getBalance());

        const rewardButtons = document.querySelectorAll('.reward-button');

        rewardButtons.forEach(button => {
            const adId = button.getAttribute('data-ad-id');
            const cooldownKey = button.getAttribute('data-cooldown-key');
            
            // 1. Initialize cooldown state
            startCooldownTimer(button, cooldownKey);

            // 2. Attach click listener
            button.addEventListener('click', () => {
                if (!button.disabled) {
                    triggerAdSequence(adId, cooldownKey, button);
                }
            });
        });
    }
});
