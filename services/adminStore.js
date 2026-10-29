const { supabase } = require("./supabaseClient");

const DAY = 86400000;
const startOfUtcDay = (offsetDays = 0) => {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return new Date(date.getTime() - offsetDays * DAY);
};
const must = ({ data, error, count }) => {
  if (error) throw error;
  return count ?? data;
};
const exactCount = (table, filter = (q) => q) =>
  filter(supabase.from(table).select("*", { count: "exact", head: true })).then(
    must,
  );

/** Headline numbers and the last 14 days of sales, for the dashboard. */
async function overview() {
  const since = startOfUtcDay(29);
  const [bookings, members, accounts, deliveries] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "total_pence, created_at, booking_seats ( count ), screenings ( movies ( title ) )",
      )
      .gte("created_at", since.toISOString())
      .then(must),
    exactCount("memberships", (q) => q.eq("status", "active")),
    exactCount("profiles"),
    supabase.from("ticket_deliveries").select("status").then(must),
  ]);
  const period = (days) => {
    const from = startOfUtcDay(days - 1);
    const rows = bookings.filter((b) => new Date(b.created_at) >= from);
    return {
      bookings: rows.length,
      tickets: rows.reduce((n, b) => n + (b.booking_seats[0]?.count || 0), 0),
      revenuePence: rows.reduce((n, b) => n + b.total_pence, 0),
    };
  };
  const daily = Array.from({ length: 14 }, (_, i) => {
    const day = startOfUtcDay(13 - i);
    const rows = bookings.filter(
      (b) =>
        new Date(b.created_at) >= day &&
        new Date(b.created_at) < new Date(day.getTime() + DAY),
    );
    return {
      date: day.toISOString().slice(0, 10),
      bookings: rows.length,
      revenuePence: rows.reduce((n, b) => n + b.total_pence, 0),
    };
  });
  const films = new Map();
  for (const b of bookings) {
    const title = b.screenings?.movies?.title || "Unknown";
    films.set(
      title,
      (films.get(title) || 0) + (b.booking_seats[0]?.count || 0),
    );
  }
  const emails = {};
  for (const { status } of deliveries)
    emails[status] = (emails[status] || 0) + 1;
  return {
    today: period(1),
    week: period(7),
    month: period(30),
    activeMemberships: members,
    accounts,
    emails,
    daily,
    topFilms: [...films]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([title, tickets]) => ({ title, tickets })),
  };
}

/** Latest bookings, optionally filtered by reference or email. */
async function listBookings(query = "") {
  let request = supabase
    .from("bookings")
    .select(
      `reference, guest_email, total_pence, status, created_at,
       screenings ( starts_at, movies ( title ),
         auditoriums ( screen_number, experience_id, cinemas ( slug ) ) ),
       booking_seats ( seats ( row_label, seat_number ) ),
       ticket_deliveries ( status )`,
    )
    .order("created_at", { ascending: false })
    .limit(50);
  const term = query.trim().replace(/[%,()]/g, "");
  if (term)
    request = /^cg-/i.test(term)
      ? request.ilike("reference", `${term}%`)
      : request.ilike("guest_email", `%${term}%`);
  return (await request.then(must)).map((row) => {
    const delivery = Array.isArray(row.ticket_deliveries)
      ? row.ticket_deliveries[0]
      : row.ticket_deliveries;
    const starts = new Date(row.screenings.starts_at);
    return {
      reference: row.reference,
      email: row.guest_email,
      totalPence: row.total_pence,
      status: row.status,
      createdAt: row.created_at,
      film: row.screenings.movies?.title,
      cinema: row.screenings.auditoriums?.cinemas?.slug,
      screen: row.screenings.auditoriums?.screen_number,
      format: row.screenings.auditoriums?.experience_id,
      date: starts.toISOString().slice(0, 10),
      time: starts.toISOString().slice(11, 16),
      seats: row.booking_seats
        .map((s) => `${s.seats.row_label}${s.seats.seat_number}`)
        .sort(),
      emailStatus: delivery?.status || null,
    };
  });
}

module.exports = { overview, listBookings };
