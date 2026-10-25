"use client";
import {
  Check,
  Leaf,
  LoaderCircle,
  Plus,
  ShieldCheck,
  Sun,
  Trash2,
} from "lucide-react";
import {
  dayLabel,
  timeLabel,
  isAvailable,
  slotStatus,
  type Slot,
} from "@/lib/booking";
import IntegrationStatus from "./integration-status";
interface Props {
  slots: Slot[];
  loading: boolean;
  setAdding: (value: boolean) => void;
  setFormError: (value: string) => void;
  removing: string | null;
  removeSlot: (id: string) => Promise<void>;
}
export default function StudioDashboard({
  slots,
  loading,
  setAdding,
  setFormError,
  removing,
  removeSlot,
}: Props) {
  return (
    <section className="management">
      <div className="management-heading">
        <div>
          <h2>Your session schedule</h2>
          <p>One studio. One bed. Every moment accounted for.</p>
        </div>
        <button
          className="primary-button"
          onClick={() => {
            setAdding(true);
            setFormError("");
          }}
        >
          <Plus size={17} />
          Publish a slot
        </button>
      </div>
      <div className="stats-row">
        <div>
          <span>Available sessions</span>
          <strong>{slots.filter(isAvailable).length}</strong>
          <Sun size={25} />
        </div>
        <div>
          <span>Booked sessions</span>
          <strong>{slots.filter((s) => s.booked).length}</strong>
          <Check size={25} />
        </div>
        <div>
          <span>Studio resource</span>
          <strong className="bed-stat">Bed 01</strong>
          <Leaf size={25} />
        </div>
      </div>
      <IntegrationStatus />
      <div className="schedule-table">
        <div className="table-top">
          <h3>Upcoming availability</h3>
          <span className="small muted">Studio time: UTC</span>
        </div>
        {loading ? (
          <div className="loading-state">
            <LoaderCircle className="spin" />
          </div>
        ) : !slots.length ? (
          <div className="empty-day">
            <Sun />
            <h4>Make room for your first guest.</h4>
            <p>Publish a time slot to start taking bookings.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Duration</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {slots.map((s) => (
                  <tr key={s.id}>
                    <td>{dayLabel(s.startsAt, true)}</td>
                    <td>
                      {timeLabel(s.startsAt)}–
                      {timeLabel(s.startsAt + s.duration * 60_000)}
                    </td>
                    <td>{s.duration} minutes</td>
                    <td>
                      <span
                        className={`availability-tag ${!isAvailable(s) ? "is-booked" : ""}`}
                      >
                        {slotStatus(s)}
                      </span>
                    </td>
                    <td>
                      {!s.booked && (
                        <button
                          className="icon-button remove-slot"
                          aria-label={`Remove ${dayLabel(s.startsAt, true)} ${timeLabel(s.startsAt)} slot`}
                          disabled={removing !== null}
                          onClick={() => void removeSlot(s.id)}
                        >
                          {removing === s.id ? (
                            <LoaderCircle size={16} className="spin" />
                          ) : (
                            <Trash2 size={16} />
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="management-note">
        <ShieldCheck size={15} />
        Booked sessions stay reserved and cannot be removed.
      </p>
    </section>
  );
}
