// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-firestore.js";

// Your web app's Firebase configuration
// !! IMPORTANT: Replace with your actual Firebase configuration !!
// You can get this from your Firebase project settings -> Project settings -> General
const firebaseConfig = {
  apiKey: "AIzaSyDMGU5X7BBp-C6tIl34Uuu5N9MXAVFTn7c", // YOUR_API_KEY
  authDomain: "paper-house-inc.firebaseapp.com",    // YOUR_PROJECT.firebaseapp.com
  projectId: "paper-house-inc",                     // YOUR_PROJECT_ID
  storageBucket: "paper-house-inc.firebasestorage.app", // YOUR_PROJECT.appspot.com
  messagingSenderId: "658389836376",                // SENDER_ID
  appId: "1:658389836376:web:2ab1e2743c593f4ca8e02d"  // APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/**
 • Fetches and displays the user's profile data.
 • Assumes a Firestore collection named "users" where each document
 • is identified by the user's UID and contains fields like
 • 'telegramUsername' and 'avatarURL'.
 *
 • @param {string} userId - The unique ID of the logged-in user.
 */
async function loadProfile(userId) {
    if (!userId) {
        console.error("User ID is required to load profile.");
        document.getElementById("telegram-username").textContent = "Not logged in";
        document.getElementById("profile-avatar").src = "images/default-avatar.png"; // Ensure default is in 'images/'
        return;
    }

    try {
        const userDocRef = doc(db, "users", userId); // Assuming 'users' collection and document ID is user UID
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            console.log("User data:", data);

            const telegramUsernameElement = document.getElementById("telegram-username");
            const profileAvatarElement = document.getElementById("profile-avatar");

            // Display Telegram username
            // Ensure the username is prefixed with '@' if it's not already
            telegramUsernameElement.textContent = data.telegramUsername
                ? `@${data.telegramUsername.replace(/^@/, '')}` // Add '@' if missing
                : "@username"; // Fallback

            // Display avatar            profileAvatarElement.src = data.avatarURL || "images/default-avatar.png"; // Fallback to default

            // Optional: Display user status if available
            // const userStatusElement = document.getElementById("user-status");
            // if (userStatusElement) {
            //     userStatusElement.textContent = data.status || "Offline";
            // }

        } else {
            console.warn(`User document for UID: ${userId} not found.`);
            document.getElementById("telegram-username").textContent = "Profile not found";
            document.getElementById("profile-avatar").src = "images/default-avatar.png";
        }
    } catch (error) {
        console.error("Error loading user profile:", error);
        document.getElementById("telegram-username").textContent = "Error loading profile";
        document.getElementById("profile-avatar").src = "images/default-avatar.png";
    }
}

// --- Initialization ---
// In a real app, you would get the logged-in user's UID from Firebase Authentication.
// For this example, we'll use a placeholder.
// IMPORTANT: Replace "YOUR_CURRENT_USER_UID" with the actual UID of the logged-in user.
// You might use Firebase Authentication's onAuthStateChanged to get this dynamically.
const loggedInUserId = "YOUR_CURRENT_USER_UID"; // <-- !!! REPLACE THIS !!!

// Example of how to get it dynamically if you have Firebase Auth set up:
/*
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-auth.js";
const auth = getAuth();
onAuthStateChanged(auth, (user) => {
  if (user) {
    // User is signed in.
    loadProfile(user.uid);
  } else {
    // User is signed out.
    console.log("User is not logged in.");
    document.getElementById("telegram-username").textContent = "Not logged in";
    document.getElementById("profile-avatar").src = "images/default-avatar.png";
  }
});
*/

// For now, just call it with a placeholder or a hardcoded test UID.
// Make sure to replace "YOUR_CURRENT_USER_UID" with a valid UID that exists in your Firestore 'users' collection.
loadProfile(loggedInUserId);
