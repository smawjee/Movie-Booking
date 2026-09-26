import { createRequire } from "module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { loadWith } = require("../test/helpers");

const movies = [
  { id: 1, title: "Family Film", rating: "PG", poster_path: "/a.jpg" },
  { id: 2, title: "Late Thriller", rating: "18", poster_path: "/b.jpg" },
];
const adult = {
  rating: "18",
  ageBand: "18-plus",
  declared: true,
  policyVersion: "uk-2026-1",
};

let store, stripe;
beforeEach(() => {
  stripe = {
    paymentIntents: {
      create: vi.fn(async (params) => ({
        id: "pi_test",
        client_secret: "pi_test_secret",
        ...params,
      })),
    },
  };
  store = loadWith("services/cinemaStore", {
    "services/stripeClient": { stripe, stripeConfigured: true },
  });
});
afterEach(() => vi.useRealTimers());

const screeningFor = (movieId, experienceId) =>
  store
    .buildScreenings(movies, { date: "2026-10-01" })
    .find((s) => s.movieId === movieId && s.experience.id === experienceId);
const freeSeats = (screeningId, count, tier = "standard") =>
  store
    .getSeats(screeningId)
    .filter((s) => s.available && s.tier === tier)
    .slice(0, count)
    .map((s) => s.id);

describe("buildScreenings", () => {
  it("creates four showtimes per film priced at base plus surcharge", () => {
    const screenings = store.buildScreenings(movies, { date: "2026-10-01" });
    expect(screenings).toHaveLength(8);
    for (const s of screenings)
      expect(s.pricePence).toBe(899 + s.experience.surchargePence);
    expect(screenings.map((s) => s.time).slice(0, 4)).toEqual([
      "11:00",
      "14:30",
      "17:00",
      "20:30",
    ]);
  });

  it("filters by format and gives stable ids", () => {
    const imax = store.buildScreenings(movies, {
      date: "2026-10-01",
      format: "imax",
    });
    expect(imax.length).toBeGreaterThan(0);
    expect(imax.every((s) => s.experience.id === "imax")).toBe(true);
    const again = store.buildScreenings(movies, {
      date: "2026-10-01",
      format: "imax",
    });
    expect(again.map((s) => s.id)).toEqual(imax.map((s) => s.id));
  });
});

describe("getSeats", () => {
  it("returns null for an unknown screening", () => {
    expect(store.getSeats("nope")).toBeNull();
  });

  it("lays out 8x12 seats with the back two rows premium", () => {
    const screening = screeningFor(1, "standard");
    const seats = store.getSeats(screening.id);
    expect(seats).toHaveLength(96);
    const premium = seats.filter((s) => s.tier === "premium");
    expect(new Set(premium.map((s) => s.row))).toEqual(new Set(["G", "H"]));
    for (const s of premium)
      expect(s.pricePence).toBe(screening.pricePence + 250);
  });

  it("uses a smaller 6x8 layout for 4DX", () => {
    const screening = screeningFor(1, "4dx") || screeningFor(2, "4dx");
    expect(store.getSeats(screening.id)).toHaveLength(48);
  });
});

describe("reserve", () => {
  it("holds seats for ten minutes and hides them from other customers", () => {
    const screening = screeningFor(1, "standard");
    const seatIds = freeSeats(screening.id, 2);
    const reservation = store.reserve({
      screeningId: screening.id,
      seatIds,
      ageConfirmation: { ...adult, rating: "PG" },
    });
    expect(reservation.status).toBe("held");
    const holdMs = new Date(reservation.expiresAt) - Date.now();
    expect(holdMs).toBeGreaterThan(9 * 60000);
    expect(holdMs).toBeLessThanOrEqual(10 * 60000);
    const seats = store.getSeats(screening.id);
    for (const id of seatIds)
      expect(seats.find((s) => s.id === id).available).toBe(false);
  });

  it("rejects seats someone else is holding", () => {
    const screening = screeningFor(1, "standard");
    const seatIds = freeSeats(screening.id, 1);
    const request = {
      screeningId: screening.id,
      seatIds,
      ageConfirmation: { ...adult, rating: "PG" },
    };
    store.reserve(request);
    expect(() => store.reserve(request)).toThrow(
      expect.objectContaining({ status: 409 }),
    );
  });

  it("rejects an unknown screening with 404", () => {
    expect(() =>
      store.reserve({
        screeningId: "missing",
        seatIds: ["A1"],
        ageConfirmation: adult,
      }),
    ).toThrow(expect.objectContaining({ status: 404 }));
  });

  it.each([
    ["an under-18 band", { ...adult, ageBand: "15-17" }],
    ["an undeclared age", { ...adult, declared: false }],
  ])("blocks an 18-rated film for %s", (_, ageConfirmation) => {
    const screening = store
      .buildScreenings(movies, { date: "2026-10-01" })
      .find((s) => s.movieId === 2);
    expect(() =>
      store.reserve({
        screeningId: screening.id,
        seatIds: freeSeats(screening.id, 1),
        ageConfirmation,
      }),
    ).toThrow(expect.objectContaining({ status: 403 }));
  });
});

describe("payment intents and confirmation", () => {
  function holdTwoSeats() {
    const screening = screeningFor(1, "standard");
    const seatIds = [
      ...freeSeats(screening.id, 1, "standard"),
      ...freeSeats(screening.id, 1, "premium"),
    ];
    const reservation = store.reserve({
      screeningId: screening.id,
      seatIds,
      ageConfirmation: { ...adult, rating: "PG" },
    });
    // One standard seat (899) plus one premium seat (899 + 250).
    return { screening, seatIds, reservation, totalPence: 899 * 2 + 250 };
  }

  it("charges the server-side seat total, never a client amount", async () => {
    const { reservation, totalPence } = holdTwoSeats();
    const result = await store.createPaymentIntent(
      reservation.id,
      "fan@example.com",
    );
    expect(result).toEqual({
      clientSecret: "pi_test_secret",
      amountPence: totalPence,
      discountPence: 0,
    });
    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: totalPence,
        currency: "gbp",
        metadata: expect.objectContaining({
          reservationId: reservation.id,
          kind: "booking",
          discountPercent: "0",
        }),
      }),
    );
  });

  it("applies a promo discount rounded to the nearest penny", async () => {
    const { reservation, totalPence } = holdTwoSeats();
    const result = await store.createPaymentIntent(
      reservation.id,
      "fan@example.com",
      { code: "SAVE15", discountPercent: 15 },
    );
    const expected = Math.round((totalPence * 85) / 100);
    expect(result.amountPence).toBe(expected);
    expect(result.discountPence).toBe(totalPence - expected);
    expect(stripe.paymentIntents.create.mock.calls[0][0].metadata).toEqual(
      expect.objectContaining({ promoCode: "SAVE15", discountPercent: "15" }),
    );
  });

  it("refuses to charge for an expired reservation", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { reservation } = holdTwoSeats();
    vi.setSystemTime(Date.now() + 11 * 60000);
    await expect(
      store.createPaymentIntent(reservation.id, "fan@example.com"),
    ).rejects.toMatchObject({ status: 409 });
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("fails clearly when Stripe is not configured", async () => {
    store = loadWith("services/cinemaStore", {
      "services/stripeClient": { stripe: null, stripeConfigured: false },
    });
    const { reservation } = holdTwoSeats();
    await expect(
      store.createPaymentIntent(reservation.id, "fan@example.com"),
    ).rejects.toMatchObject({ status: 500 });
  });

  it("confirms a booking, books the seats and cannot be replayed", () => {
    const { screening, seatIds, reservation, totalPence } = holdTwoSeats();
    const booking = store.confirm({
      reservationId: reservation.id,
      email: "fan@example.com",
      payment: { reference: "pi_1", brand: "visa", last4: "4242" },
      discountPercent: 10,
      promoCode: "TEN",
    });
    const expected = Math.round((totalPence * 90) / 100);
    expect(booking.reference).toMatch(/^CG-[0-9A-F]{8}$/);
    expect(booking.totalPence).toBe(expected);
    expect(booking.payment).toMatchObject({
      amountPence: expected,
      discountPence: totalPence - expected,
      promoCode: "TEN",
    });
    expect(booking.seats.map((s) => s.id)).toEqual(seatIds);

    const seats = store.getSeats(screening.id);
    for (const id of seatIds)
      expect(seats.find((s) => s.id === id).available).toBe(false);
    expect(() =>
      store.confirm({
        reservationId: reservation.id,
        email: "fan@example.com",
        payment: {},
      }),
    ).toThrow(expect.objectContaining({ status: 409 }));
  });

  it("keeps email and payment details out of the public booking", async () => {
    const { reservation } = holdTwoSeats();
    const booking = store.confirm({
      reservationId: reservation.id,
      email: "fan@example.com",
      payment: { reference: "pi_1" },
    });
    const stored = await store.getBooking(booking.reference);
    const visible = store.publicBooking(stored);
    expect(visible.reference).toBe(booking.reference);
    expect(visible).not.toHaveProperty("email");
    expect(visible).not.toHaveProperty("payment");
    expect(await store.getBooking("CG-NOPE")).toBeNull();
  });
});
