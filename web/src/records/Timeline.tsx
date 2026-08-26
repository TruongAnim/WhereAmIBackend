import { useEffect, useMemo, useRef } from "react";
import {
  KIND_COLORS,
  KIND_LABELS,
  KIND_ORDER,
  formatClock,
  recordKind,
  recordSummary,
  recordTitle,
  sortNewestFirst,
  type PositionRecord,
  type RecordKind,
} from "../map/records";
import { Icon, recordIcon } from "../ui/Icon";

/**
 * The day's records, newest first.
 *
 * The filter here is the only one there is: the map draws whatever this list
 * shows. Hiding a kind in one place and not the other would leave two answers
 * to the same question on screen at once.
 */
export function Timeline({
  records,
  counts,
  hidden,
  onToggleKind,
  loading,
  selectedId,
  onSelect,
  onOpenDetail,
}: {
  records: readonly PositionRecord[];
  counts: Record<RecordKind, number>;
  hidden: ReadonlySet<RecordKind>;
  onToggleKind: (kind: RecordKind) => void;
  loading: boolean;
  selectedId: string | null;
  onSelect: (record: PositionRecord) => void;
  onOpenDetail: (record: PositionRecord) => void;
}) {
  const shown = useMemo(() => sortNewestFirst(records), [records]);
  const listRef = useRef<HTMLUListElement | null>(null);

  // Selecting from the map has to bring the row into view here. scrollIntoView
  // with "nearest" does nothing when the row is already visible, so a click
  // that started in this list does not make it jump.
  useEffect(() => {
    if (selectedId === null) return;
    const row = listRef.current?.querySelector(`[data-record-id="${CSS.escape(selectedId)}"]`);
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  // Only kinds the day actually contains. A row of chips reading zero would
  // be noise on every day that has no SOS in it, which is all of them.
  const present = KIND_ORDER.filter((kind) => counts[kind] > 0);

  return (
    <div className="timeline">
      <div className="timeline-filters">
        {present.map((kind) => (
          <button
            key={kind}
            className={`chip${hidden.has(kind) ? " off" : ""}`}
            style={{ "--chip-color": KIND_COLORS[kind] } as React.CSSProperties}
            onClick={() => onToggleKind(kind)}
            title={hidden.has(kind) ? "Show again" : "Hide from the list and the map"}
          >
            <span className="chip-dot" />
            {KIND_LABELS[kind]} {counts[kind]}
          </button>
        ))}
      </div>

      {loading && <p className="muted timeline-empty">Loading…</p>}
      {!loading && shown.length === 0 && (
        <p className="muted timeline-empty">Nothing recorded.</p>
      )}

      <ul className="timeline-list" ref={listRef}>
        {shown.map((record) => {
          const kind = recordKind(record);
          const summary = recordSummary(record);
          const selected = record.id === selectedId;
          return (
            <li
              key={record.id}
              data-record-id={record.id}
              className={`timeline-item${selected ? " selected" : ""}`}
              style={{ "--kind-color": KIND_COLORS[kind] } as React.CSSProperties}
            >
              <button
                className="timeline-main"
                onClick={() => onSelect(record)}
                aria-pressed={selected}
              >
                <span className="timeline-icon">
                  <Icon name={recordIcon(kind)} />
                </span>
                <span className="timeline-text">
                  <span className="timeline-head">
                    <span className="timeline-time">{formatClock(record.timeMs)}</span>
                    <span className="timeline-title">{recordTitle(record)}</span>
                  </span>
                  {summary.length > 0 && <span className="timeline-summary">{summary}</span>}
                </span>
              </button>
              <button
                className="timeline-detail"
                onClick={() => onOpenDetail(record)}
                title="Show details"
              >
                Details
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
