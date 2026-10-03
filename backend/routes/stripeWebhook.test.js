import { createRequire } from "module";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Load everything through Node's own require cache so the test and the app
// share one Stripe client (and one in-memory store) instance.
const require = createRequire(import.meta.url);
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const app = require("../index.js");
const { stripe } = require("../../services/stripeClient");
const memoryStore = require("../../services/cinemaStore");

let server, baseUrl, reservation, intent;

beforeAll(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  stripe.paymentIntents.retrieve = async (id) => {
    if (id !== intent.id) throw new Error(`unexpected intent ${id}`);
    return intent;
  };
});
afterAll(() => server.close());

beforeEach(() => {
  const [screening] = memoryStore.buildScreenings(
    [{ id: 1, title: "Test Feature", rating: "PG" }],
    { date: "2030-01-01" },
  );
  const seat = memoryStore.getSeats(screening.id).find((s) => s.available);
  reservation = memoryStore.reserve({
    screeningId: screening.id,
    seatIds: [seat.id],
    ageConfirmation: { ageBand: "18-plus", declared: true },
  });
  intent = {
    id: `pi_test_${reservation.id}`,
    status: "succeeded",
    amount_received: seat.pricePence,
    created: Math.floor(Date.now() / 1000),
    latest_charge: {
      payment_method_details: { card: { brand: "visa", last4: "4242" } },
    },
    metadata: {
      reservationId: reservation.id,
      email: "guest@example.com",
      kind: "booking",
      promoCode: "",
      discountPercent: "0",
    },
  };
});

function event(type, object, secret = process.env.STRIPE_WEBHOOK_SECRET) {
  const payload = JSON.stringify({ id: "evt_test", type, data: { object } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return fetch(`${baseUrl}/api/stripe/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": header },
    body: payload,
  });
}

const bookingsFor = (id) =>
  [...memoryStore.bookings.values()].filter(
    (b) => b.payment.stripePaymentIntentId === id,
  );

describe("Stripe webhook", () => {
  it("rejects a payload signed with the wrong secret", async () => {
    const res = await event("payment_intent.succeeded", intent, "whsec_wrong");
    expect(res.status).toBe(400);
    expect(bookingsFor(intent.id)).toHaveLength(0);
  });

  it("rejects a request with no signature", async () => {
    const res = await fetch(`${baseUrl}/api/stripe/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  it("confirms the booking on payment_intent.succeeded", async () => {
    const res = await event("payment_intent.succeeded", intent);
    expect(res.status).toBe(200);
    const body = await res.json();
    const [booking] = bookingsFor(intent.id);
    expect(body.reference).toBe(booking.reference);
    expect(booking.email).toBe("guest@example.com");
    expect(booking.payment.last4).toBe("4242");
  });

  it("is idempotent across webhook retries and the browser confirm", async () => {
    const first = await (
      await event("payment_intent.succeeded", intent)
    ).json();
    const retry = await (
      await event("payment_intent.succeeded", intent)
    ).json();
    const browser = await fetch(`${baseUrl}/api/bookings/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reservationId: reservation.id,
        email: "guest@example.com",
        paymentIntentId: intent.id,
      }),
    });
    expect(browser.status).toBe(201);
    expect(retry.reference).toBe(first.reference);
    expect((await browser.json()).reference).toBe(first.reference);
    expect(bookingsFor(intent.id)).toHaveLength(1);
  });

  it("ignores membership payments and other event types", async () => {
    const membership = { ...intent, metadata: { kind: "membership" } };
    expect(
      await (await event("payment_intent.succeeded", membership)).json(),
    ).toMatchObject({ ignored: "not-a-booking" });
    expect(
      await (await event("payment_intent.created", intent)).json(),
    ).toMatchObject({ ignored: "payment_intent.created" });
    expect(bookingsFor(intent.id)).toHaveLength(0);
  });

  it("acknowledges (does not retry) when the seat hold has expired", async () => {
    reservation.status = "expired";
    const res = await event("payment_intent.succeeded", intent);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ error: "reservation-expired" });
  });
});
