import { signOut } from "firebase/auth";
import { useMemo, useState } from "react";
import { AdminPanel } from "./admin/AdminPanel";
import { DeniedScreen, LoadingScreen, SignInScreen } from "./auth/AuthScreens";
import { useAccess } from "./auth/useAccess";
import { auth } from "./firebase";
import { MapView } from "./map/MapView";
import { useDevices, usePositions } from "./map/usePositions";
import {
  buildTrack,
  formatDistance,
  formatDuration,
  formatSpeed,
  toIsoDate,
} from "./map/track";
import { SettingsPanel } from "./settings/SettingsPanel";
import { useSettings } from "./settings/useSettings";

type Panel = "none" | "settings" | "admin";

export default function App() {
  const access = useAccess();

  if (access.status === "loading") return <LoadingScreen />;
  if (access.status === "signed-out") return <SignInScreen />;
  if (access.status === "denied") return <DeniedScreen access={access} />;
  return <Viewer isAdmin={access.role === "admin"} email={access.user?.email ?? ""} />;
}

function Viewer({ isAdmin, email }: { isAdmin: boolean; email: string }) {
  const today = toIsoDate(new Date());
  const [isoDate, setIsoDate] = useState(today);
  const [panel, setPanel] = useState<Panel>("none");
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);

  const settingsState = useSettings();
  const { settings } = settingsState;

  const { devices, loading: devicesLoading, error: devicesError } = useDevices();
  const deviceId = selectedDevice ?? devices[0]?.id ?? null;
  const { fixes, loading, error, live } = usePositions(deviceId, isoDate);

  const track = useMemo(() => buildTrack(fixes, settings), [fixes, settings]);

  const shiftDay = (days: number) => {
    const [y, m, d] = isoDate.split("-").map(Number);
    const next = new Date(y, m - 1, d + days);
    setIsoDate(toIsoDate(next));
  };

  const stats = track.stats;

  return (
    <div className="app">
      <header className="toolbar">
        <div className="toolbar-group">
          <strong className="brand">WhereAmI</strong>
          {live && <span className="live">● trực tiếp</span>}
        </div>

        <div className="toolbar-group">
          <select
            value={deviceId ?? ""}
            onChange={(e) => setSelectedDevice(e.target.value)}
            disabled={devices.length === 0}
          >
            {devices.length === 0 && <option value="">Chưa có thiết bị</option>}
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.id}
                {device.battery !== null ? ` · ${device.battery}%` : ""}
              </option>
            ))}
          </select>

          <div className="date-picker">
            <button onClick={() => shiftDay(-1)} title="Ngày trước">
              ‹
            </button>
            <input
              type="date"
              value={isoDate}
              max={today}
              onChange={(e) => e.target.value && setIsoDate(e.target.value)}
            />
            <button onClick={() => shiftDay(1)} disabled={isoDate >= today} title="Ngày sau">
              ›
            </button>
            <button onClick={() => setIsoDate(today)} disabled={isoDate === today}>
              Hôm nay
            </button>
          </div>
        </div>

        <div className="toolbar-group">
          <button
            className={panel === "settings" ? "active" : ""}
            onClick={() => setPanel(panel === "settings" ? "none" : "settings")}
          >
            Tuỳ chỉnh
          </button>
          {isAdmin && (
            <button
              className={panel === "admin" ? "active" : ""}
              onClick={() => setPanel(panel === "admin" ? "none" : "admin")}
            >
              Quản trị
            </button>
          )}
          <button onClick={() => signOut(auth)} title={email}>
            Đăng xuất
          </button>
        </div>
      </header>

      <div className="content">
        <main className="map-area">
          <MapView track={track} settings={settings} autoFit />

          <div className="stats">
            {loading && <span>Đang tải…</span>}
            {!loading && stats.usedFixes === 0 && <span>Không có dữ liệu trong ngày này.</span>}
            {!loading && stats.usedFixes > 0 && (
              <>
                <Stat label="Điểm" value={String(stats.usedFixes)} />
                <Stat label="Quãng đường" value={formatDistance(stats.distanceMeters)} />
                <Stat label="Thời lượng" value={formatDuration(stats.movingMillis)} />
                <Stat label="Tốc độ tối đa" value={formatSpeed(stats.maxSpeed, settings.speedUnit)} />
                <Stat label="Đoạn" value={String(track.segments.length)} />
                {stats.alarms.length > 0 && (
                  <Stat label="SOS" value={String(stats.alarms.length)} highlight />
                )}
                {stats.droppedByAccuracy > 0 && (
                  <Stat label="Đã lọc" value={String(stats.droppedByAccuracy)} />
                )}
              </>
            )}
          </div>

          {error && <p className="banner error">{error}</p>}
          {devicesError && <p className="banner error">{devicesError}</p>}
          {!devicesLoading && devices.length === 0 && (
            <p className="banner">
              Chưa có thiết bị nào gửi dữ liệu. Bật tracking trong app rồi quay lại.
            </p>
          )}
        </main>

        {panel !== "none" && (
          <aside className="panel">
            <div className="panel-header">
              <h2>{panel === "settings" ? "Tuỳ chỉnh hiển thị" : "Quản trị"}</h2>
              <button onClick={() => setPanel("none")}>✕</button>
            </div>
            {panel === "settings" ? (
              <SettingsPanel state={settingsState} isAdmin={isAdmin} />
            ) : (
              <AdminPanel currentEmail={email.toLowerCase()} />
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <span className={`stat${highlight ? " highlight" : ""}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </span>
  );
}
