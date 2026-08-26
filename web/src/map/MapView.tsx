import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import type { MapSettings } from "../settings/settings";
import {
  KIND_COLORS,
  formatAge,
  formatDateTime,
  recordKind,
  recordTitle,
  type PositionRecord,
} from "./records";
import { formatSpeed, type Fix, type Track } from "./track";

const SEGMENT_COLOR = KIND_COLORS.fix;
const START_COLOR = "#16a34a";

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

function popupHtml(record: PositionRecord, settings: MapSettings): string {
  const kind = recordKind(record);
  const rows: Array<[string, string]> = [
    ["Time", formatDateTime(record.timeMs)],
  ];
  if (record.speed !== null) {
    rows.push(["Speed", formatSpeed(record.speed, settings.speedUnit)]);
  }
  if (record.accuracy !== null) rows.push(["Accuracy", `${Math.round(record.accuracy)} m`]);
  if (record.bearing !== null) rows.push(["Bearing", `${Math.round(record.bearing)}°`]);
  if (record.battery !== null) {
    rows.push(["Battery", `${record.battery}%${record.charging ? " (charging)" : ""}`]);
  }
  if (record.lat !== null && record.lon !== null) {
    rows.push(["Coordinates", `${record.lat.toFixed(6)}, ${record.lon.toFixed(6)}`]);
  }
  // The one caption that keeps a borrowed position from reading as a fresh one.
  if (record.positionAge !== null) rows.push(["Position", formatAge(record.positionAge)]);

  const body = rows
    .map(([label, value]) => `<tr><th>${label}</th><td>${escapeHtml(value)}</td></tr>`)
    .join("");
  const title = escapeHtml(recordTitle(record));
  const color = KIND_COLORS[kind];
  return (
    `<strong style="color:${color}">${title}</strong>` +
    `<table class="popup">${body}</table>`
  );
}

export function MapView({
  track,
  records,
  settings,
  autoFit,
  selectedId,
  onSelect,
}: {
  track: Track;
  /** Already filtered by kind. The map shows exactly what the timeline lists. */
  records: readonly PositionRecord[];
  settings: MapSettings;
  autoFit: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const overlayRef = useRef<L.LayerGroup | null>(null);
  const selectionRef = useRef<L.LayerGroup | null>(null);
  /** Guards the initial fit so panning is not stolen back on every update. */
  const fittedKeyRef = useRef<string | null>(null);
  // Held in a ref so redrawing does not depend on the callback's identity.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const byId = useMemo(() => {
    const map = new Map<string, PositionRecord>();
    for (const record of records) map.set(record.id, record);
    return map;
  }, [records]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [10.762622, 106.660172],
      zoom: 13,
      zoomControl: true,
    });
    mapRef.current = map;
    overlayRef.current = L.layerGroup().addTo(map);
    // Its own group, created once. The ring used to be added straight to the
    // map while the redraw below cleared the overlay and blanked the ref that
    // pointed at it - so the ring was left on the map with nothing holding it,
    // and every new selection added another one that could never be removed.
    selectionRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
      selectionRef.current = null;
      tileRef.current = null;
    };
  }, []);

  // Tiles come from settings so the provider can be swapped from the admin
  // panel if OpenStreetMap ever becomes unreachable.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    tileRef.current?.remove();
    tileRef.current = L.tileLayer(settings.tileUrl, {
      attribution: settings.tileAttribution,
      maxZoom: settings.maxZoom,
    }).addTo(map);
  }, [settings.tileUrl, settings.tileAttribution, settings.maxZoom]);

  useEffect(() => {
    const map = mapRef.current;
    const overlay = overlayRef.current;
    if (!map || !overlay) return;

    overlay.clearLayers();

    const bounds = L.latLngBounds([]);
    let first: Fix | null = null;
    let last: Fix | null = null;

    const attach = (layer: L.CircleMarker, record: PositionRecord | undefined) => {
      if (record === undefined) return layer;
      return layer
        .bindPopup(popupHtml(record, settings))
        .on("click", () => onSelectRef.current(record.id));
    };

    for (const segment of track.segments) {
      const latLngs = segment.points.map((p) => [p.lat, p.lon] as [number, number]);
      latLngs.forEach((point) => bounds.extend(point));

      if (latLngs.length > 1) {
        L.polyline(latLngs, {
          color: SEGMENT_COLOR,
          weight: 4,
          opacity: 0.85,
          lineJoin: "round",
        }).addTo(overlay);
      }

      if (settings.showPoints) {
        for (const fix of segment.points) {
          if (fix.alarm !== null && settings.showAlarms) continue; // drawn below
          attach(
            L.circleMarker([fix.lat, fix.lon], {
              radius: 4,
              color: SEGMENT_COLOR,
              weight: 1,
              fillColor: "#ffffff",
              fillOpacity: 1,
            }),
            byId.get(fix.id),
          ).addTo(overlay);
        }
      }

      if (settings.showAccuracyCircles) {
        for (const fix of segment.points) {
          if (fix.accuracy === null) continue;
          L.circle([fix.lat, fix.lon], {
            radius: fix.accuracy,
            color: SEGMENT_COLOR,
            weight: 1,
            opacity: 0.25,
            fillOpacity: 0.08,
          }).addTo(overlay);
        }
      }

      if (segment.points.length > 0) {
        first ??= segment.points[0];
        last = segment.points[segment.points.length - 1];
      }
    }

    // Everything that is not a plain fix: screen events, unknown events and
    // alarms. Each keeps its own colour so the map answers "what happened
    // here" without a click.
    for (const record of records) {
      const kind = recordKind(record);
      if (kind === "fix") continue;
      if (kind === "alarm" && !settings.showAlarms) continue;
      if (record.lat === null || record.lon === null) continue;

      const color = KIND_COLORS[kind];
      const isAlarm = kind === "alarm";
      attach(
        L.circleMarker([record.lat, record.lon], {
          radius: isAlarm ? 9 : 6,
          color,
          weight: isAlarm ? 3 : 2,
          fillColor: color,
          fillOpacity: isAlarm ? 0.4 : 0.75,
        }),
        record,
      ).addTo(overlay);
      bounds.extend([record.lat, record.lon]);
    }

    if (first) {
      attach(
        L.circleMarker([first.lat, first.lon], {
          radius: 7,
          color: START_COLOR,
          weight: 3,
          fillColor: "#ffffff",
          fillOpacity: 1,
        }),
        byId.get(first.id),
      ).addTo(overlay);
    }
    if (last && last !== first) {
      attach(
        L.circleMarker([last.lat, last.lon], {
          radius: 7,
          color: SEGMENT_COLOR,
          weight: 3,
          fillColor: SEGMENT_COLOR,
          fillOpacity: 1,
        }),
        byId.get(last.id),
      ).addTo(overlay);
    }

    const key = `${track.stats.firstTimeMs}-${track.stats.lastTimeMs}-${track.stats.usedFixes}`;
    if (autoFit && bounds.isValid() && fittedKeyRef.current !== key) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
      fittedKeyRef.current = key;
    }
  }, [track, records, byId, settings, autoFit]);

  // Selection lives in its own layer rather than restyling the dot underneath,
  // so it survives a redraw without having to remember every base style.
  useEffect(() => {
    const map = mapRef.current;
    const selection = selectionRef.current;
    if (!map || !selection) return;

    // Emptying the group is what makes "one ring at a time" true no matter how
    // often this runs. Nothing outside this effect ever puts a layer in it.
    selection.clearLayers();

    const record = selectedId === null ? undefined : byId.get(selectedId);
    if (!record || record.lat === null || record.lon === null) return;

    const latLng = L.latLng(record.lat, record.lon);
    L.circleMarker(latLng, {
      radius: 15,
      color: KIND_COLORS[recordKind(record)],
      weight: 3,
      opacity: 0.9,
      fill: false,
      interactive: false,
    }).addTo(selection);

    // Only chase a point that is off screen. Recentring on a dot the reader
    // just clicked would yank the map for no reason.
    if (!map.getBounds().pad(-0.15).contains(latLng)) {
      map.panTo(latLng);
    }
  }, [selectedId, byId]);

  return <div className="map" ref={containerRef} />;
}
