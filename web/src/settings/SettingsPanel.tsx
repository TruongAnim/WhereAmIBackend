import { useState } from "react";
import type { MapSettings } from "./settings";
import type { SettingsState } from "./useSettings";

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(Math.min(Math.max(next, min), max));
        }}
      />
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function ToggleField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="field field-inline">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="field-label">{label}</span>
        {hint && <span className="field-hint">{hint}</span>}
      </span>
    </label>
  );
}

export function SettingsPanel({
  state,
  isAdmin,
}: {
  state: SettingsState;
  isAdmin: boolean;
}) {
  const { settings, overrides, update, resetOverrides, saveRemoteDefaults } = state;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const overrideCount = Object.keys(overrides).length;

  const set = <K extends keyof MapSettings>(key: K) => (value: MapSettings[K]) =>
    update({ [key]: value } as Partial<MapSettings>);

  const publishDefaults = async () => {
    setSaving(true);
    setSaved(null);
    try {
      await saveRemoteDefaults(settings);
      setSaved("Đã lưu làm mặc định cho mọi người.");
    } catch {
      setSaved("Lưu thất bại — cần quyền admin.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel-body">
      <section>
        <h3>Đường đi</h3>
        <label className="field">
          <span className="field-label">Khi có khoảng trống</span>
          <select
            value={settings.gapBehavior}
            onChange={(e) => set("gapBehavior")(e.target.value as MapSettings["gapBehavior"])}
          >
            <option value="split">Ngắt đoạn</option>
            <option value="connect">Nối thẳng</option>
          </select>
          <span className="field-hint">
            Máy đứng yên lâu thì SDK tắt GPS. Ngắt đoạn phản ánh đúng dữ liệu có
            thật; nối thẳng cho đường liền mạch nhưng là suy đoán.
          </span>
        </label>
        <NumberField
          label="Ngưỡng thời gian (phút)"
          hint="Cách nhau lâu hơn ngần này thì coi là một khoảng trống. 0 để tắt."
          value={settings.gapMinutes}
          min={0}
          max={1440}
          onChange={set("gapMinutes")}
        />
        <NumberField
          label="Ngưỡng khoảng cách (m)"
          hint="Nhảy xa hơn ngần này cũng coi là khoảng trống, dù thời gian ngắn. 0 để tắt."
          value={settings.gapDistanceMeters}
          min={0}
          max={100000}
          step={50}
          onChange={set("gapDistanceMeters")}
        />
        <NumberField
          label="Đơn giản hoá (m)"
          hint="Bỏ bớt điểm gần thẳng hàng khi đường quá dày. 0 để tắt."
          value={settings.simplifyMeters}
          min={0}
          max={1000}
          step={5}
          onChange={set("simplifyMeters")}
        />
      </section>

      <section>
        <h3>Lọc dữ liệu</h3>
        <NumberField
          label="Sai số tối đa (m)"
          hint="Bỏ điểm có sai số lớn hơn. Điểm SOS luôn được giữ. 0 để tắt."
          value={settings.maxAccuracyMeters}
          min={0}
          max={10000}
          step={10}
          onChange={set("maxAccuracyMeters")}
        />
      </section>

      <section>
        <h3>Hiển thị</h3>
        <ToggleField label="Hiện từng điểm" value={settings.showPoints} onChange={set("showPoints")} />
        <ToggleField
          label="Hiện vòng tròn sai số"
          value={settings.showAccuracyCircles}
          onChange={set("showAccuracyCircles")}
        />
        <ToggleField label="Đánh dấu SOS" value={settings.showAlarms} onChange={set("showAlarms")} />
        <label className="field">
          <span className="field-label">Đơn vị tốc độ</span>
          <select
            value={settings.speedUnit}
            onChange={(e) => set("speedUnit")(e.target.value as MapSettings["speedUnit"])}
          >
            <option value="kmh">km/h</option>
            <option value="ms">m/s</option>
          </select>
        </label>
      </section>

      {isAdmin && (
        <section>
          <h3>Nguồn bản đồ</h3>
          <label className="field">
            <span className="field-label">Tile URL</span>
            <input
              type="text"
              value={settings.tileUrl}
              onChange={(e) => set("tileUrl")(e.target.value)}
            />
            <span className="field-hint">
              Đổi được mà không cần deploy lại, phòng khi nguồn tile hiện tại bị chặn.
            </span>
          </label>
          <label className="field">
            <span className="field-label">Attribution</span>
            <input
              type="text"
              value={settings.tileAttribution}
              onChange={(e) => set("tileAttribution")(e.target.value)}
            />
            <span className="field-hint">
              OpenStreetMap yêu cầu ghi nguồn — đừng bỏ trống.
            </span>
          </label>
        </section>
      )}

      <section className="panel-actions">
        <button onClick={resetOverrides} disabled={overrideCount === 0}>
          Khôi phục mặc định{overrideCount > 0 ? ` (${overrideCount})` : ""}
        </button>
        {isAdmin && (
          <button className="primary" onClick={publishDefaults} disabled={saving}>
            {saving ? "Đang lưu…" : "Đặt làm mặc định chung"}
          </button>
        )}
        {saved && <p className="muted">{saved}</p>}
        {overrideCount > 0 && (
          <p className="field-hint">
            Bạn đang dùng {overrideCount} tuỳ chỉnh riêng, chỉ lưu trên trình duyệt này.
          </p>
        )}
      </section>
    </div>
  );
}
