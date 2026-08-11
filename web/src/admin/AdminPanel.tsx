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
      () => setMessage("Không đọc được danh sách quyền."),
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
      setMessage("Địa chỉ e-mail không hợp lệ.");
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
      setMessage(`Đã cấp quyền cho ${email}.`);
    } catch {
      setMessage("Không lưu được. Cần quyền admin.");
    } finally {
      setBusy(false);
    }
  };

  const removeEntry = async (email: string) => {
    if (email === currentEmail) {
      setMessage("Không thể tự gỡ quyền của chính mình.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await deleteDoc(doc(db, "access", email));
      setMessage(`Đã gỡ ${email}.`);
    } catch {
      setMessage("Không gỡ được. Cần quyền admin.");
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
      setMessage("Không đổi được. Cần quyền admin.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel-body">
      <section>
        <h3>Mở cho tất cả</h3>
        <label className="field field-inline">
          <input
            type="checkbox"
            checked={openDoor}
            disabled={busy}
            onChange={(e) => toggleOpenDoor(e.target.checked)}
          />
          <span>
            <span className="field-label">Ai đăng nhập cũng xem được</span>
            <span className="field-hint">
              Bật lên thì mọi tài khoản Google đăng nhập được đều đọc toàn bộ dữ
              liệu vị trí, không cần có tên trong danh sách dưới.
            </span>
          </span>
        </label>
        {openDoor && (
          <p className="warning">
            Đang mở cho tất cả. Bất kỳ ai có link và một tài khoản Google đều xem
            được lộ trình của bạn.
          </p>
        )}
      </section>

      <section>
        <h3>Danh sách được xem</h3>
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
            <option value="admin">Quản trị</option>
          </select>
          <button className="primary" onClick={addEntry} disabled={busy}>
            Thêm
          </button>
        </div>
        <p className="field-hint">
          Thêm được cả khi người đó chưa từng đăng nhập — quyền gắn theo e-mail.
        </p>

        <ul className="access-list">
          {entries.map((entry) => (
            <li key={entry.email}>
              <span className="access-email">
                {entry.email}
                {entry.email === currentEmail && <em> (bạn)</em>}
              </span>
              <span className={`badge ${entry.role}`}>
                {entry.role === "admin" ? "Quản trị" : "Xem"}
              </span>
              <button
                onClick={() => removeEntry(entry.email)}
                disabled={busy || entry.email === currentEmail}
                title={
                  entry.email === currentEmail
                    ? "Không thể tự gỡ quyền của chính mình"
                    : "Gỡ quyền"
                }
              >
                Gỡ
              </button>
            </li>
          ))}
          {entries.length === 0 && <li className="muted">Chưa có ai trong danh sách.</li>}
        </ul>
      </section>

      {message && <p className="muted">{message}</p>}
    </div>
  );
}
