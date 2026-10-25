"use client";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Globe2,
  Sun,
} from "lucide-react";
import {
  dateKey,
  dayLabel,
  timeLabel,
  isAvailable,
  slotStatus,
  type Slot,
} from "@/lib/booking";
import type { Dispatch, SetStateAction } from "react";
interface Props {
  month: Date;
  setMonth: Dispatch<SetStateAction<Date>>;
  today: string;
  day: string;
  chooseDay: (day: string) => void;
  matching: Slot[];
  selected: Slot | null;
  setSelected: (slot: Slot) => void;
  duration: number;
  setDuration: (duration: number) => void;
}
export default function BookingCalendar({
  month,
  setMonth,
  today,
  day,
  chooseDay,
  matching,
  selected,
  setSelected,
  duration,
  setDuration,
}: Props) {
  const monthLabel = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(month);
  const monthDays = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const padding = (month.getUTCDay() + 6) % 7;

  function changeMonth(delta: number) {
    setMonth(
      (value) =>
        new Date(
          Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + delta, 1),
        ),
    );
  }
  const available = matching.filter(isAvailable);
  const daySlots = matching.filter((s) => dateKey(s.startsAt) === day);
  return (
    <div className="calendar-and-times">
      <div className="calendar-panel">
        <div className="calendar-title">
          <h3>{monthLabel}</h3>
          <div>
            <button
              className="icon-button"
              aria-label="Previous month"
              disabled={month.toISOString().slice(0, 7) <= today.slice(0, 7)}
              onClick={() => changeMonth(-1)}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="Next month"
              disabled={month.getTime() > Date.now() + 335 * 86_400_000}
              onClick={() => changeMonth(1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        <div className="calendar-grid">
          <div className="weekday-row">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="date-grid">
            {Array.from({ length: padding }, (_, i) => (
              <span key={`p${i}`} />
            ))}
            {Array.from({ length: monthDays }, (_, i) => {
              const key = dateKey(
                Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), i + 1),
              );
              const hasSlots = available.some(
                (s) => dateKey(s.startsAt) === key,
              );
              return (
                <button
                  key={key}
                  className={`calendar-day ${key === day ? "selected" : ""} ${hasSlots ? "has-slots" : ""} ${key === today ? "today" : ""}`}
                  disabled={key < today}
                  onClick={() => chooseDay(key)}
                  aria-label={`${dayLabel(Date.parse(key))}${hasSlots ? ", sessions available" : ", no available sessions"}`}
                  aria-pressed={key === day}
                >
                  {i + 1}
                  {hasSlots && <span />}
                </button>
              );
            })}
          </div>
        </div>
        <div className="calendar-legend">
          <span />
          <span>Sessions available</span>
        </div>
        <div className="timezone">
          <Globe2 size={14} />
          Studio time: UTC
        </div>
      </div>
      <div className="times-panel">
        <div className="times-heading">
          <h3>{dayLabel(Date.parse(day), true)}</h3>
          <span>{daySlots.filter(isAvailable).length} available</span>
        </div>
        <p className="small muted">Choose a time that feels right.</p>
        {daySlots.length ? (
          <div className="time-grid">
            {daySlots.map((s) => (
              <button
                className={`time-slot ${selected?.id === s.id ? "chosen" : ""}`}
                key={s.id}
                disabled={!isAvailable(s)}
                aria-pressed={selected?.id === s.id}
                onClick={() => setSelected(s)}
              >
                <strong>{timeLabel(s.startsAt)}</strong>
                <span>
                  {isAvailable(s) ? `${s.duration} min` : slotStatus(s)}
                </span>
                {selected?.id === s.id && isAvailable(s) && <Check size={14} />}
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-day">
            <Sun size={30} strokeWidth={1} />
            <h4>A quiet day in the sun.</h4>
            <p>
              No {duration ? `${duration} minute ` : ""}sessions on this date.
              Try another day.
            </p>
            <button
              onClick={() => {
                const next =
                  available.find((s) => dateKey(s.startsAt) > day) ??
                  available[0];
                if (next) {
                  chooseDay(dateKey(next.startsAt));
                  setMonth(
                    new Date(
                      dateKey(next.startsAt).slice(0, 7) + "-01T00:00:00Z",
                    ),
                  );
                } else {
                  setDuration(0);
                }
              }}
            >
              Find an available session <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
