import { createRequire } from "module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Booking, account and ticket routes against the in-memory store: no
// Supabase, Stripe or SMTP, so nothing leaves the process.
const require = createRequire(import.meta.url);
// Blank rather than delete: the app loads .env with dotenv, which would
// refill deleted keys and point this test at real services.
for (const key of [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "SMTP_USER",
  "SMTP_PASS",
])
  process.env[key] = "";
const app = require("../index.js");
const memoryStore = require("../../services/cinemaStore");

let server, baseUrl;
beforeAll(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => server.close());

const call = async (path, { method = "GET", body, headers } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};
const adult = {
  rating: "PG",
  ageBand: "18-plus",
  declared: true,
  policyVersion: "uk-2026-1",
};
let filmId = 1;
const screeningFor = (rating = "PG", date = "2030-01-01") =>
  memoryStore.buildScreenings(
    [{ id: filmId++, title: "Test Feature", rating }],
    { date },
  )[0];
const freeSeat = (screening) =>
  memoryStore.getSeats(screening.id).find((s) => s.available);
const reserve = (screening, seatIds, ageConfirmation = adult) =>
  call("/api/reservations", {
    method: "POST",
    body: { screeningId: screening.id, seatIds, ageConfirmation },
  });

describe("screenings", () => {
  it("rejects dates outside the booking window", async () => {
    const res = await call("/api/screenings?date=2000-01-01");
    expect(res.status).toBe(400);
  });
  it("returns 404 for an unknown screening and its seats", async () => {
    expect((await call("/api/screenings/nope")).status).toBe(404);
    expect((await call("/api/screenings/nope/seats")).status).toBe(404);
  });
});

describe("reservations", () => {
  it("holds a free seat and marks it unavailable", async () => {
    const screening = screeningFor();
    const seat = freeSeat(screening);
    const res = await reserve(screening, [seat.id]);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("held");
    const seats = await call(`/api/screenings/${screening.id}/seats`);
    expect(seats.body.seats.find((s) => s.id === seat.id).available).toBe(
      false,
    );
  });
  it("never double-books a seat", async () => {
    const screening = screeningFor();
    const seat = freeSeat(screening);
    expect((await reserve(screening, [seat.id])).status).toBe(201);
    const second = await reserve(screening, [seat.id]);
    expect(second.status).toBe(409);
  });
  it("rejects duplicate seats and malformed requests", async () => {
    const screening = screeningFor();
    const seat = freeSeat(screening);
    expect((await reserve(screening, [seat.id, seat.id])).status).toBe(400);
    expect((await reserve(screening, [])).status).toBe(400);
    const noAge = await call("/api/reservations", {
      method: "POST",
      body: { screeningId: screening.id, seatIds: [seat.id] },
    });
    expect(noAge.status).toBe(400);
  });
  it("enforces the film's age rating", async () => {
    const screening = screeningFor("18");
    const res = await reserve(screening, [freeSeat(screening).id], {
      ...adult,
      rating: "18",
      ageBand: "15-17",
    });
    expect(res.status).toBe(403);
  });
  it("refuses screenings that have already started", async () => {
    const screening = screeningFor("PG", "2020-01-01");
    const res = await reserve(screening, [freeSeat(screening).id]);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SCREENING_STARTED");
  });
});

describe("checkout", () => {
  it("won't confirm a free booking for a signed-out user", async () => {
    const screening = screeningFor();
    const hold = await reserve(screening, [freeSeat(screening).id]);
    const res = await call(`/api/reservations/${hold.body.id}/confirm-free`, {
      method: "POST",
      body: { email: "guest@example.com" },
    });
    expect(res.status).toBe(402);
  });
  it("validates card checkout before talking to Stripe", async () => {
    const res = await call("/api/bookings/confirm", {
      method: "POST",
      body: { reservationId: "not-a-uuid", email: "x", paymentIntentId: "" },
    });
    expect(res.status).toBe(400);
  });
});

describe("bookings and tickets", () => {
  const book = () => {
    const screening = screeningFor();
    const reservation = memoryStore.reserve({
      screeningId: screening.id,
      seatIds: [freeSeat(screening).id],
      ageConfirmation: adult,
    });
    return memoryStore.confirm({
      reservationId: reservation.id,
      email: "owner@example.com",
      payment: {
        reference: "pi_test",
        brand: "visa",
        last4: "4242",
        status: "paid",
      },
    });
  };
  it("looks up a booking without exposing email or payment details", async () => {
    const booking = book();
    const res = await call(`/api/bookings/${booking.reference}`);
    expect(res.status).toBe(200);
    expect(res.body.reference).toBe(booking.reference);
    expect(res.body).not.toHaveProperty("email");
    expect(res.body).not.toHaveProperty("payment");
    expect(res.body).not.toHaveProperty("userId");
  });
  it("resends a ticket to the booking's own email", async () => {
    const booking = book();
    const res = await call(`/api/tickets/${booking.reference}/resend`, {
      method: "POST",
      body: {},
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("preview");
  });
  it("sends a just-made booking to any address", async () => {
    const booking = book();
    const res = await call(`/api/tickets/${booking.reference}/resend`, {
      method: "POST",
      body: { to: "friend@example.com" },
    });
    expect(res.status).toBe(200);
  });
  it("won't send an older booking to another address without the signed-in owner", async () => {
    const booking = book();
    booking.createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const res = await call(`/api/tickets/${booking.reference}/resend`, {
      method: "POST",
      body: { to: "someone-else@example.com" },
    });
    expect(res.status).toBe(403);
  });
});

describe("accounts", () => {
  it("are unavailable without Supabase", async () => {
    expect((await call("/api/account/profile")).status).toBe(503);
    expect((await call("/api/account", { method: "DELETE" })).status).toBe(503);
  });
  it("keeps the admin area closed without Supabase", async () => {
    expect((await call("/api/admin/overview")).status).toBe(503);
  });
  it("only treats app_metadata or ADMIN_EMAILS as admin", () => {
    const { isAdmin } = require("../../services/auth");
    expect(isAdmin({ email: "a@x.com", app_metadata: { role: "admin" } })).toBe(
      true,
    );
    expect(
      isAdmin({ email: "a@x.com", user_metadata: { role: "admin" } }),
    ).toBe(false);
    process.env.ADMIN_EMAILS = "Boss@Cinego.test, other@x.com";
    expect(isAdmin({ email: "boss@cinego.test" })).toBe(true);
    expect(isAdmin({ email: "guest@x.com" })).toBe(false);
    process.env.ADMIN_EMAILS = "";
  });
  it("answers unknown API paths in JSON", async () => {
    const res = await call("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Not found");
  });
});
