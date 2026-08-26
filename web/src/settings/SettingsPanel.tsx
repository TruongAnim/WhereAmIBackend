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
      setSaved("Saved as the default for everyone.");
    } catch {
      setSaved("Save failed — admin rights required.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel-body">
      <section>
        <h3>Track</h3>
        <label className="field">
          <span className="field-label">When there is a gap</span>
          <select
            value={settings.gapBehavior}
            onChange={(e) => set("gapBehavior")(e.target.value as MapSettings["gapBehavior"])}
          >
            <option value="split">Break the line</option>
            <option value="connect">Join straight through</option>
          </select>
          <span className="field-hint">
            The SDK turns GPS off once the phone stops moving. Breaking the line
            reflects the data that actually exists; joining through looks
            continuous but is a guess.
          </span>
        </label>
        <NumberField
          label="Time threshold (min)"
          hint="A pause longer than this counts as a gap. 0 disables it."
          value={settings.gapMinutes}
          min={0}
          max={1440}
          onChange={set("gapMinutes")}
        />
        <NumberField
          label="Distance threshold (m)"
          hint="A jump further than this counts as a gap too, however short the pause. 0 disables it."
          value={settings.gapDistanceMeters}
          min={0}
          max={100000}
          step={50}
          onChange={set("gapDistanceMeters")}
        />
        <NumberField
          label="Simplify (m)"
          hint="Drops nearly-collinear points when the line gets dense. 0 disables it."
          value={settings.simplifyMeters}
          min={0}
          max={1000}
          step={5}
          onChange={set("simplifyMeters")}
        />
      </section>

      <section>
        <h3>Filtering</h3>
        <NumberField
          label="Maximum accuracy (m)"
          hint="Drops points less certain than this. An SOS is always kept. 0 disables it."
          value={settings.maxAccuracyMeters}
          min={0}
          max={10000}
          step={10}
          onChange={set("maxAccuracyMeters")}
        />
      </section>

      <section>
        <h3>Display</h3>
        <ToggleField label="Show every point" value={settings.showPoints} onChange={set("showPoints")} />
        <ToggleField
          label="Show accuracy circles"
          value={settings.showAccuracyCircles}
          onChange={set("showAccuracyCircles")}
        />
        <ToggleField label="Mark SOS records" value={settings.showAlarms} onChange={set("showAlarms")} />
        <label className="field">
          <span className="field-label">Speed unit</span>
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
          <h3>Map tiles</h3>
          <label className="field">
            <span className="field-label">Tile URL</span>
            <input
              type="text"
              value={settings.tileUrl}
              onChange={(e) => set("tileUrl")(e.target.value)}
            />
            <span className="field-hint">
              Changeable without a redeploy, in case the current tile source is blocked.
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
              OpenStreetMap requires attribution — do not leave this empty.
            </span>
          </label>
        </section>
      )}

      <section className="panel-actions">
        <button onClick={resetOverrides} disabled={overrideCount === 0}>
          Reset to defaults{overrideCount > 0 ? ` (${overrideCount})` : ""}
        </button>
        {isAdmin && (
          <button className="primary" onClick={publishDefaults} disabled={saving}>
            {saving ? "Saving…" : "Set as the shared default"}
          </button>
        )}
        {saved && <p className="muted">{saved}</p>}
        {overrideCount > 0 && (
          <p className="field-hint">
            {overrideCount} of these are your own overrides, kept in this browser only.
          </p>
        )}
      </section>
    </div>
  );
}
