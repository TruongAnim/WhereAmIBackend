import { initializeApp } from "firebase/app";
import { GoogleAuthProvider, getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// These values are not secrets. A Firebase web config identifies the project;
// access is decided by Firebase Auth plus the rules in firestore.rules.
const firebaseConfig = {
  apiKey: "AIzaSyDqH2wsn3zJiaskKv9PXKlPw80s72gHS2E",
  authDomain: "whereami-1c55e.firebaseapp.com",
  projectId: "whereami-1c55e",
  storageBucket: "whereami-1c55e.firebasestorage.app",
  messagingSenderId: "497220691413",
  appId: "1:497220691413:web:0867fef94182a080c1c95c",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

/** Shown to signed-in accounts that have not been granted access yet. */
export const CONTACT_HINT = "truonganim.dev@gmail.com";
