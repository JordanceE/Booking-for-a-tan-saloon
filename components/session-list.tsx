"use client";
import { CalendarDays, Sun } from "lucide-react";
import { dateKey, dayLabel, timeLabel, type Slot } from "@/lib/booking";
interface Props {
  matching: Slot[];
  selected: Slot | null;
  setSelected: (slot: Slot) => void;
  setDay: (day: string) => void;
}
export default function SessionList({
  matching,
  selected,
  setSelected,
  setDay,
}: Props) {
  return (
    <div className="list-panel">
      <div className="list-heading">
        <h3>Upcoming sessions</h3>
        <span className="small muted">All times in UTC</span>
      </div>
      {matching.length ? (
        matching.map((s) => (
          <button
            key={s.id}
            className={`list-session ${selected?.id === s.id ? "chosen" : ""}`}
            disabled={s.booked}
            onClick={() => {
              setSelected(s);
              setDay(dateKey(s.startsAt));
            }}
          >
            <span className="list-date">
              <CalendarDays size={18} />
              {dayLabel(s.startsAt, true)}
            </span>
            <strong>{timeLabel(s.startsAt)}</strong>
            <span>{s.duration} min</span>
            <span className={`availability-tag ${s.booked ? "is-booked" : ""}`}>
              {s.booked ? "Booked" : "Available"}
            </span>
          </button>
        ))
      ) : (
        <div className="empty-day">
          <Sun />
          <h4>No sessions just yet.</h4>
          <p>Try another duration or check back soon.</p>
        </div>
      )}
    </div>
  );
}
