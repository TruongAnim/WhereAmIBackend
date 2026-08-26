import { signInWithPopup, signOut } from "firebase/auth";
import { useState } from "react";
import { CONTACT_HINT, auth, googleProvider } from "../firebase";
import type { AccessState } from "./useAccess";

export function LoadingScreen() {
  return (
    <div className="centered">
      <div className="card">
        <div className="spinner" aria-hidden="true" />
        <p className="muted">Checking your access…</p>
      </div>
    </div>
  );
}

export function SignInScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (cause) {
      const code = (cause as { code?: string }).code ?? "";
      setError(
        code === "auth/popup-closed-by-user"
          ? "You closed the sign-in window."
          : code === "auth/unauthorized-domain"
            ? "This domain is not on the Firebase Auth allow-list."
            : "Sign-in failed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="centered">
      <div className="card">
        <h1>WhereAmI</h1>
        <p className="muted">Replay the track you recorded, on a map.</p>
        <button className="primary" onClick={signIn} disabled={busy}>
          {busy ? "Opening…" : "Sign in with Google"}
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

export function DeniedScreen({ access }: { access: AccessState }) {
  const email = access.user?.email ?? "";
  return (
    <div className="centered">
      <div className="card">
        <h1>No access yet</h1>
        <p>
          <strong>{email}</strong> signed in successfully but has not been
          granted access to the data.
        </p>
        <p className="muted">
          Ask the administrator at <strong>{CONTACT_HINT}</strong> to add the
          address above to the list.
        </p>
        {access.error && <p className="error">{access.error}</p>}
        <button onClick={() => signOut(auth)}>Sign out</button>
      </div>
    </div>
  );
}
