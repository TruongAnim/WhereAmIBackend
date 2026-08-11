import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import { db } from "../firebase";
import { DEFAULT_SETTINGS, mergeSettings, type MapSettings } from "./settings";

const LOCAL_OVERRIDES_KEY = "whereami.settings.overrides";

function readLocalOverrides(): Partial<MapSettings> {
  try {
    const raw = window.localStorage.getItem(LOCAL_OVERRIDES_KEY);
    return raw ? (JSON.parse(raw) as Partial<MapSettings>) : {};
  } catch {
    return {};
  }
}

export interface SettingsState {
  /** Remote defaults with this viewer's own overrides applied on top. */
  settings: MapSettings;
  /** Remote defaults alone - what the admin panel edits. */
  remoteDefaults: MapSettings;
  /** Keys this viewer has personally changed. */
  overrides: Partial<MapSettings>;
  update: (patch: Partial<MapSettings>) => void;
  resetOverrides: () => void;
  saveRemoteDefaults: (next: MapSettings) => Promise<void>;
}

/**
 * Layers settings in one direction: built-in defaults, then `config/map` from
 * Firestore (the remote config an admin edits), then whatever this viewer
 * changed in the panel, which stays in localStorage and never leaves the
 * browser.
 */
export function useSettings(): SettingsState {
  const [remoteRaw, setRemoteRaw] = useState<Record<string, unknown> | null>(null);
  const [overrides, setOverrides] = useState<Partial<MapSettings>>(readLocalOverrides);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "config", "map"),
      (snapshot) => setRemoteRaw((snapshot.data() as Record<string, unknown>) ?? {}),
      () => setRemoteRaw({}),
    );
    return unsubscribe;
  }, []);

  const remoteDefaults = mergeSettings(DEFAULT_SETTINGS, remoteRaw);
  const settings = mergeSettings(
    remoteDefaults,
    overrides as unknown as Record<string, unknown>,
  );

  const update = useCallback((patch: Partial<MapSettings>) => {
    setOverrides((previous) => {
      const next = { ...previous, ...patch };
      try {
        window.localStorage.setItem(LOCAL_OVERRIDES_KEY, JSON.stringify(next));
      } catch {
        // A full or disabled localStorage must not break the map.
      }
      return next;
    });
  }, []);

  const resetOverrides = useCallback(() => {
    setOverrides({});
    try {
      window.localStorage.removeItem(LOCAL_OVERRIDES_KEY);
    } catch {
      // ignored
    }
  }, []);

  const saveRemoteDefaults = useCallback(async (next: MapSettings) => {
    await setDoc(doc(db, "config", "map"), { ...next, updatedAt: new Date() }, { merge: true });
  }, []);

  return { settings, remoteDefaults, overrides, update, resetOverrides, saveRemoteDefaults };
}
