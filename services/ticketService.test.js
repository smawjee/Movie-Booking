import { describe, expect, it } from "vitest";
import tickets from "./ticketService";

const booking = {
  reference: "CG-TEST1234",
  screening: {
    movieTitle: "The Test Feature",
    date: "2026-09-11",
    time: "20:00",
    cinema: "Edinburgh",
    screen: 4,
    experience: { name: "IMAX" },
  },
  seats: [{ row: "G", number: 7 }],
  totalPence: 1599,
};

describe("signed Cinego tickets", () => {
  it("generates a verifiable QR token", async () => {
    const data = await tickets.ticketData(booking);
    expect(data.qrDataUrl.startsWith("data:image/png")).toBe(true);
    expect(tickets.verifyToken(data.token).reference).toBe(booking.reference);
  });

  it("rejects a tampered token", async () => {
    const data = await tickets.ticketData(booking);
    expect(tickets.verifyToken(`${data.token}x`)).toBeNull();
  });

  it("renders a PDF ticket", async () => {
    const document = await tickets.pdf(booking);
    expect(document.subarray(0, 4).toString()).toBe("%PDF");
    expect(document.length).toBeGreaterThan(5000);
  });
});
