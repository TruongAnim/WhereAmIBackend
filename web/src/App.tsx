import { signOut } from "firebase/auth";
import { useMemo, useState } from "react";
import { AdminPanel } from "./admin/AdminPanel";
import { DeniedScreen, LoadingScreen, SignInScreen } from "./auth/AuthScreens";
import { useAccess } from "./auth/useAccess";
import { auth } from "./firebase";
import { MapView } from "./map/MapView";
import {
  countByKind,
  toFix,
  visibleRecords,
  type PositionRecord,
  type RecordKind,
} from "./map/records";
import { deviceLabel, useDevices, usePositions } from "./map/usePositions";
import { RecordDialog } from "./records/RecordDialog";
import { Timeline } from "./records/Timeline";
import {
  buildTrack,
  formatDistance,
  formatDuration,
  formatSpeed,
  toIsoDate,
  type Fix,
} from "./map/track";
import { SettingsPanel } from "./settings/SettingsPanel";
import { useSettings } from "./settings/useSettings";

type Panel = "none" | "timeline" | "settings" | "admin";

const PANEL_TITLES: Record<Exclude<Panel, "none">, string> = {
  timeline: "Log",
  settings: "Display settings",
  admin: "Admin",
};

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
  const [openRecord, setOpenRecord] = useState<PositionRecord | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Kinds the reader has switched off. Storing what is hidden rather than what
  // is shown means a new kind arriving in the data appears by default instead
  // of silently missing from a set built on an older day.
  const [hidden, setHidden] = useState<ReadonlySet<RecordKind>>(new Set());

  const settingsState = useSettings();
  const { settings } = settingsState;

  const { devices, loading: devicesLoading, error: devicesError } = useDevices();
  const deviceId = selectedDevice ?? devices[0]?.id ?? null;
  const { records, loading, error, live } = usePositions(deviceId, isoDate);

  const counts = useMemo(() => countByKind(records), [records]);
  const visible = useMemo(() => visibleRecords(records, hidden), [records, hidden]);
  // One filtered list feeds both views, so the map can never disagree with
  // the timeline about what the day contained.
  const visibleFixes = useMemo(
    () => visible.map(toFix).filter((fix): fix is Fix => fix !== null),
    [visible],
  );
  const track = useMemo(() => buildTrack(visibleFixes, settings), [visibleFixes, settings]);

  const toggleKind = (kind: RecordKind) => {
    setHidden((current) => {
      const next = new Set(current);
      if (!next.delete(kind)) next.add(kind);
      return next;
    });
  };

  // Choosing a record from the map should open the panel that shows it,
  // otherwise the highlight has nowhere to land.
  const selectRecord = (record: PositionRecord) => {
    setSelectedId(record.id);
    setPanel((current) => (current === "none" ? "timeline" : current));
  };

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
          {live && <span className="live">● live</span>}
        </div>

        <div className="toolbar-group">
          <select
            value={deviceId ?? ""}
            onChange={(e) => setSelectedDevice(e.target.value)}
            disabled={devices.length === 0}
          >
            {devices.length === 0 && <option value="">No devices yet</option>}
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {deviceLabel(device)}
              </option>
            ))}
          </select>

          <div className="date-picker">
            <button onClick={() => shiftDay(-1)} title="Previous day">
              ‹
            </button>
            <input
              type="date"
              value={isoDate}
              max={today}
              onChange={(e) => e.target.value && setIsoDate(e.target.value)}
            />
            <button onClick={() => shiftDay(1)} disabled={isoDate >= today} title="Next day">
              ›
            </button>
            <button onClick={() => setIsoDate(today)} disabled={isoDate === today}>
              Today
            </button>
          </div>
        </div>

        <div className="toolbar-group">
          <button
            className={panel === "timeline" ? "active" : ""}
            onClick={() => setPanel(panel === "timeline" ? "none" : "timeline")}
          >
            Log
          </button>
          <button
            className={panel === "settings" ? "active" : ""}
            onClick={() => setPanel(panel === "settings" ? "none" : "settings")}
          >
            Settings
          </button>
          {isAdmin && (
            <button
              className={panel === "admin" ? "active" : ""}
              onClick={() => setPanel(panel === "admin" ? "none" : "admin")}
            >
              Admin
            </button>
          )}
          <button onClick={() => signOut(auth)} title={email}>
            Sign out
          </button>
        </div>
      </header>

      <div className="content">
        <main className="map-area">
          <MapView
            track={track}
            records={visible}
            settings={settings}
            autoFit
            selectedId={selectedId}
            onSelect={(id) => {
              const record = visible.find((r) => r.id === id);
              if (record) selectRecord(record);
            }}
          />

          <div className="stats">
            {loading && <span>Loading…</span>}
            {!loading && stats.usedFixes === 0 && <span>Nothing recorded on this day.</span>}
            {!loading && stats.usedFixes > 0 && (
              <>
                <Stat label="Points" value={String(stats.usedFixes)} />
                <Stat label="Distance" value={formatDistance(stats.distanceMeters)} />
                <Stat label="Duration" value={formatDuration(stats.movingMillis)} />
                <Stat label="Top speed" value={formatSpeed(stats.maxSpeed, settings.speedUnit)} />
                <Stat label="Segments" value={String(track.segments.length)} />
                {stats.alarms.length > 0 && (
                  <Stat label="SOS" value={String(stats.alarms.length)} highlight />
                )}
                {stats.droppedByAccuracy > 0 && (
                  <Stat label="Filtered out" value={String(stats.droppedByAccuracy)} />
                )}
              </>
            )}
          </div>

          {error && <p className="banner error">{error}</p>}
          {devicesError && <p className="banner error">{devicesError}</p>}
          {!devicesLoading && devices.length === 0 && (
            <p className="banner">
              No device has sent anything yet. Turn tracking on in the app, then come back.
            </p>
          )}
        </main>

        {panel !== "none" && (
          <aside className="panel">
            <div className="panel-header">
              <h2>{PANEL_TITLES[panel]}</h2>
              <button onClick={() => setPanel("none")}>✕</button>
            </div>
            {panel === "timeline" && (
              <Timeline
                records={visible}
                counts={counts}
                hidden={hidden}
                onToggleKind={toggleKind}
                loading={loading}
                selectedId={selectedId}
                onSelect={(record) => setSelectedId(record.id)}
                onOpenDetail={setOpenRecord}
              />
            )}
            {panel === "settings" && (
              <SettingsPanel state={settingsState} isAdmin={isAdmin} />
            )}
            {panel === "admin" && <AdminPanel currentEmail={email.toLowerCase()} />}
          </aside>
        )}
      </div>

      {openRecord !== null && (
        <RecordDialog
          record={openRecord}
          settings={settings}
          onClose={() => setOpenRecord(null)}
        />
      )}
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
