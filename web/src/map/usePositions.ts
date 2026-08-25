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
import { toFix, type PositionRecord } from "./records";
import { dayBounds, toIsoDate, type Fix } from "./track";

export interface PositionsState {
  /** Records that carry coordinates, for the map. */
  fixes: Fix[];
  /** Everything stored for the day, including events and keep-alives. */
  records: PositionRecord[];
  loading: boolean;
  error: string | null;
  /** True while the query is following a live day rather than a fixed one. */
  live: boolean;
}

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asBoolean = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

function toRecord(snapshot: QueryDocumentSnapshot<DocumentData>): PositionRecord | null {
  const data = snapshot.data();

  const timeMs =
    typeof data.timeMs === "number"
      ? data.timeMs
      : data.time instanceof Timestamp
        ? data.time.toMillis()
        : null;
  // Without a timestamp there is nowhere to put it on a day, so it is not a
  // record this viewer can show at all.
  if (timeMs === null) return null;

  const lat = asNumber(data.lat);
  const lon = asNumber(data.lon);

  return {
    id: snapshot.id,
    timeMs,
    receivedAtMs: data.receivedAt instanceof Timestamp ? data.receivedAt.toMillis() : null,
    // A half-filled pair would be a broken document; treat it as positionless
    // rather than letting one NaN coordinate reach the map.
    lat: lat !== null && lon !== null ? lat : null,
    lon: lat !== null && lon !== null ? lon : null,
    accuracy: asNumber(data.accuracy),
    altitude: asNumber(data.altitude),
    speed: asNumber(data.speed),
    bearing: asNumber(data.bearing),
    battery: asNumber(data.battery),
    charging: asBoolean(data.charging),
    batteryTemperature: asNumber(data.batteryTemperature),
    alarm: asString(data.alarm),
    event: asString(data.event),
    positionAge: asNumber(data.positionAge),
    heartbeat: data.heartbeat === true,
    activity: asString(data.activity),
    activityConfidence: asNumber(data.activityConfidence),
    network: asString(data.network),
    carrier: asString(data.carrier),
    screenOn: asBoolean(data.screenOn),
    provider: asString(data.provider),
    satellites: asNumber(data.satellites),
    mock: data.mock === true,
  };
}

function split(snapshot: { docs: QueryDocumentSnapshot<DocumentData>[] }) {
  const records = snapshot.docs
    .map(toRecord)
    .filter((r): r is PositionRecord => r !== null);
  const fixes = records.map(toFix).filter((f): f is Fix => f !== null);
  return { records, fixes };
}

/**
 * Loads one local day for a device.
 *
 * Everything stored is fetched, not just positions: the timeline lists screen
 * events and keep-alives too, and a second query for those would double the
 * reads to show documents that arrived in the same range anyway. The map
 * takes the subset that has coordinates.
 *
 * Today is followed with onSnapshot so the map keeps up with the phone; past
 * days are fetched once, because they cannot change and a live listener would
 * only cost reads.
 */
export function usePositions(deviceId: string | null, isoDate: string): PositionsState {
  const [state, setState] = useState<PositionsState>({
    fixes: [],
    records: [],
    loading: true,
    error: null,
    live: false,
  });

  useEffect(() => {
    if (!deviceId) {
      setState({ fixes: [], records: [], loading: false, error: null, live: false });
      return;
    }

    const { startMs, endMs } = dayBounds(isoDate);
    const isToday = isoDate === toIsoDate(new Date());

    const positionsQuery = query(
      collection(db, "devices", deviceId, "positions"),
      where("time", ">=", Timestamp.fromMillis(startMs)),
      where("time", "<=", Timestamp.fromMillis(endMs)),
      orderBy("time"),
    );

    setState({ fixes: [], records: [], loading: true, error: null, live: isToday });

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
          setState({ ...split(snapshot), loading: false, error: null, live: false });
        })
        .catch((cause) => {
          if (cancelled) return;
          setState({
            fixes: [],
            records: [],
            loading: false,
            error: describe(cause),
            live: false,
          });
        });
      return () => {
        cancelled = true;
      };
    }

    const unsubscribe = onSnapshot(
      positionsQuery,
      (snapshot) => {
        setState({ ...split(snapshot), loading: false, error: null, live: true });
      },
      (cause) => {
        setState({
          fixes: [],
          records: [],
          loading: false,
          error: describe(cause),
          live: false,
        });
      },
    );
    return unsubscribe;
  }, [deviceId, isoDate]);

  return state;
}

export interface DeviceSummary {
  id: string;
  /** Name the owner set on the phone, when the device has reported one. */
  name: string | null;
  manufacturer: string | null;
  model: string | null;
  lastSeenMs: number | null;
  battery: number | null;
  charging: boolean | null;
}

/**
 * What to call a device in the picker.
 *
 * The id stays on the label rather than being replaced by the name. Two
 * installs of the same phone report the same name and different ids, so the
 * name alone would show the same entry twice.
 */
export function deviceLabel(device: DeviceSummary): string {
  const named =
    device.name ??
    [device.manufacturer, device.model].filter((part) => part !== null).join(" ");
  return named.length > 0 ? `${named} · ${device.id}` : device.id;
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
            name: asString(data.name),
            manufacturer: asString(data.manufacturer),
            model: asString(data.model),
            lastSeenMs: lastSeen instanceof Timestamp ? lastSeen.toMillis() : null,
            battery: asNumber(data.battery),
            charging: asBoolean(data.charging),
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
