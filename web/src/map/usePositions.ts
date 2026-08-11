import {
  Timestamp,
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase";
import { dayBounds, toIsoDate, type Fix } from "./track";

export interface PositionsState {
  fixes: Fix[];
  loading: boolean;
  error: string | null;
  /** True while the query is following a live day rather than a fixed one. */
  live: boolean;
}

function toFix(snapshot: QueryDocumentSnapshot<DocumentData>): Fix | null {
  const data = snapshot.data();
  const lat = data.lat;
  const lon = data.lon;
  // Heartbeat records carry no coordinates; the query filters them out, but a
  // stray document must never reach the map as NaN.
  if (typeof lat !== "number" || typeof lon !== "number") return null;

  const timeMs =
    typeof data.timeMs === "number"
      ? data.timeMs
      : data.time instanceof Timestamp
        ? data.time.toMillis()
        : null;
  if (timeMs === null) return null;

  const asNumber = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;

  return {
    id: snapshot.id,
    timeMs,
    lat,
    lon,
    accuracy: asNumber(data.accuracy),
    speed: asNumber(data.speed),
    bearing: asNumber(data.bearing),
    battery: asNumber(data.battery),
    charging: typeof data.charging === "boolean" ? data.charging : null,
    alarm: typeof data.alarm === "string" ? data.alarm : null,
  };
}

/**
 * Loads one local day of positions for a device.
 *
 * Today is followed with onSnapshot so the map keeps up with the phone; past
 * days are fetched once, because they cannot change and a live listener would
 * only cost reads.
 */
export function usePositions(deviceId: string | null, isoDate: string): PositionsState {
  const [state, setState] = useState<PositionsState>({
    fixes: [],
    loading: true,
    error: null,
    live: false,
  });

  useEffect(() => {
    if (!deviceId) {
      setState({ fixes: [], loading: false, error: null, live: false });
      return;
    }

    const { startMs, endMs } = dayBounds(isoDate);
    const isToday = isoDate === toIsoDate(new Date());

    const positionsQuery = query(
      collection(db, "devices", deviceId, "positions"),
      where("heartbeat", "==", false),
      where("time", ">=", Timestamp.fromMillis(startMs)),
      where("time", "<=", Timestamp.fromMillis(endMs)),
      orderBy("time"),
    );

    setState({ fixes: [], loading: true, error: null, live: isToday });

    const describe = (cause: unknown): string => {
      const code = (cause as { code?: string }).code ?? "";
      if (code === "failed-precondition") {
        return "Firestore còn thiếu index cho truy vấn này. Chạy: firebase deploy --only firestore:indexes";
      }
      if (code === "permission-denied") {
        return "Không có quyền đọc dữ liệu của thiết bị này.";
      }
      return "Không tải được dữ liệu. Thử lại nhé.";
    };

    if (!isToday) {
      let cancelled = false;
      getDocs(positionsQuery)
        .then((snapshot) => {
          if (cancelled) return;
          const fixes = snapshot.docs.map(toFix).filter((f): f is Fix => f !== null);
          setState({ fixes, loading: false, error: null, live: false });
        })
        .catch((cause) => {
          if (cancelled) return;
          setState({ fixes: [], loading: false, error: describe(cause), live: false });
        });
      return () => {
        cancelled = true;
      };
    }

    const unsubscribe = onSnapshot(
      positionsQuery,
      (snapshot) => {
        const fixes = snapshot.docs.map(toFix).filter((f): f is Fix => f !== null);
        setState({ fixes, loading: false, error: null, live: true });
      },
      (cause) => {
        setState({ fixes: [], loading: false, error: describe(cause), live: false });
      },
    );
    return unsubscribe;
  }, [deviceId, isoDate]);

  return state;
}

export interface DeviceSummary {
  id: string;
  lastSeenMs: number | null;
  battery: number | null;
  charging: boolean | null;
}

export function useDevices(): { devices: DeviceSummary[]; loading: boolean; error: string | null } {
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "devices"),
      (snapshot) => {
        const list = snapshot.docs.map((docSnapshot) => {
          const data = docSnapshot.data();
          const lastSeen = data.lastSeenAt;
          return {
            id: docSnapshot.id,
            lastSeenMs: lastSeen instanceof Timestamp ? lastSeen.toMillis() : null,
            battery: typeof data.battery === "number" ? data.battery : null,
            charging: typeof data.charging === "boolean" ? data.charging : null,
          };
        });
        list.sort((a, b) => (b.lastSeenMs ?? 0) - (a.lastSeenMs ?? 0));
        setDevices(list);
        setLoading(false);
        setError(null);
      },
      () => {
        setDevices([]);
        setLoading(false);
        setError("Không đọc được danh sách thiết bị.");
      },
    );
    return unsubscribe;
  }, []);

  return { devices, loading, error };
}
