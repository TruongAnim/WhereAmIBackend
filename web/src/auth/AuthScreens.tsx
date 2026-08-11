import { signInWithPopup, signOut } from "firebase/auth";
import { useState } from "react";
import { CONTACT_HINT, auth, googleProvider } from "../firebase";
import type { AccessState } from "./useAccess";

export function LoadingScreen() {
  return (
    <div className="centered">
      <div className="card">
        <div className="spinner" aria-hidden="true" />
        <p className="muted">Đang kiểm tra quyền truy cập…</p>
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
          ? "Bạn đã đóng cửa sổ đăng nhập."
          : code === "auth/unauthorized-domain"
            ? "Tên miền này chưa được cho phép trong Firebase Auth."
            : "Đăng nhập thất bại. Thử lại nhé.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="centered">
      <div className="card">
        <h1>WhereAmI</h1>
        <p className="muted">Xem lại lộ trình đã ghi trên bản đồ.</p>
        <button className="primary" onClick={signIn} disabled={busy}>
          {busy ? "Đang mở…" : "Đăng nhập bằng Google"}
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
        <h1>Chưa có quyền xem</h1>
        <p>
          Tài khoản <strong>{email}</strong> đã đăng nhập thành công nhưng chưa
          được cấp quyền xem dữ liệu.
        </p>
        <p className="muted">
          Hãy liên hệ quản trị viên tại <strong>{CONTACT_HINT}</strong> và gửi kèm
          địa chỉ e-mail ở trên để được thêm vào danh sách.
        </p>
        {access.error && <p className="error">{access.error}</p>}
        <button onClick={() => signOut(auth)}>Đăng xuất</button>
      </div>
    </div>
  );
}
