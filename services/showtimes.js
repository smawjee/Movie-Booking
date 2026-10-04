// Screening dates and times are cinema wall-clock times (UK), so "has this
// started" and "which days can be booked" are decided in Europe/London time,
// whatever timezone the server runs in.
const BOOKING_WINDOW_DAYS = 60;

function ukNow(at = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

const addDays = (isoDate, days) => {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

// Today in the UK if no date is given; null for anything malformed, in the
// past or beyond the booking window.
function bookableDate(value, at = new Date()) {
  const today = ukNow(at).date;
  if (value === undefined || value === "") return today;
  const date = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (Number.isNaN(new Date(`${date}T12:00:00Z`).valueOf())) return null;
  if (date < today || date > addDays(today, BOOKING_WINDOW_DAYS)) return null;
  return date;
}

function hasStarted(screening, at = new Date()) {
  const now = ukNow(at);
  return (
    screening.date < now.date ||
    (screening.date === now.date && screening.time <= now.time)
  );
}

const upcomingOnly = (screenings, at = new Date()) =>
  screenings.filter((screening) => !hasStarted(screening, at));

module.exports = {
  BOOKING_WINDOW_DAYS,
  ukNow,
  addDays,
  bookableDate,
  hasStarted,
  upcomingOnly,
};
