"use client";
import StudioCard from "@/components/studio-card";
import BookingCalendar from "@/components/booking-calendar";
import SessionList from "@/components/session-list";
import StudioDashboard from "@/components/studio-dashboard";
import {
  BookingDialog,
  ConfirmationDialog,
  PublishDialog,
} from "@/components/session-dialogs";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  List,
  LoaderCircle,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
} from "lucide-react";
import {
  calendarFile,
  dateKey,
  dayLabel,
  timeLabel,
  isAvailable,
  type Slot,
} from "@/lib/booking";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
    cache: "no-store",
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(data.error || "Something went wrong. Please try again.");
  return data as T;
}

export default function Sunroom() {
  const [view, setView] = useState<"book" | "studio">("book");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [day, setDay] = useState(dateKey(Date.now()));
  const [month, setMonth] = useState(
    () => new Date(new Date().toISOString().slice(0, 7) + "-01T00:00:00Z"),
  );
  const [duration, setDuration] = useState(0);
  const [layout, setLayout] = useState<"calendar" | "list">("calendar");
  const [selected, setSelected] = useState<Slot | null>(null);
  const [booking, setBooking] = useState<Slot | null>(null);
  const [success, setSuccess] = useState<{
    slot: Slot;
    message: string;
    confirmationPending?: boolean;
    confirmationSource?: "gemini" | "fallback";
  } | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const initialized = useRef(false);

  const load = useCallback(async () => {
    const data = await request<{ slots: Slot[] }>("/api/slots");
    setSlots(data.slots);
    setError("");
    if (!initialized.current) {
      const first = data.slots.find(isAvailable) ?? data.slots[0];
      if (first) {
        setDay(dateKey(first.startsAt));
        setMonth(
          new Date(dateKey(first.startsAt).slice(0, 7) + "-01T00:00:00Z"),
        );
      }
      initialized.current = true;
    }
  }, []);

  const initialize = useCallback(async () => {
    setLoading(true);
    try {
      await request("/api/setup", { method: "POST" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    void initialize();
  }, [initialize]);
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden)
        void load().catch((error) =>
          setError(
            error instanceof Error
              ? error.message
              : "Availability could not be refreshed. Please retry before booking.",
          ),
        );
    };
    const timer = window.setInterval(refresh, 20_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  const matching = slots.filter((s) => !duration || s.duration === duration);
  const selectedIsAvailable =
    selected && slots.some((s) => s.id === selected.id && isAvailable(s));
  const today = dateKey(Date.now());
  function chooseDay(value: string) {
    setDay(value);
    setSelected(null);
  }
  function download(slot: Slot) {
    const url = URL.createObjectURL(
      new Blob([calendarFile(slot)], { type: "text/calendar;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "sunroom-session.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!booking || busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setFormError("");
    try {
      const result = await request<{
        slot: Slot;
        message: string;
        confirmationToken: string;
      }>("/api/bookings", {
        method: "POST",
        body: JSON.stringify({
          slotId: booking.id,
          name: data.get("name"),
          email: data.get("email"),
        }),
      });
      setSlots((current) =>
        current.map((s) => (s.id === result.slot.id ? result.slot : s)),
      );
      setSuccess({
        slot: result.slot,
        message: result.message,
        confirmationPending: true,
        confirmationSource: "fallback",
      });
      // Booking is already saved. AI failure must not turn it into a failed booking.
      void request<{ message: string; source: "gemini" | "fallback" }>(
        "/api/confirmations",
        {
          method: "POST",
          body: JSON.stringify({
            slotId: result.slot.id,
            token: result.confirmationToken,
          }),
        },
      )
        .then((note) =>
          setSuccess((current) =>
            current?.slot.id === result.slot.id
              ? {
                  ...current,
                  message: note.message,
                  confirmationSource: note.source,
                  confirmationPending: false,
                }
              : current,
          ),
        )
        .catch(() =>
          setSuccess((current) =>
            current?.slot.id === result.slot.id
              ? { ...current, confirmationPending: false }
              : current,
          ),
        );
      setBooking(null);
      setSelected(null);
      void load().catch(() => {});
    } catch (e) {
      setFormError((e as Error).message);
      void load().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  async function addSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setFormError("");
    try {
      const result = await request<{ slot: Slot }>("/api/slots", {
        method: "POST",
        body: JSON.stringify({
          date: data.get("date"),
          time: data.get("time"),
          duration: Number(data.get("duration")),
        }),
      });
      setSlots((current) =>
        [...current, result.slot].sort((a, b) => a.startsAt - b.startsAt),
      );
      setAdding(false);
      setNotice("New session published. It's ready to book.");
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeSlot(id: string) {
    setRemoving(id);
    try {
      await request(`/api/slots/${id}`, { method: "DELETE" });
      setSlots((current) => current.filter((s) => s.id !== id));
      setNotice("Available session removed.");
    } catch (e) {
      setError((e as Error).message);
      void load().catch(() => {});
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <a className="wordmark" href="/" aria-label="Sunroom home">
            <Sun size={31} strokeWidth={1.6} />
            sunroom<span className="logo-dot">®</span>
          </a>
          <nav className="main-nav" aria-label="Main navigation">
            <button
              className={view === "book" ? "nav-active" : ""}
              onClick={() => setView("book")}
            >
              Book a session
            </button>
            <button
              className={view === "studio" ? "nav-active" : ""}
              onClick={() => setView("studio")}
            >
              <SlidersHorizontal size={15} />
              Manage studio
            </button>
          </nav>
          <span className="header-note">
            <span className="status-dot" />A little time for yourself
          </span>
        </div>
      </header>

      <main>
        <section className="intro">
          <div>
            <p className="eyebrow">
              <span />
              {view === "book"
                ? "A LITTLE SUNSHINE, ON YOUR SCHEDULE"
                : "YOUR STUDIO, AT A GLANCE"}
            </p>
            <h1>
              {view === "book" ? (
                <>
                  Your next glow.
                  <br />
                  <em>On your time.</em>
                </>
              ) : (
                <>
                  Make room
                  <br />
                  <em>for a little sunshine.</em>
                </>
              )}
            </h1>
            <p className="intro-copy">
              {view === "book"
                ? "Pick your moment, book your bed, and leave the rest to us."
                : "Publish available sessions and keep your bed's schedule in sync."}
            </p>
          </div>
          <div className="sun-art" aria-hidden="true">
            <div className="sun-orbit orbit-one" />
            <div className="sun-orbit orbit-two" />
            <div className="sun-disc" />
            <div className="sun-horizon" />
            <span className="sun-caption">FEEL GOOD. GLOW SLOW.</span>
            <Sparkles className="art-spark" size={25} strokeWidth={1} />
          </div>
        </section>

        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button onClick={() => void initialize()}>Retry</button>
          </div>
        )}
        {view === "book" ? (
          <>
            <section className="booking-heading">
              <div>
                <h2>Find your sunny spot</h2>
                <p>A small pause. A little warmth. All yours.</p>
              </div>
              <div className="live-badge">
                <span className="status-dot" />
                Live availability
              </div>
            </section>
            <section
              className="booking-card"
              aria-label="Book a tanning session"
            >
              <StudioCard />

              <div className="booking-workspace">
                <div className="workspace-toolbar">
                  <div
                    className="duration-options"
                    aria-label="Filter by session duration"
                  >
                    {[0, 10, 15, 20].map((d) => (
                      <button
                        key={d}
                        aria-pressed={duration === d}
                        className={duration === d ? "chip active" : "chip"}
                        onClick={() => {
                          setDuration(d);
                          setSelected(null);
                        }}
                      >
                        {d ? `${d} min` : "All sessions"}
                      </button>
                    ))}
                  </div>
                  <div className="layout-switch">
                    <button
                      className={layout === "calendar" ? "active" : ""}
                      aria-label="Calendar view"
                      aria-pressed={layout === "calendar"}
                      onClick={() => setLayout("calendar")}
                    >
                      <CalendarDays size={17} />
                    </button>
                    <button
                      className={layout === "list" ? "active" : ""}
                      aria-label="List view"
                      aria-pressed={layout === "list"}
                      onClick={() => setLayout("list")}
                    >
                      <List size={18} />
                    </button>
                  </div>
                </div>
                {loading ? (
                  <div className="loading-state">
                    <LoaderCircle className="spin" />
                    <p>Finding your sunny spot…</p>
                  </div>
                ) : layout === "calendar" ? (
                  <BookingCalendar
                    month={month}
                    setMonth={setMonth}
                    today={today}
                    day={day}
                    chooseDay={chooseDay}
                    matching={matching}
                    selected={selected}
                    setSelected={setSelected}
                    duration={duration}
                    setDuration={setDuration}
                  />
                ) : (
                  <SessionList
                    matching={matching}
                    selected={selected}
                    setSelected={setSelected}
                    setDay={setDay}
                  />
                )}
                <div className="booking-bottom">
                  <div>
                    {selectedIsAvailable ? (
                      <>
                        <span className="selection-title">
                          {dayLabel(selected.startsAt, true)} ·{" "}
                          {timeLabel(selected.startsAt)}
                        </span>
                        <span className="small muted">
                          {error
                            ? "Availability couldn't be verified. Retry above to continue."
                            : `${selected.duration} minutes, just for you`}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="selection-title">
                          A little me-time is calling.
                        </span>
                        <span className="small muted">
                          Choose your day and time to get started.
                        </span>
                      </>
                    )}
                  </div>
                  <button
                    className="primary-button"
                    disabled={!selectedIsAvailable || loading || !!error}
                    onClick={() => {
                      setFormError("");
                      setBooking(selected);
                    }}
                  >
                    Continue <ArrowRight size={17} />
                  </button>
                </div>
              </div>
            </section>
            <div className="reassurance">
              <span>
                <Check size={15} />
                Booked in a few taps
              </span>
              <span>
                <ShieldCheck size={16} />
                Your time, reserved for you
              </span>
              <span>
                <Sparkles size={16} />A brighter kind of break
              </span>
            </div>
          </>
        ) : (
          <StudioDashboard
            slots={slots}
            loading={loading}
            setAdding={setAdding}
            setFormError={setFormError}
            removing={removing}
            removeSlot={removeSlot}
          />
        )}
        <section className="bottom-note">
          <div className="mini-sun">
            <Sun size={24} strokeWidth={1.2} />
          </div>
          <p>
            Good things happen when you
            <br />
            <em>make a little time for yourself.</em>
          </p>
        </section>
      </main>
      <footer>
        <a className="footer-wordmark" href="/">
          sunroom
        </a>
        <span>A little sunshine goes a long way.</span>
        <span>© {new Date().getUTCFullYear()} Sunroom Studio</span>
      </footer>

      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
        </div>
      )}
      {booking && (
        <BookingDialog
          booking={booking}
          busy={busy}
          setBooking={setBooking}
          formError={formError}
          submitBooking={submitBooking}
        />
      )}
      {success && (
        <ConfirmationDialog
          success={success}
          setSuccess={setSuccess}
          download={download}
        />
      )}
      {adding && (
        <PublishDialog
          today={today}
          busy={busy}
          setAdding={setAdding}
          formError={formError}
          addSlot={addSlot}
        />
      )}
    </div>
  );
}
