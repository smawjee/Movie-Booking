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

const cinemaNames = {
  edinburgh: "Cinego Edinburgh",
  glasgow: "Cinego Glasgow",
  london: "Cinego London West End",
};
const prettyDate = (iso) => {
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(date.valueOf())
    ? String(iso)
    : date.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
};

// One A4 page per seat: each guest can be scanned in separately, and the
// shared booking QR on every page still resolves the whole booking.
async function pdf(booking) {
  const { screening, seats = [] } = booking;
  const qr = await QRCode.toBuffer(token(booking), { width: 440, margin: 2 });
  const doc = new PDFDocument({
    size: "A4",
    margin: 0,
    autoFirstPage: false,
    info: {
      Title: `Cinego ticket ${booking.reference}`,
      Author: "Cinego",
      Subject: screening.movieTitle,
    },
  });
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const W = 595.28;
  const M = 48;
  const inner = W - M * 2;
  const pages = seats.length ? seats : [null];
  pages.forEach((seat, index) => {
    doc.addPage();
    // Header band
    doc.rect(0, 0, W, 132).fill("#0b0b0d");
    doc.font("Helvetica-Bold").fontSize(22).fillColor("#f5c948");
    doc.text("CINEGO", M, 44, { characterSpacing: 3 });
    doc.font("Helvetica").fontSize(9).fillColor("#a1a1a6");
    doc.text("ADMIT ONE  ·  DIGITAL CINEMA TICKET", M, 76, {
      characterSpacing: 1,
    });
    doc.text(
      pages.length > 1 ? `TICKET ${index + 1} OF ${pages.length}` : "",
      M,
      76,
      { width: inner, align: "right", characterSpacing: 1 },
    );

    // Film title, wraps within the content width
    doc.font("Helvetica-Bold").fontSize(26).fillColor("#111111");
    doc.text(screening.movieTitle, M, 166, { width: inner, lineGap: 2 });
    const badgeY = doc.y + 10;
    doc.roundedRect(M, badgeY, 44, 22, 4).fill("#111111");
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#ffffff");
    doc.text(screening.rating || "NR", M, badgeY + 6, {
      width: 44,
      align: "center",
    });
    doc.font("Helvetica").fontSize(10).fillColor("#555555");
    doc.text(screening.experience?.name || "Standard", M + 56, badgeY + 6);

    // Detail grid
    const gridTop = badgeY + 48;
    const cell = (label, value, x, y, width) => {
      doc.font("Helvetica").fontSize(8).fillColor("#888888");
      doc.text(label.toUpperCase(), x, y, { width, characterSpacing: 1 });
      doc.font("Helvetica-Bold").fontSize(14).fillColor("#111111");
      doc.text(value, x, y + 14, { width });
    };
    const col = inner / 2;
    cell("Date", prettyDate(screening.date), M, gridTop, col - 12);
    cell("Time", screening.time, M + col, gridTop, col);
    cell(
      "Cinema",
      cinemaNames[screening.cinema] || `Cinego ${screening.cinema}`,
      M,
      gridTop + 56,
      col - 12,
    );
    cell("Screen", String(screening.screen), M + col, gridTop + 56, col);
    cell(
      seat ? "Seat" : "Seats",
      seat
        ? `${seat.row}${seat.number}${seat.tier === "premium" ? "  (Premium)" : ""}`
        : "See booking",
      M,
      gridTop + 112,
      col - 12,
    );
    cell("Booking reference", booking.reference, M + col, gridTop + 112, col);

    // Perforation + QR panel
    const stubTop = gridTop + 190;
    doc
      .moveTo(M, stubTop)
      .lineTo(W - M, stubTop)
      .dash(4, { space: 4 })
      .strokeColor("#cccccc")
      .stroke()
      .undash();
    const qrSize = 170;
    doc.roundedRect(M, stubTop + 28, qrSize + 24, qrSize + 24, 10).fill("#f4f4f5");
    doc.image(qr, M + 12, stubTop + 40, { width: qrSize });
    const textX = M + qrSize + 48;
    const textW = W - M - textX;
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#111111");
    doc.text("Scan at the auditorium entrance", textX, stubTop + 40, {
      width: textW,
    });
    doc.font("Helvetica").fontSize(10).fillColor("#555555");
    doc.text(
      `Doors open 20 minutes before the film. Please arrive at least 15 minutes early.\n\n` +
        (["15", "18"].includes(screening.rating)
          ? `This film is rated ${screening.rating}. Every guest must be ${screening.rating} or over; photo ID will be checked.\n\n`
          : screening.rating === "12A"
            ? "Under-12s must be accompanied by an adult.\n\n"
            : "") +
        `Total paid for this booking: £${(booking.totalPence / 100).toFixed(2)}`,
      textX,
      stubTop + 64,
      { width: textW, lineGap: 2 },
    );

    // Footer
    doc.font("Helvetica").fontSize(8).fillColor("#999999");
    doc.text(
      "Tickets are non-transferable and valid only for the screening shown. cinego · portfolio demonstration project",
      M,
      800,
      { width: inner, align: "center" },
    );
  });
  doc.end();
  return done;
}

async function html(booking, inlineQr = false) {
  const { qrDataUrl } = await ticketData(booking);
  const seats = booking.seats
    .map((seat) => `${seat.row}${seat.number}`)
    .join(", ");
  return `<!doctype html><html><body style="margin:0;background:#090a0d;color:#f7f7f5;font-family:Arial,sans-serif"><div style="max-width:620px;margin:auto;padding:32px"><h1 style="color:#f5bd27;letter-spacing:2px">CINEGO</h1><p style="color:#aaa">BOOKING CONFIRMED · ${escapeHtml(booking.reference)}</p><h2 style="font-size:30px">${escapeHtml(booking.screening.movieTitle)}</h2><div style="background:#191c22;padding:24px;border:1px solid #343740;border-radius:16px"><p><b>${escapeHtml(booking.screening.date)} at ${escapeHtml(booking.screening.time)}</b></p><p>Cinego ${escapeHtml(booking.screening.cinema)} · Screen ${escapeHtml(booking.screening.screen)}</p><p>${escapeHtml(booking.screening.experience?.name || "Standard")}</p><p>Seats: ${escapeHtml(seats)}</p><p>Total: £${(booking.totalPence / 100).toFixed(2)}</p><div style="background:#fff;padding:12px;width:180px;border-radius:12px"><img src="${inlineQr ? "cid:cinego-ticket-qr" : qrDataUrl}" width="180" alt="Ticket QR code"></div><p style="color:#aaa">Show this QR code at the entrance. Photo ID may be requested. Please arrive 15 minutes early.</p></div></div></body></html>`;
}

function transporter() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE === "true"
      : Number(process.env.SMTP_PORT || 587) === 465,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function deliver(booking, to = booking.email) {
  const mail = transporter();
  const content = await html(booking, Boolean(mail));
  if (!mail) {
    const id = crypto.randomUUID();
    previews.set(id, { html: content, expires: Date.now() + 30 * 60000 });
    return { status: "preview", previewUrl: `/api/ticket-previews/${id}` };
  }
  // The QR in the email body is the ticket itself, so a PDF failure should
  // cost the attachment, not the whole email.
  const [attachment, qr] = await Promise.all([
    pdf(booking).catch((error) => {
      console.error("[ticket pdf attachment]", error.message);
      return null;
    }),
    QRCode.toBuffer(token(booking), { width: 320, margin: 4 }),
  ]);
  const result = await mail.sendMail({
    from: process.env.TICKET_FROM_EMAIL || process.env.SMTP_USER,
    to,
    subject: `Your Cinego ticket: ${booking.screening.movieTitle}`,
    html: content,
    text: `Your Cinego booking ${booking.reference}: ${booking.screening.movieTitle}, ${booking.screening.date} at ${booking.screening.time}. Seats: ${booking.seats.map((s) => `${s.row}${s.number}`).join(", ")}.${attachment ? " Your PDF ticket is attached." : ""}`,
    attachments: [
      ...(attachment
        ? [
            {
              filename: `${booking.reference}.pdf`,
              content: attachment,
              contentType: "application/pdf",
            },
          ]
        : []),
      {
        filename: "ticket-qr.png",
        content: qr,
        cid: "cinego-ticket-qr",
        contentType: "image/png",
      },
    ],
  });
  if (!result.accepted?.length || result.rejected?.length)
    throw new Error("Email provider did not accept the ticket recipient");
  return { status: "sent", providerReference: result.messageId };
}

// Plain transactional email (verification codes etc.). Without SMTP it
// returns a preview instead, like ticket delivery does.
async function sendMessage({ to, subject, text, html }) {
  const mail = transporter();
  if (!mail) {
    const id = crypto.randomUUID();
    previews.set(id, { html, expires: Date.now() + 30 * 60000 });
    return { status: "preview", previewUrl: `/api/ticket-previews/${id}` };
  }
  const result = await mail.sendMail({
    from: process.env.TICKET_FROM_EMAIL || process.env.SMTP_USER,
    to,
    subject,
    text,
    html,
  });
  if (!result.accepted?.length || result.rejected?.length)
    throw new Error("Email provider did not accept the recipient");
  return { status: "sent" };
}

function getPreview(id) {
  const item = previews.get(id);
  if (!item || item.expires < Date.now()) {
    previews.delete(id);
    return null;
  }
  return item.html;
}

module.exports = {
  deliver,
  sendMessage,
  getPreview,
  pdf,
  ticketData,
  verifyToken,
  escapeHtml,
};
