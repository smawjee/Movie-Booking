const crypto = require("crypto");
const nodemailer = require("nodemailer");
const QRCode = require("qrcode");
const PDFDocument = require("pdfkit");

const previews = new Map();
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;" })[character],
  );
const signingSecret = () =>
  process.env.TICKET_SIGNING_SECRET || "cinego-development-only";

function token(booking) {
  const payload = Buffer.from(
    JSON.stringify({
      reference: booking.reference,
      exp: Date.now() + 180 * 86400000,
    }),
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", signingSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function verifyToken(value) {
  try {
    const [payload, signature] = String(value).split(".");
    const expected = crypto
      .createHmac("sha256", signingSecret())
      .update(payload)
      .digest("base64url");
    if (
      !signature ||
      signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      return null;
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    return decoded.exp > Date.now() ? decoded : null;
  } catch {
    return null;
  }
}

async function ticketData(booking) {
  const entryToken = token(booking);
  return {
    token: entryToken,
    qrDataUrl: await QRCode.toDataURL(entryToken, { width: 320, margin: 1 }),
  };
}

async function pdf(booking) {
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise((resolve) =>
    doc.on("end", () => resolve(Buffer.concat(chunks))),
  );
  const qr = await QRCode.toBuffer(token(booking), { width: 220, margin: 1 });
  doc.rect(0, 0, 595, 145).fill("#0b0c10");
  doc.fontSize(18).fillColor("#f5bd27").text("CINEGO", 48, 46);
  doc.fontSize(9).fillColor("#b7b8bd").text("DIGITAL CINEMA TICKET", 48, 75);
  doc
    .fillColor("#111")
    .fontSize(28)
    .text(booking.screening.movieTitle, 48, 175);
  doc
    .fontSize(11)
    .fillColor("#777")
    .text(`BOOKING ${booking.reference}`)
    .moveDown();
  doc.fontSize(13).fillColor("#111");
  doc.text(`${booking.screening.date} at ${booking.screening.time}`);
  doc.text(
    `Cinego ${booking.screening.cinema} · Screen ${booking.screening.screen}`,
  );
  doc.text(booking.screening.experience.name);
  doc.text(
    `Seats ${booking.seats.map((seat) => `${seat.row}${seat.number}`).join(", ")}`,
  );
  doc.text(`Paid £${(booking.totalPence / 100).toFixed(2)}`).moveDown();
  doc.image(qr, 48, 360, { width: 155 });
  doc.fontSize(10).text("Scan at the auditorium entrance", 48, 525);
  doc
    .fillColor("#666")
    .text(
      "Photo ID may be requested for age-restricted films. Please arrive 15 minutes early.",
      48,
      555,
      { width: 430 },
    );
  doc.end();
  return done;
}

async function html(booking) {
  const { qrDataUrl } = await ticketData(booking);
  const seats = booking.seats
    .map((seat) => `${seat.row}${seat.number}`)
    .join(", ");
  return `<!doctype html><html><body style="margin:0;background:#090a0d;color:#f7f7f5;font-family:Arial,sans-serif"><div style="max-width:620px;margin:auto;padding:32px"><h1 style="color:#f5bd27;letter-spacing:2px">CINEGO</h1><p style="color:#aaa">BOOKING CONFIRMED · ${escapeHtml(booking.reference)}</p><h2 style="font-size:30px">${escapeHtml(booking.screening.movieTitle)}</h2><div style="background:#191c22;padding:24px;border:1px solid #343740;border-radius:16px"><p><b>${escapeHtml(booking.screening.date)} at ${escapeHtml(booking.screening.time)}</b></p><p>Cinego ${escapeHtml(booking.screening.cinema)} · Screen ${escapeHtml(booking.screening.screen)}</p><p>${escapeHtml(booking.screening.experience.name)}</p><p>Seats: ${escapeHtml(seats)}</p><p>Total: £${(booking.totalPence / 100).toFixed(2)}</p><div style="background:#fff;padding:12px;width:180px;border-radius:12px"><img src="${qrDataUrl}" width="180" alt="Ticket QR code"></div><p style="color:#aaa">Show this QR code at the entrance. Photo ID may be requested. Please arrive 15 minutes early.</p></div></div></body></html>`;
}

function transporter() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function deliver(booking) {
  const content = await html(booking);
  const attachment = await pdf(booking);
  const mail = transporter();
  if (!mail) {
    const id = crypto.randomUUID();
    previews.set(id, { html: content, expires: Date.now() + 30 * 60000 });
    return { status: "preview", previewUrl: `/api/ticket-previews/${id}` };
  }
  const result = await mail.sendMail({
    from: process.env.TICKET_FROM_EMAIL || process.env.SMTP_USER,
    to: booking.email,
    subject: `Your Cinego ticket: ${booking.screening.movieTitle}`,
    html: content,
    attachments: [
      { filename: `${booking.reference}.pdf`, content: attachment },
    ],
  });
  return { status: "sent", providerReference: result.messageId };
}

function getPreview(id) {
  const item = previews.get(id);
  if (!item || item.expires < Date.now()) {
    previews.delete(id);
    return null;
  }
  return item.html;
}

module.exports = { deliver, getPreview, pdf, ticketData, verifyToken };
