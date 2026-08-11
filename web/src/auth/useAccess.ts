import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "../firebase";

export type Role = "admin" | "viewer";

export interface AccessState {
  /** `loading` covers both the auth handshake and the access lookup. */
  status: "loading" | "signed-out" | "denied" | "granted";
  user: User | null;
  role: Role | null;
  /** True when access comes from the open-door switch rather than a listing. */
  viaOpenDoor: boolean;
  error: string | null;
}

const INITIAL: AccessState = {
  status: "loading",
  user: null,
  role: null,
  viaOpenDoor: false,
  error: null,
};

/**
 * Resolves what the signed-in account is allowed to do.
 *
 * Two documents decide it, and both are watched live so revoking access takes
 * effect without the viewer reloading:
 *   - `access/{email}`  an explicit grant, possibly with role `admin`
 *   - `config/access`   the open-door switch for any signed-in account
 */
export function useAccess(): AccessState {
  const [state, setState] = useState<AccessState>(INITIAL);

  useEffect(() => {
    let unsubscribeAccess: (() => void) | null = null;
    let unsubscribeConfig: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeAccess?.();
      unsubscribeConfig?.();
      unsubscribeAccess = null;
      unsubscribeConfig = null;

      if (!user) {
        setState({ ...INITIAL, status: "signed-out" });
        return;
      }

      const email = user.email?.toLowerCase() ?? "";
      if (email.length === 0) {
        setState({
          status: "denied",
          user,
          role: null,
          viaOpenDoor: false,
          error: "This account has no e-mail address.",
        });
        return;
      }

      let listedRole: Role | null = null;
      let openDoor = false;
      let sawGrant = false;
      let sawConfig = false;

      const publish = () => {
        if (!sawGrant || !sawConfig) return;
        const granted = listedRole !== null || openDoor;
        setState({
          status: granted ? "granted" : "denied",
          user,
          role: listedRole ?? (openDoor ? "viewer" : null),
          viaOpenDoor: listedRole === null && openDoor,
          error: null,
        });
      };

      unsubscribeAccess = onSnapshot(
        doc(db, "access", email),
        (snapshot) => {
          const role = snapshot.data()?.role;
          listedRole = role === "admin" ? "admin" : role === "viewer" ? "viewer" : null;
          sawGrant = true;
          publish();
        },
        () => {
          // The rules let anyone read their own entry, so a failure here means
          // something unexpected; treat it as "not listed" and let the
          // open-door switch have the final say.
          listedRole = null;
          sawGrant = true;
          publish();
        },
      );

      unsubscribeConfig = onSnapshot(
        doc(db, "config", "access"),
        (snapshot) => {
          openDoor = snapshot.data()?.allowAllAuthenticated === true;
          sawConfig = true;
          publish();
        },
        () => {
          openDoor = false;
          sawConfig = true;
          publish();
        },
      );
    });

    return () => {
      unsubscribeAuth();
      unsubscribeAccess?.();
      unsubscribeConfig?.();
    };
  }, []);

  return state;
}
