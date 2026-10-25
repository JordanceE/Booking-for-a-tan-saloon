/** All timestamps are milliseconds since epoch. The studio uses UTC everywhere. */
export type Slot = {
  id: string;
  startsAt: number;
  duration: number;
  booked: boolean;
  calendarBlocked?: boolean;
};
export const isAvailable = (slot: Slot) =>
  !slot.booked && !slot.calendarBlocked;
export const slotStatus = (slot: Slot) =>
  slot.booked ? "Booked" : slot.calendarBlocked ? "Calendar busy" : "Available";
export const TIME_ZONE = "UTC";
export const dateKey = (value: number | Date) =>
  new Date(value).toISOString().slice(0, 10);
export const timeLabel = (value: number) =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(value);
export const dayLabel = (value: number, short = false) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: short ? "short" : "long",
    day: "numeric",
    month: short ? "short" : "long",
    timeZone: TIME_ZONE,
  }).format(value);

export function parseStudioTime(date: string, time: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    return null;
  const value = Date.parse(`${date}T${time}:00.000Z`);
  return Number.isFinite(value) &&
    new Date(value).toISOString().slice(0, 16) === `${date}T${time}`
    ? value
    : null;
}

const calendarTimestamp = (value: number) =>
  new Date(value)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

export function googleCalendarUrl(slot: Slot): string {
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", "Sunroom tanning session");
  url.searchParams.set(
    "dates",
    `${calendarTimestamp(slot.startsAt)}/${calendarTimestamp(slot.startsAt + slot.duration * 60_000)}`,
  );
  url.searchParams.set("ctz", TIME_ZONE);
  url.searchParams.set("location", "Sunroom Studio - Bed 01");
  url.searchParams.set(
    "details",
    "Your Sunroom session. Please arrive 5 minutes before your appointment. Studio time: UTC.",
  );
  return url.toString();
}

export function calendarFile(slot: Slot): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sunroom//Studio Booking//EN",
    "BEGIN:VEVENT",
    `UID:${slot.id}@sunroom.studio`,
    `DTSTAMP:${calendarTimestamp(Date.now())}`,
    `DTSTART:${calendarTimestamp(slot.startsAt)}`,
    `DTEND:${calendarTimestamp(slot.startsAt + slot.duration * 60_000)}`,
    "SUMMARY:Sunroom tanning session",
    "LOCATION:Sunroom Studio - Bed 01",
    "DESCRIPTION:Your Sunroom session. Please arrive 5 minutes before your appointment.",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
