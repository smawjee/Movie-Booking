import { describe, expect, it } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { priceTickets } = require("./pricing");

const seats = (n, pricePence = 1000, tier = "standard") =>
  Array.from({ length: n }, () => ({ pricePence, tier }));
const wednesday = "2026-09-30";
const tuesday = "2026-09-29";

describe("ticket pricing", () => {
  it("charges full price with no discounts", () => {
    const p = priceTickets({ seats: seats(2), date: wednesday, experienceId: "imax" });
    expect(p).toMatchObject({ fullPence: 2000, amountPence: 2000, source: "none" });
  });
  it("picks the best single percentage discount, never stacking", () => {
    const p = priceTickets({
      seats: seats(2),
      date: wednesday,
      experienceId: "imax",
      promo: { code: "WELCOME10", discountPercent: 10 },
      membership: { plan: "gold", discountPercent: 10 },
      student: true,
    });
    expect(p.source).toBe("student");
    expect(p.amountPence).toBe(1500);
  });
  it("applies membership discounts to tickets", () => {
    const p = priceTickets({
      seats: seats(1),
      date: wednesday,
      experienceId: "imax",
      membership: { plan: "platinum", discountPercent: 15 },
    });
    expect(p.amountPence).toBe(850);
  });
  it("gives student members £3 tickets on Tuesdays", () => {
    const p = priceTickets({
      seats: seats(2),
      date: tuesday,
      experienceId: "imax",
      membership: { plan: "student", discountPercent: 25 },
      student: true,
    });
    expect(p.amountPence).toBe(600);
  });
  it("makes one standard ticket free once a month", () => {
    const p = priceTickets({
      seats: seats(2),
      date: wednesday,
      experienceId: "standard",
      membership: { plan: "student", discountPercent: 25 },
      student: true,
      freeTicketAvailable: true,
    });
    expect(p.usesFreeTicket).toBe(true);
    expect(p.amountPence).toBe(750);
  });
  it("marks a single free ticket as a free checkout", () => {
    const p = priceTickets({
      seats: seats(1),
      date: wednesday,
      experienceId: "standard",
      membership: { plan: "student", discountPercent: 25 },
      freeTicketAvailable: true,
    });
    expect(p).toMatchObject({ amountPence: 0, free: true });
  });
  it("waives the 3D surcharge for student members", () => {
    const p = priceTickets({
      seats: seats(1, 1099),
      date: wednesday,
      experienceId: "3d",
      membership: { plan: "student", discountPercent: 25 },
    });
    expect(p.amountPence).toBe(824 - 150);
    expect(p.labels).toContain("Free 3D upgrade");
  });
});
