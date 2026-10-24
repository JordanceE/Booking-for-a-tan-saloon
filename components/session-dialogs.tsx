"use client";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Download,
  LoaderCircle,
  Plus,
  Sun,
} from "lucide-react";
import { dateKey, dayLabel, timeLabel, type Slot } from "@/lib/booking";
import type { FormEvent } from "react";
import Modal from "./modal";
type Confirmation = { slot: Slot; message: string };
export function BookingDialog({
  booking,
  busy,
  setBooking,
  formError,
  submitBooking,
}: {
  booking: Slot;
  busy: boolean;
  setBooking: (slot: Slot | null) => void;
  formError: string;
  submitBooking: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Modal
      title="Make this moment yours."
      busy={busy}
      onClose={() => setBooking(null)}
    >
      <p className="modal-subtitle">
        Just a couple of details, then you're all set.
      </p>
      <div className="booking-summary">
        <Sun size={29} />
        <div>
          <strong>The classic glow · Bed 01</strong>
          <span>
            {dayLabel(booking.startsAt)} · {timeLabel(booking.startsAt)} UTC
          </span>
          <span>{booking.duration} minute session</span>
        </div>
      </div>
      <form onSubmit={submitBooking}>
        <label htmlFor="guest-name">Full name</label>
        <input
          autoFocus
          id="guest-name"
          name="name"
          autoComplete="name"
          placeholder="Your full name"
          minLength={2}
          maxLength={100}
          required
        />
        <label htmlFor="guest-email">Email address</label>
        <input
          id="guest-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          maxLength={254}
          required
        />
        <p className="form-hint">
          Your details are saved with your booking. No email is sent.
        </p>
        {formError && (
          <p role="alert" className="form-error">
            {formError}
          </p>
        )}
        <button
          className="primary-button full-width"
          type="submit"
          disabled={busy}
        >
          {busy ? (
            <>
              <LoaderCircle size={17} className="spin" />
              Reserving your session…
            </>
          ) : (
            <>
              Confirm my session <ArrowRight size={17} />
            </>
          )}
        </button>
      </form>
      <button
        className="text-button"
        onClick={() => setBooking(null)}
        disabled={busy}
      >
        <ArrowLeft size={14} />
        Choose another time
      </button>
    </Modal>
  );
}
export function ConfirmationDialog({
  success,
  setSuccess,
  download,
}: {
  success: Confirmation;
  setSuccess: (value: Confirmation | null) => void;
  download: (slot: Slot) => void;
}) {
  return (
    <Modal title="Hello, sunshine." onClose={() => setSuccess(null)}>
      <div className="success-icon">
        <Check size={31} />
      </div>
      <p className="success-message">{success.message}</p>
      <div className="booking-summary">
        <CalendarDays size={25} />
        <div>
          <strong>{dayLabel(success.slot.startsAt)}</strong>
          <span>
            {timeLabel(success.slot.startsAt)}–
            {timeLabel(success.slot.startsAt + success.slot.duration * 60_000)}{" "}
            UTC · Bed 01
          </span>
          <span>Arrive 5 minutes early. We'll take it from there.</span>
        </div>
      </div>
      <button
        className="primary-button full-width"
        onClick={() => download(success.slot)}
      >
        <Download size={17} />
        Add to my calendar
      </button>
      <button className="text-button" onClick={() => setSuccess(null)}>
        Back to Sunroom <ArrowRight size={14} />
      </button>
    </Modal>
  );
}
export function PublishDialog({
  today,
  busy,
  setAdding,
  formError,
  addSlot,
}: {
  today: string;
  busy: boolean;
  setAdding: (value: boolean) => void;
  formError: string;
  addSlot: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Modal
      title="Make space for a glow."
      busy={busy}
      onClose={() => setAdding(false)}
    >
      <p className="modal-subtitle">
        Publish a new session for Bed 01. All times are UTC.
      </p>
      <form onSubmit={addSlot}>
        <label htmlFor="slot-date">Date</label>
        <input
          autoFocus
          id="slot-date"
          name="date"
          type="date"
          min={today}
          max={dateKey(Date.now() + 365 * 86_400_000)}
          defaultValue={dateKey(Date.now() + 86_400_000)}
          required
        />
        <div className="form-row">
          <div>
            <label htmlFor="slot-time">Start time</label>
            <input
              id="slot-time"
              name="time"
              type="time"
              defaultValue="10:00"
              required
            />
          </div>
          <div>
            <label htmlFor="slot-duration">Duration (minutes)</label>
            <input
              id="slot-duration"
              name="duration"
              type="number"
              min="1"
              max="60"
              defaultValue="15"
              required
            />
          </div>
        </div>
        <p className="form-hint">
          Sessions cannot overlap an available or booked time.
        </p>
        {formError && (
          <p role="alert" className="form-error">
            {formError}
          </p>
        )}
        <button
          className="primary-button full-width"
          disabled={busy}
          type="submit"
        >
          {busy ? (
            <LoaderCircle size={17} className="spin" />
          ) : (
            <Plus size={17} />
          )}
          {busy ? "Publishing…" : "Publish session"}
        </button>
      </form>
    </Modal>
  );
}
