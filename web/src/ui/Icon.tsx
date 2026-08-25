import type { ReactNode } from "react";

/**
 * The icon set, drawn inline.
 *
 * Hand-written rather than pulled from a package: sixteen glyphs is not worth
 * a dependency, and inline paths inherit `currentColor`, so they follow the
 * light and dark palettes without a second set of assets.
 */
export type IconName =
  | "clock"
  | "pin"
  | "target"
  | "gauge"
  | "compass"
  | "mountain"
  | "battery"
  | "batteryCharging"
  | "thermometer"
  | "wifi"
  | "signal"
  | "ethernet"
  | "shield"
  | "wifiOff"
  | "tower"
  | "sun"
  | "moon"
  | "satellite"
  | "walk"
  | "alert"
  | "pulse"
  | "phone"
  | "radio"
  | "download"
  | "hash"
  | "flask";

const PATHS: Record<IconName, ReactNode> = {
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22" />
    </>
  ),
  gauge: (
    <>
      <path d="M4 18a8 8 0 1 1 16 0" />
      <path d="m12 18 4.5-5.5" />
      <circle cx="12" cy="18" r="1.2" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.8 8.2 13.4 13.4 8.2 15.8l2.4-5.2Z" />
    </>
  ),
  mountain: <path d="m3 19 6-10 3.5 5.5L15 11l6 8Z" />,
  battery: (
    <>
      <rect x="2" y="7.5" width="16" height="9" rx="2.5" />
      <path d="M21 10.5v3" />
    </>
  ),
  batteryCharging: (
    <>
      <rect x="2" y="7.5" width="16" height="9" rx="2.5" />
      <path d="M21 10.5v3" />
      <path d="m11 9.2-2 3.1h2.6l-2 3.1" />
    </>
  ),
  thermometer: <path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0Z" />,
  wifi: (
    <>
      <path d="M2.8 9.2a14 14 0 0 1 18.4 0" />
      <path d="M5.9 12.6a9.4 9.4 0 0 1 12.2 0" />
      <path d="M8.9 16a5 5 0 0 1 6.2 0" />
      <circle cx="12" cy="19.4" r="1" />
    </>
  ),
  signal: <path d="M4 20v-3M9 20v-7M14 20v-11M19 20V5" />,
  ethernet: (
    <>
      <rect x="4" y="13" width="16" height="7" rx="1.5" />
      <path d="M8.5 13v-2.5h7V13M12 10.5V4" />
    </>
  ),
  shield: <path d="M12 3.2 19 6v6c0 4.1-3 7.6-7 8.8-4-1.2-7-4.7-7-8.8V6Z" />,
  wifiOff: (
    <>
      <path d="m3 3 18 18" />
      <path d="M8.9 16a5 5 0 0 1 6.2 0" />
      <path d="M5.9 12.6a9.4 9.4 0 0 1 3.4-2.2" />
      <path d="M2.8 9.2a14 14 0 0 1 5.4-3.3" />
    </>
  ),
  tower: (
    <>
      <path d="M12 10.5V21" />
      <circle cx="12" cy="8.6" r="1.7" />
      <path d="M8.6 5.2a4.8 4.8 0 0 0 0 6.8M15.4 5.2a4.8 4.8 0 0 1 0 6.8" />
      <path d="M5.9 2.5a8.6 8.6 0 0 0 0 12.2M18.1 2.5a8.6 8.6 0 0 1 0 12.2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.2M12 19.8V22M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2 12h2.2M19.8 12H22M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
    </>
  ),
  moon: <path d="M20 13.6A8.5 8.5 0 1 1 10.4 4a6.7 6.7 0 0 0 9.6 9.6Z" />,
  satellite: (
    <>
      <path d="M4 20A13 13 0 0 1 17 7" />
      <path d="m4 20 6.4-6.4" />
      <circle cx="4.6" cy="19.4" r="1.4" />
      <path d="m16 4 4 4" />
    </>
  ),
  walk: (
    <>
      <circle cx="13" cy="4.6" r="2" />
      <path d="M9 21.5l2.4-6.3-2.2-3.1 1-3.9 3.3 1.5 1.7 2.6 2.6 1" />
      <path d="m13.4 15.2 2.2 6.3" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 4.4 2.7 17.6a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 4.4a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.5v4" />
      <circle cx="12" cy="17" r="0.7" fill="currentColor" stroke="none" />
    </>
  ),
  pulse: <path d="M2 12h4l2.5-6 4 12 2.5-6H22" />,
  phone: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="2.6" />
      <path d="M10.5 18.5h3" />
    </>
  ),
  radio: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M8.1 8.1a5.5 5.5 0 0 0 0 7.8M15.9 8.1a5.5 5.5 0 0 1 0 7.8" />
      <path d="M5.2 5.2a9.6 9.6 0 0 0 0 13.6M18.8 5.2a9.6 9.6 0 0 1 0 13.6" />
    </>
  ),
  download: (
    <>
      <path d="M12 3.5v11" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M4.5 20h15" />
    </>
  ),
  hash: <path d="M5 9.5h14M5 14.5h14M10.2 4 8.4 20M15.6 4l-1.8 16" />,
  flask: (
    <>
      <path d="M9.5 3v6.2L4.6 18.6A1.7 1.7 0 0 0 6.1 21h11.8a1.7 1.7 0 0 0 1.5-2.4L14.5 9.2V3" />
      <path d="M8.4 3h7.2" />
    </>
  ),
};

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/**
 * Which glyph stands for a record. Takes plain strings rather than the record
 * type so the icon set stays independent of the data model.
 */
export function recordIcon(kind: string, event: string | null): IconName {
  if (event === "screen_off") return "moon";
  switch (kind) {
    case "alarm":
      return "alert";
    case "event":
      return "sun";
    case "heartbeat":
      return "pulse";
    default:
      return "pin";
  }
}

/** Which glyph stands for a network type. */
export function networkIcon(network: string): IconName {
  switch (network) {
    case "wifi":
      return "wifi";
    case "cellular":
      return "signal";
    case "ethernet":
      return "ethernet";
    case "vpn":
      return "shield";
    case "none":
      return "wifiOff";
    default:
      return "radio";
  }
}
