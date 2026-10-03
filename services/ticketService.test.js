import { afterEach, describe, expect, it, vi } from "vitest";
import tickets from "./ticketService";
import { createRequire } from "node:module";
const nodemailer = createRequire(import.meta.url)("nodemailer");
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

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

describe("ticket delivery", () => {
  it("reports preview rather than sent without SMTP", async () => {
    vi.stubEnv("SMTP_USER", "");
    vi.stubEnv("SMTP_PASS", "");
    const result = await tickets.deliver(booking);
    expect(result.status).toBe("preview");
    expect(tickets.getPreview(result.previewUrl.split("/").pop())).toContain(
      booking.reference,
    );
  });
  it("attaches a PDF and inline QR to the booking recipient", async () => {
    vi.stubEnv("SMTP_USER", "sender@example.test");
    vi.stubEnv("SMTP_PASS", "test");
    const sendMail = vi
      .fn()
      .mockResolvedValue({
        accepted: ["guest@example.test"],
        rejected: [],
        messageId: "test",
      });
    vi.spyOn(nodemailer, "createTransport").mockReturnValue({ sendMail });
    expect(
      (await tickets.deliver({ ...booking, email: "guest@example.test" }))
        .status,
    ).toBe("sent");
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe("guest@example.test");
    expect(mail.html).toContain("cid:cinego-ticket-qr");
    expect(mail.attachments[0].content.subarray(0, 4).toString()).toBe("%PDF");
    expect(mail.attachments[1].cid).toBe("cinego-ticket-qr");
  });
  it("does not report success when SMTP rejects the recipient", async () => {
    vi.stubEnv("SMTP_USER", "sender@example.test");
    vi.stubEnv("SMTP_PASS", "test");
    vi.spyOn(nodemailer, "createTransport").mockReturnValue({
      sendMail: vi
        .fn()
        .mockResolvedValue({ accepted: [], rejected: ["guest@example.test"] }),
    });
    await expect(
      tickets.deliver({ ...booking, email: "guest@example.test" }),
    ).rejects.toThrow("did not accept");
  });
  it("renders long titles and twelve seats", async () => {
    const result = await tickets.pdf({
      ...booking,
      screening: {
        ...booking.screening,
        movieTitle: "A Very Long Feature Title ".repeat(8),
      },
      seats: Array.from({ length: 12 }, (_, i) => ({
        row: "H",
        number: i + 1,
      })),
    });
    expect(result.subarray(0, 4).toString()).toBe("%PDF");
  });
});
