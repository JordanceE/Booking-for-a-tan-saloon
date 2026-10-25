"use client";
import { useEffect, useState } from "react";
import { CalendarDays, Sparkles, ArrowUpRight } from "lucide-react";
import type { ConfigurationStatus } from "@/lib/integrations/config";

export default function IntegrationStatus() {
  const [status, setStatus] = useState<{
    calendar: ConfigurationStatus;
    ai: ConfigurationStatus;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/integrations", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Status unavailable");
        const data = (await response.json()) as {
          calendar: ConfigurationStatus;
          ai: ConfigurationStatus;
        };
        if (active) setStatus(data);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);
  const label = (value: ConfigurationStatus | undefined) =>
    value === "configured"
      ? "Configured"
      : value === "incomplete"
        ? "Setup incomplete"
        : value === "not_configured"
          ? "Not connected"
          : failed
            ? "Status unavailable"
            : "Checking settings…";
  return (
    <div className="integration-cards" aria-label="Studio integrations">
      <div>
        <CalendarDays size={22} />
        <section>
          <h3>
            Google Calendar <span>{label(status?.calendar)}</span>
          </h3>
          <p>
            {status?.calendar === "configured"
              ? "Calendar conflicts are checked before every booking."
              : "Connect the studio calendar to block busy times."}
          </p>
        </section>
      </div>
      <div>
        <Sparkles size={22} />
        <section>
          <h3>
            Smart confirmations <span>{label(status?.ai)}</span>
          </h3>
          <p>
            {status?.ai === "configured"
              ? "Gemini adds a warm note. A standard note is always available."
              : "Standard notes are active until Gemini is connected."}
          </p>
        </section>
      </div>
      <a
        href="https://github.com/JordanceE/Booking-for-a-tan-saloon/blob/main/docs/integrations.md"
        target="_blank"
        rel="noreferrer"
      >
        Integration setup <ArrowUpRight size={13} />
      </a>
    </div>
  );
}
