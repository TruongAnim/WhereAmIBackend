import { useEffect, useRef } from "react";
import {
  KIND_COLORS,
  KIND_LABELS,
  activityLabel,
  formatAge,
  formatDateTime,
  networkLabel,
  recordKind,
  recordTitle,
  type PositionRecord,
} from "../map/records";
import { formatSpeed } from "../map/track";
import type { MapSettings } from "../settings/settings";
import { Icon, networkIcon, recordIcon, type IconName } from "../ui/Icon";

/**
 * Everything stored about one record.
 *
 * Fields that are absent are left out rather than shown as a dash. Which
 * telemetry a record carries depends on what the phone could answer at that
 * moment, so a fixed grid of mostly-empty rows would say less, not more.
 */
export function RecordDialog({
  record,
  settings,
  onClose,
}: {
  record: PositionRecord;
  settings: MapSettings;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const kind = recordKind(record);
  const hasPosition = record.lat !== null && record.lon !== null;
  const delayMs =
    record.receivedAtMs !== null ? record.receivedAtMs - record.timeMs : null;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={recordTitle(record)}
        // The backdrop closes on click; without this the dialog itself would
        // count as a backdrop click and close on every interaction inside it.
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <span
            className="timeline-icon"
            style={{ "--kind-color": KIND_COLORS[kind] } as React.CSSProperties}
          >
            <Icon name={recordIcon(kind)} size={18} />
          </span>
          <div>
            <h2>{recordTitle(record)}</h2>
            <p className="muted">{formatDateTime(record.timeMs)}</p>
          </div>
          <button ref={closeRef} onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </header>

        <div className="modal-body">
          <Section title="Thời gian">
            <Row icon="clock" label="Ghi trên máy" value={formatDateTime(record.timeMs)} />
            {record.receivedAtMs !== null && (
              <Row
                icon="download"
                label="Máy chủ nhận"
                value={formatDateTime(record.receivedAtMs)}
                note={delayMs !== null ? formatDelay(delayMs) : undefined}
              />
            )}
          </Section>

          {hasPosition && (
            <Section title="Vị trí">
              <Row
                icon="pin"
                label="Toạ độ"
                value={`${record.lat!.toFixed(6)}, ${record.lon!.toFixed(6)}`}
                // Attached to the coordinates rather than given a row of its
                // own, so the number cannot be read without its caveat.
                note={record.positionAge !== null ? formatAge(record.positionAge) : undefined}
              />
              {record.accuracy !== null && (
                <Row icon="target" label="Sai số" value={`${Math.round(record.accuracy)} m`} />
              )}
              {record.altitude !== null && (
                <Row icon="mountain" label="Độ cao" value={`${Math.round(record.altitude)} m`} />
              )}
              {record.speed !== null && (
                <Row
                  icon="gauge"
                  label="Tốc độ"
                  value={formatSpeed(record.speed, settings.speedUnit)}
                />
              )}
              {record.bearing !== null && (
                <Row icon="compass" label="Hướng" value={`${Math.round(record.bearing)}°`} />
              )}
              {record.provider !== null && (
                <Row icon="radio" label="Nguồn vị trí" value={record.provider} />
              )}
              {record.satellites !== null && (
                <Row icon="satellite" label="Vệ tinh" value={String(record.satellites)} />
              )}
              {record.mock && (
                <Row icon="flask" label="Vị trí giả lập" value="Có" highlight />
              )}
            </Section>
          )}

          <Section title="Thiết bị">
            {record.battery !== null && (
              <Row
                icon={record.charging ? "batteryCharging" : "battery"}
                label="Pin"
                value={`${record.battery}%`}
                note={record.charging ? "đang sạc" : undefined}
              />
            )}
            {record.batteryTemperature !== null && (
              <Row
                icon="thermometer"
                label="Nhiệt độ pin"
                value={`${record.batteryTemperature.toFixed(1)} °C`}
              />
            )}
            {record.screenOn !== null && (
              <Row
                icon={record.screenOn ? "sun" : "moon"}
                label="Màn hình"
                value={record.screenOn ? "Đang bật" : "Đang tắt"}
              />
            )}
            {record.network !== null && (
              <Row
                icon={networkIcon(record.network)}
                label="Kết nối"
                value={networkLabel(record.network)}
              />
            )}
            {record.carrier !== null && (
              <Row icon="tower" label="Nhà mạng" value={record.carrier} />
            )}
            {record.activity !== null && (
              <Row
                icon="walk"
                label="Hoạt động"
                value={activityLabel(record.activity)}
                note={
                  record.activityConfidence !== null
                    ? `${record.activityConfidence}% chắc chắn`
                    : undefined
                }
              />
            )}
            {record.alarm !== null && (
              <Row icon="alert" label="Cảnh báo" value={record.alarm.toUpperCase()} highlight />
            )}
          </Section>

          <Section title="Bản ghi">
            <Row icon="hash" label="Mã" value={record.id} mono />
            <Row icon="phone" label="Loại" value={KIND_LABELS[kind]} />
          </Section>
        </div>
      </div>
    </div>
  );
}

function formatDelay(millis: number): string {
  // Only reachable when the phone's clock ran ahead of the server's.
  if (millis < 0) return "trước giờ máy";
  const seconds = Math.round(millis / 1000);
  if (seconds < 60) return `trễ ${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `trễ ${minutes} phút`;
  return `trễ ${Math.round(minutes / 60)} giờ`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="detail-section">
      <h3>{title}</h3>
      <dl className="detail-rows">{children}</dl>
    </section>
  );
}

function Row({
  icon,
  label,
  value,
  note,
  mono,
  highlight,
}: {
  icon: IconName;
  label: string;
  value: string;
  note?: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={`detail-row${highlight ? " highlight" : ""}`}>
      <span className="detail-icon">
        <Icon name={icon} />
      </span>
      <dt>{label}</dt>
      <dd className={mono ? "mono" : undefined}>
        {value}
        {note !== undefined && <span className="detail-note"> {note}</span>}
      </dd>
    </div>
  );
}
