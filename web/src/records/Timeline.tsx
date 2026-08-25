import { useMemo, useState } from "react";
import {
  formatClock,
  recordKind,
  recordSummary,
  recordTitle,
  sortNewestFirst,
  type PositionRecord,
} from "../map/records";
import { Icon, recordIcon } from "../ui/Icon";

type Filter = "all" | "events" | "fixes";

/**
 * The day's records, newest first.
 *
 * A filter sits above the list because a normal day is hundreds of positions
 * and a handful of events; without it the thing worth looking for is the
 * thing hardest to find.
 */
export function Timeline({
  records,
  loading,
  onSelect,
}: {
  records: readonly PositionRecord[];
  loading: boolean;
  onSelect: (record: PositionRecord) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const shown = useMemo(() => {
    const sorted = sortNewestFirst(records);
    if (filter === "events") {
      return sorted.filter((record) => recordKind(record) !== "fix");
    }
    if (filter === "fixes") {
      return sorted.filter((record) => recordKind(record) === "fix");
    }
    return sorted;
  }, [records, filter]);

  const eventCount = useMemo(
    () => records.filter((record) => recordKind(record) !== "fix").length,
    [records],
  );

  return (
    <div className="timeline">
      <div className="timeline-filters">
        <FilterChip current={filter} value="all" onPick={setFilter}>
          Tất cả {records.length}
        </FilterChip>
        <FilterChip current={filter} value="events" onPick={setFilter}>
          Sự kiện {eventCount}
        </FilterChip>
        <FilterChip current={filter} value="fixes" onPick={setFilter}>
          Vị trí {records.length - eventCount}
        </FilterChip>
      </div>

      {loading && <p className="muted timeline-empty">Đang tải…</p>}
      {!loading && shown.length === 0 && (
        <p className="muted timeline-empty">Không có bản ghi nào.</p>
      )}

      <ul className="timeline-list">
        {shown.map((record) => {
          const kind = recordKind(record);
          const summary = recordSummary(record);
          return (
            <li key={record.id} className={`timeline-item kind-${kind}`}>
              <span className={`timeline-icon kind-${kind}`}>
                <Icon name={recordIcon(kind, record.event)} />
              </span>
              <div className="timeline-text">
                <div className="timeline-head">
                  <span className="timeline-time">{formatClock(record.timeMs)}</span>
                  <span className="timeline-title">{recordTitle(record)}</span>
                </div>
                {summary.length > 0 && <div className="timeline-summary">{summary}</div>}
              </div>
              <button
                className="timeline-detail"
                onClick={() => onSelect(record)}
                title="Xem chi tiết"
              >
                Chi tiết
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FilterChip({
  current,
  value,
  onPick,
  children,
}: {
  current: Filter;
  value: Filter;
  onPick: (value: Filter) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`chip${current === value ? " active" : ""}`}
      onClick={() => onPick(value)}
    >
      {children}
    </button>
  );
}
