import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase";

interface AccessEntry {
  email: string;
  role: "admin" | "viewer";
  note: string | null;
  addedBy: string | null;
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function AdminPanel({ currentEmail }: { currentEmail: string }) {
  const [entries, setEntries] = useState<AccessEntry[]>([]);
  const [openDoor, setOpenDoor] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"viewer" | "admin">("viewer");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeList = onSnapshot(
      collection(db, "access"),
      (snapshot) => {
        const list = snapshot.docs.map((docSnapshot) => {
          const data = docSnapshot.data();
          return {
            email: docSnapshot.id,
            role: data.role === "admin" ? ("admin" as const) : ("viewer" as const),
            note: typeof data.note === "string" ? data.note : null,
            addedBy: typeof data.addedBy === "string" ? data.addedBy : null,
          };
        });
        list.sort((a, b) => a.email.localeCompare(b.email));
        setEntries(list);
      },
      () => setMessage("Could not load the access list."),
    );

    const unsubscribeConfig = onSnapshot(doc(db, "config", "access"), (snapshot) => {
      setOpenDoor(snapshot.data()?.allowAllAuthenticated === true);
    });

    return () => {
      unsubscribeList();
      unsubscribeConfig();
    };
  }, []);

  const addEntry = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
      setMessage("That is not a valid e-mail address.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await setDoc(doc(db, "access", email), {
        email,
        role: newRole,
        note: null,
        addedBy: currentEmail,
        addedAt: serverTimestamp(),
      });
      setNewEmail("");
      setMessage(`Granted access to ${email}.`);
    } catch {
      setMessage("Could not save. Admin rights required.");
    } finally {
      setBusy(false);
    }
  };

  const removeEntry = async (email: string) => {
    if (email === currentEmail) {
      setMessage("You cannot remove your own access.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await deleteDoc(doc(db, "access", email));
      setMessage(`Removed ${email}.`);
    } catch {
      setMessage("Could not remove. Admin rights required.");
    } finally {
      setBusy(false);
    }
  };

  const toggleOpenDoor = async (next: boolean) => {
    setBusy(true);
    setMessage(null);
    try {
      await setDoc(
        doc(db, "config", "access"),
        { allowAllAuthenticated: next, updatedAt: serverTimestamp() },
        { merge: true },
      );
    } catch {
      setMessage("Could not change. Admin rights required.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel-body">
      <section>
        <h3>Open to everyone</h3>
        <label className="field field-inline">
          <input
            type="checkbox"
            checked={openDoor}
            disabled={busy}
            onChange={(e) => toggleOpenDoor(e.target.checked)}
          />
          <span>
            <span className="field-label">Any signed-in account can view</span>
            <span className="field-hint">
              With this on, any Google account that can sign in reads all of the
              location data, without being on the list below.
            </span>
          </span>
        </label>
        {openDoor && (
          <p className="warning">
            Currently open to everyone. Anyone with the link and a Google account
            can see your track.
          </p>
        )}
      </section>

      <section>
        <h3>Who can view</h3>
        <div className="add-row">
          <input
            type="email"
            placeholder="nguoidung@gmail.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addEntry();
            }}
          />
          <select value={newRole} onChange={(e) => setNewRole(e.target.value as "viewer" | "admin")}>
            <option value="viewer">Xem</option>
            <option value="admin">Admin</option>
          </select>
          <button className="primary" onClick={addEntry} disabled={busy}>
            Add
          </button>
        </div>
        <p className="field-hint">
          Works even for someone who has never signed in — access is keyed by e-mail.
        </p>

        <ul className="access-list">
          {entries.map((entry) => (
            <li key={entry.email}>
              <span className="access-email">
                {entry.email}
                {entry.email === currentEmail && <em> (you)</em>}
              </span>
              <span className={`badge ${entry.role}`}>
                {entry.role === "admin" ? "Admin" : "Viewer"}
              </span>
              <button
                onClick={() => removeEntry(entry.email)}
                disabled={busy || entry.email === currentEmail}
                title={
                  entry.email === currentEmail
                    ? "You cannot remove your own access"
                    : "Remove access"
                }
              >
                Remove
              </button>
            </li>
          ))}
          {entries.length === 0 && <li className="muted">Nobody on the list yet.</li>}
        </ul>
      </section>

      {message && <p className="muted">{message}</p>}
    </div>
  );
}
