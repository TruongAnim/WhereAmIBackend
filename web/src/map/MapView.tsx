import L from "leaflet";
import { useEffect, useRef } from "react";
import type { MapSettings } from "../settings/settings";
import { formatSpeed, type Fix, type Track } from "./track";

const SEGMENT_COLOR = "#2563eb";
const POINT_COLOR = "#1d4ed8";
const ALARM_COLOR = "#dc2626";
const START_COLOR = "#16a34a";

function popupHtml(fix: Fix, settings: MapSettings): string {
  const time = new Date(fix.timeMs).toLocaleString();
  const rows: Array<[string, string]> = [["Thời gian", time]];
  if (fix.speed !== null) rows.push(["Tốc độ", formatSpeed(fix.speed, settings.speedUnit)]);
  if (fix.accuracy !== null) rows.push(["Sai số", `${Math.round(fix.accuracy)} m`]);
  if (fix.bearing !== null) rows.push(["Hướng", `${Math.round(fix.bearing)}°`]);
  if (fix.battery !== null) {
    rows.push(["Pin", `${fix.battery}%${fix.charging ? " (đang sạc)" : ""}`]);
  }
  if (fix.alarm !== null) rows.push(["Cảnh báo", fix.alarm.toUpperCase()]);
  rows.push(["Toạ độ", `${fix.lat.toFixed(6)}, ${fix.lon.toFixed(6)}`]);

  const body = rows
    .map(([label, value]) => `<tr><th>${label}</th><td>${value}</td></tr>`)
    .join("");
  return `<table class="popup">${body}</table>`;
}

export function MapView({
  track,
  settings,
  autoFit,
}: {
  track: Track;
  settings: MapSettings;
  autoFit: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const overlayRef = useRef<L.LayerGroup | null>(null);
  /** Guards the initial fit so panning is not stolen back on every update. */
  const fittedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [10.762622, 106.660172],
      zoom: 13,
      zoomControl: true,
    });
    mapRef.current = map;
    overlayRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
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
          L.circleMarker([fix.lat, fix.lon], {
            radius: 4,
            color: POINT_COLOR,
            weight: 1,
            fillColor: "#ffffff",
            fillOpacity: 1,
          })
            .bindPopup(popupHtml(fix, settings))
            .addTo(overlay);
        }
      }

      if (settings.showAccuracyCircles) {
        for (const fix of segment.points) {
          if (fix.accuracy === null) continue;
          L.circle([fix.lat, fix.lon], {
            radius: fix.accuracy,
            color: POINT_COLOR,
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

    if (settings.showAlarms) {
      for (const fix of track.stats.alarms) {
        L.circleMarker([fix.lat, fix.lon], {
          radius: 9,
          color: ALARM_COLOR,
          weight: 3,
          fillColor: ALARM_COLOR,
          fillOpacity: 0.4,
        })
          .bindPopup(popupHtml(fix, settings))
          .addTo(overlay);
        bounds.extend([fix.lat, fix.lon]);
      }
    }

    if (first) {
      L.circleMarker([first.lat, first.lon], {
        radius: 7,
        color: START_COLOR,
        weight: 3,
        fillColor: "#ffffff",
        fillOpacity: 1,
      })
        .bindPopup(`<strong>Điểm đầu</strong>${popupHtml(first, settings)}`)
        .addTo(overlay);
    }
    if (last && last !== first) {
      L.circleMarker([last.lat, last.lon], {
        radius: 7,
        color: SEGMENT_COLOR,
        weight: 3,
        fillColor: SEGMENT_COLOR,
        fillOpacity: 1,
      })
        .bindPopup(`<strong>Điểm cuối</strong>${popupHtml(last, settings)}`)
        .addTo(overlay);
    }

    const key = `${track.stats.firstTimeMs}-${track.stats.lastTimeMs}-${track.stats.usedFixes}`;
    if (autoFit && bounds.isValid() && fittedKeyRef.current !== key) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
      fittedKeyRef.current = key;
    }
  }, [track, settings, autoFit]);

  return <div className="map" ref={containerRef} />;
}
