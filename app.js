
// Import the functions you need from the SDKs you need
// NOTE: The Telegram Login Widget script is loaded directly in index.html.
//       We'll rely on its callback function.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";
// Uncomment if you are using Firebase Authentication
// import { getAuth, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-auth.js";


// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDMGU5X7BBp-C6tIl34Uuu5N9MXAVFTn7c",
  authDomain: "paper-house-inc.firebaseapp.com",
  projectId: "paper-house-inc",
  storageBucket: "paper-house-inc.firebasestorage.app",
  messagingSenderId: "658389836376",
  appId: "1:658389836376:web:2ab1e2743c593f4ca8e02d"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
// Uncomment if you are using Firebase Authentication
// const auth = getAuth();


// --- Telegram Login Widget Configuration ---
// This is the GLOBAL function that the Telegram Login Widget calls
// when the user successfully logs in and grants access.
// IMPORTANT: This function MUST be globally accessible (defined in `app.js` or a separate script
//            loaded in the head, or directly in index.html if it's simple).
//            It will be called by the Telegram script.
window.TelegramLoginWidgetCallback = async (userTelegramData) => {
    console.log("Telegram login successful:", userTelegramData);

    const userId = userTelegramData.id; // Telegram User ID is a good candidate for your internal user ID

    // Update the UI immediately
    updateProfileUI(userTelegramData);

    // --- Store/Update user data in Firebase ---
    try {
        // We'll use the Telegram User ID as the document ID in Firestore for simplicity.
        // If you use Firebase Authentication, you'd link this to the Firebase UID.
        const userDocRef = doc(db, "users", String(userId)); // Ensure userId is a string for doc ID

        const userDataToSave = {
            telegramId: userTelegramData.id,
            telegramUsername: userTelegramData.username,
            telegramFirstName: userTelegramData.first_name,
            telegramLastName: userTelegramData.last_name,
            avatarURL: userTelegramData.photo_url,
            // Add any other relevant data you get from Telegram
            // e.g., 'lastLogin': new Date(),
            // e.g., 'coins': 0, // Initializing for future use
        };

        // Check if user document already exists
        const docSnap = await getDoc(userDocRef);

        if (docSnap.exists()) {
            // User exists, update their data
            console.log("Updating existing user in Firebase.");
            await updateDoc(userDocRef, userDataToSave);
        } else {
            // User does not exist, create a new document
            console.log("Creating new user in Firebase.");
            await setDoc(userDocRef, userDataToSave);
        }

        console.log("User data saved/updated in Firebase.");

        // --- Optional: Firebase Authentication Integration ---
        // If you want to use Firebase Auth:
        // You would typically have a backend server that exchanges the Telegram auth token
        // for a Firebase Custom Token. Then you'd sign in the user with that custom token.
        // For a client-side-only example, you might use the Telegram ID as a "custom token"
        // if your backend is configured to accept it, but this is less secure.
        //
        // Example (requires backend for proper security):
        /*
        fetch('/api/verify-telegram-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramData: userTelegramData })
        })
        .then(response => response.json())
        .then(data => {
            if (data.customToken) {
                return signInWithCustomToken(auth, data.customToken);
            } else {
                throw new Error('No custom token received.');
            }
        })
        .then(userCredential => {
            console.log("Signed in with Firebase Auth:", userCredential.user);
            // User is now signed in with Firebase Auth
            // You can then get their Firebase UID from userCredential.user.uid
            // and potentially update your 'users' doc with this UID as well
            // if you want to cross-reference.
        })
        .catch(error => {
            console.error("Firebase Authentication error:", error);
        });
        */

    } catch (error) {
        console.error("Error saving/updating user data in Firebase:", error);
    }
};

// --- Helper function to update the UI ---
function updateProfileUI(userData) {
    const profileContainer = document.getElementById("profile-container");
    const profileAvatar = document.getElementById("profile-avatar");
    const telegramUsername = document.getElementById("telegram-username");

    if (!userData) {
        console.log("No user data provided for UI update.");
        profileContainer.style.display = 'none'; // Hide if no data
        return;
    }

    // Display Telegram username
    // Ensure the username is prefixed with '@'
    telegramUsername.textContent = userData.username
        ? `@${userData.username}`
        : `@${userData.first_name}`; // Fallback to first name if no username

    // Display avatar
    profileAvatar.src = userData.photo_url || "images/default-avatar.png"; // Fallback to default

    // Make the profile container visible
    profileContainer.style.display = 'flex';
}

// --- Initialization ---

// On page load, we need to check if the user is *already* logged in.
// This can happen if the user was redirected back from `auth.html`
// (or if `data-redirect-url` points back to this page/route).
// The Telegram Login Widget script will automatically call TelegramLoginWidgetCallback
// if it detects the auth parameters in the URL on page load.

// If you are NOT using Firebase Authentication, you can check for existing
// local storage or cookies that might store Telegram user data.

// If you ARE using Firebase Authentication and `onAuthStateChanged`:
/*
onAuthStateChanged(auth, (user) => {
  if (user) {
    // User is signed in with Firebase Auth.
    // Now, try to load their corresponding Telegram data from Firestore.
    // We need a way to map Firebase UID to Telegram data.
    // For example, your 'users' doc might have a 'firebaseUid' field.
    console.log("Firebase Auth user found:", user.uid);
    // You'd need to query Firestore for a user doc where firebaseUid matches user.uid
    // or where the user's Telegram ID matches a stored field.
    // For now, let's assume you can somehow get the user's Telegram ID.
    // If you stored Telegram ID in Firebase Auth custom claims or a user profile subcollection,
    // you'd retrieve it here.

    // Placeholder: If you know the Telegram User ID associated with this Firebase User.
    // This is a simplified assumption.
    const telegramUserId = getTelegramUserIdFromFirebaseUser(user); // Implement this function

    if (telegramUserId) {
        loadProfileFromFirebase(telegramUserId).then(userData => {
            if (userData) {
                updateProfileUI(userData); // Update UI with loaded Telegram data
            } else {
                 // User signed in with Firebase but no Telegram data found. Prompt to log in.
                 document.getElementById("telegram-login-button-container").style.display = 'block';
            }
        });
    } else {
        // No Telegram ID associated with Firebase user, show login button.
        document.getElementById("telegram-login-button-container").style.display = 'block';
    }

  } else {
    // User is signed out of Firebase Auth.
    console.log("Firebase Auth: User is not logged in.");
    document.getElementById("profile-container").style.display = 'none'; // Hide profile
    document.getElementById("telegram-login-button-container").style.display = 'block'; // Show login button
  }
});
*/

// --- Helper to load profile from Firebase if NOT using Telegram login callback immediately ---
// This is useful if the user is already logged in (e.g., via Firebase Auth)
// and you want to show their Telegram profile.
async function loadProfileFromFirebase(telegramUserId) {
    if (!telegramUserId) return null;
    try {
        const userDocRef = doc(db, "users", String(telegramUserId));
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
            console.log("Loaded user data from Firebase for existing login:", docSnap.data());
            return docSnap.data();
        } else {
            console.warn("User data not found in Firebase for ID:", telegramUserId);
            return null;
        }
    } catch (error) {
        console.error("Error loading profile from Firebase:", error);
        return null;
    }
}

// --- Initial UI Setup ---
// On page load, hide the profile and show the login button,
// unless the Telegram login widget automatically calls TelegramLoginWidgetCallback
// with URL parameters.
document.addEventListener('DOMContentLoaded', () => {
    // The Telegram widget script might trigger the callback on load if params exist.
    // If it doesn't, we assume the user is logged out or needs to log in.
    const profileContainer = document.getElementById("profile-container");
    const loginButtonContainer = document.getElementById("telegram-login-button-container");

    // If the URL contains Telegram login parameters (meaning a redirect happened)
    // the Telegram script should handle the callback.
    // If not, we assume user is not logged in and show the login button, hide profile.
    if (!window.location.search.includes('telegram_id=')) {
        profileContainer.style.display = 'none';
        loginButtonContainer.style.display = 'block'; // Show login button by default
        console.log("No Telegram auth params in URL, showing login button.");
    } else {
        // If Telegram params ARE in the URL, the widget script is supposed to call
        // TelegramLoginWidgetCallback automatically. So we don't need to do much here,
        // the callback will handle showing the profile.
        console.log("Telegram auth params found in URL, expecting callback to handle UI.");
        // We might still hide the login button as a precaution if params are present
        loginButtonContainer.style.display = 'none';
    }

    // If using Firebase Auth and want to check that first:
    /*
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // User is signed in via Firebase Auth.
            // You'd then try to find their Telegram data via Firebase.
            // For simplicity here, let's assume you have a function to get Telegram ID from Firebase User
            const telegramUserId = getTelegramUserIdFromFirebaseUser(user); // <-- Implement this!
            if (telegramUserId) {
                loadProfileFromFirebase(telegramUserId).then(userData => {
                    if (userData) {
                        updateProfileUI(userData);
                        loginButtonContainer.style.display = 'none'; // Hide login button
                    } else {
                        // Firebase auth user, but no Telegram data linked. Show login button.
                        profileContainer.style.display = 'none';
                        loginButtonContainer.style.display = 'block';
                    }
                });
            } else {
                // Firebase auth user, but no Telegram ID found. Show login button.
                profileContainer.style.display = 'none';
                loginButtonContainer.style.display = 'block';
            }
        } else {
            // User signed out of Firebase Auth.
            profileContainer.style.display = 'none';
            loginButtonContainer.style.display = 'block'; // Show login button
        }
    });
    */
});

// Placeholder for Firebase Auth integration:
/*
function getTelegramUserIdFromFirebaseUser(firebaseUser) {
    // This is a complex part. You need a way to link a Firebase User to their Telegram User ID.
    // 1. When Telegram logs in, you save their Telegram ID to Firestore and associate it
    //    with the Firebase UID (if you created one with Firebase Auth).
    // 2. Or, you might store the Telegram ID in Firebase Auth custom claims.
    // 3. Or, the 'users' doc has both 'firebaseUid' and 'telegramId' fields.
    // You would query your 'users' collection for a document where 'firebaseUid' matches `firebaseUser.uid`
    // and then return the 'telegramId' from that document.
    // For this example, we'll return null as we don't have that mapping set up yet.
    console.warn("getTelegramUserIdFromFirebaseUser is a placeholder. Implement your mapping logic.");
    return null;
}
*/
