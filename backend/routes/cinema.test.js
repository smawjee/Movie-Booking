import { createRequire } from "module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const express = require("express");
const { loadWith, fakeSupabase } = require("../../test/helpers");

const movies = [{ id: 7, title: "Test Feature", rating: "12A" }];
const age = {
  rating: "12A",
  ageBand: "18-plus",
  declared: true,
  policyVersion: "uk-2026-1",
};

let server, baseUrl, stripe, intents, user;
async function start({ supabase = null } = {}) {
  const router = loadWith("backend/routes/cinema", {
    "services/stripeClient": { stripe, stripeConfigured: true },
    "services/supabaseClient": {
      supabase: supabase?.client || null,
      supabaseConfigured: Boolean(supabase),
    },
    "services/tmdbService": {
      getNowPlaying: async () => movies,
      getUpcoming: async () => movies,
    },
    "services/auth": { getAuthedUser: async () => user },
  });
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
}
async function api(path, body) {
  const res = await fetch(baseUrl + path, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  intents = new Map();
  user = null;
  stripe = {
    paymentIntents: {
      create: vi.fn(async (params) => {
        const intent = {
          id: `pi_${intents.size + 1}`,
          client_secret: `secret_${intents.size + 1}`,
          status: "requires_payment_method",
          created: 1790000000,
          ...params,
        };
        intents.set(intent.id, intent);
        return intent;
      }),
      retrieve: vi.fn(async (id) => intents.get(id)),
    },
  };
});
afterEach(() => new Promise((resolve) => server.close(resolve)));

// Simulates the customer completing card entry in Stripe Elements.
function pay(intentId) {
  Object.assign(intents.get(intentId), {
    status: "succeeded",
    amount_received: intents.get(intentId).amount,
    latest_charge: {
      payment_method_details: { card: { brand: "visa", last4: "4242" } },
    },
  });
}

describe("booking checkout (in-memory store)", () => {
  beforeEach(() => start());

  async function holdSeat() {
    const screenings = await api("/screenings?date=2026-10-01");
    const screening = screenings.body[0];
    const seats = await api(`/screenings/${screening.id}/seats`);
    const seat = seats.body.seats.find((s) => s.available);
    const reservation = await api("/reservations", {
      screeningId: screening.id,
      seatIds: [seat.id],
      ageConfirmation: age,
    });
    expect(reservation.status).toBe(201);
    return { screening, seat, reservation: reservation.body };
  }

  it("books a seat end to end and serves the public booking", async () => {
    const { screening, seat, reservation } = await holdSeat();
    const intent = await api(`/reservations/${reservation.id}/payment-intent`, {
      email: "fan@example.com",
    });
    expect(intent.status).toBe(201);
    expect(intent.body.amountPence).toBe(seat.pricePence);

    pay("pi_1");
    const booking = await api("/bookings/confirm", {
      reservationId: reservation.id,
      email: "fan@example.com",
      paymentIntentId: "pi_1",
    });
    expect(booking.status).toBe(201);
    expect(booking.body.totalPence).toBe(seat.pricePence);
    expect(booking.body.payment).toMatchObject({
      brand: "visa",
      last4: "4242",
    });

    const lookup = await api(`/bookings/${booking.body.reference}`);
    expect(lookup.status).toBe(200);
    expect(lookup.body.screening.id).toBe(screening.id);
    expect(lookup.body).not.toHaveProperty("email");

    const seatsAfter = await api(`/screenings/${screening.id}/seats`);
    expect(seatsAfter.body.seats.find((s) => s.id === seat.id).available).toBe(
      false,
    );
  });

  it("will not confirm before Stripe reports the payment succeeded", async () => {
    const { reservation } = await holdSeat();
    await api(`/reservations/${reservation.id}/payment-intent`, {
      email: "fan@example.com",
    });
    const res = await api("/bookings/confirm", {
      reservationId: reservation.id,
      email: "fan@example.com",
      paymentIntentId: "pi_1",
    });
    expect(res.status).toBe(402);
  });

  it("will not confirm a reservation with another reservation's payment", async () => {
    const first = await holdSeat();
    const second = await holdSeat();
    await api(`/reservations/${first.reservation.id}/payment-intent`, {
      email: "fan@example.com",
    });
    pay("pi_1");
    const res = await api("/bookings/confirm", {
      reservationId: second.reservation.id,
      email: "fan@example.com",
      paymentIntentId: "pi_1",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not match/);
  });

  it("rejects malformed reservations and promo codes without Supabase", async () => {
    expect((await api("/reservations", { seatIds: [] })).status).toBe(400);
    const { reservation } = await holdSeat();
    const promo = await api(`/reservations/${reservation.id}/payment-intent`, {
      email: "fan@example.com",
      promoCode: "SAVE10",
    });
    expect(promo.status).toBe(400);
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("reports memberships as unavailable without Supabase", async () => {
    expect((await api("/memberships/plans")).body.map((p) => p.id)).toEqual([
      "silver",
      "gold",
      "platinum",
    ]);
    const res = await api("/memberships/payment-intent", { plan: "gold" });
    expect(res.status).toBe(503);
  });
});

describe("membership checkout routes", () => {
  let db;
  beforeEach(() => {
    db = fakeSupabase((q) =>
      q.table === "memberships" && q.op === "insert"
        ? {
            data: {
              id: "m-1",
              plan_id: "gold",
              status: "active",
              renews_at: "2026-10-26T00:00:00Z",
              created_at: "2026-09-26T00:00:00Z",
            },
            error: null,
          }
        : { data: null, error: null },
    );
    return start({ supabase: db });
  });

  it("requires a signed-in user", async () => {
    const res = await api("/memberships/payment-intent", { plan: "gold" });
    expect(res.status).toBe(401);
  });

  it("activates a paid membership for the paying account", async () => {
    user = { id: "user-1", email: "fan@example.com" };
    const intent = await api("/memberships/payment-intent", { plan: "gold" });
    expect(intent.status).toBe(201);
    expect(intent.body.amountPence).toBe(899);

    pay("pi_1");
    const res = await api("/memberships/checkout", {
      plan: "gold",
      paymentIntentId: "pi_1",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: "m-1", plan: "gold" });
  });

  it("rejects a payment made for a different plan or account", async () => {
    user = { id: "user-1", email: "fan@example.com" };
    await api("/memberships/payment-intent", { plan: "silver" });
    pay("pi_1");
    const wrongPlan = await api("/memberships/checkout", {
      plan: "platinum",
      paymentIntentId: "pi_1",
    });
    expect(wrongPlan.status).toBe(400);

    user = { id: "someone-else", email: "other@example.com" };
    const wrongUser = await api("/memberships/checkout", {
      plan: "silver",
      paymentIntentId: "pi_1",
    });
    expect(wrongUser.status).toBe(400);
    expect(db.queries.filter((q) => q.op === "insert")).toHaveLength(0);
  });
});
