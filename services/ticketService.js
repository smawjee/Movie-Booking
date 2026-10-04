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

// Brand marks from /cinego-logo.svg, drawn as vectors so the PDF needs no
// image assets.
const LOGO_TICKET =
  "M5 5h34a5 5 0 0 1 5 5v7a7 7 0 0 0 0 14v7a5 5 0 0 1-5 5H5a5 5 0 0 1-5-5v-7a7 7 0 0 0 0-14v-7a5 5 0 0 1 5-5Z";
const LOGO_PLAY = "M18 15 L32 24 L18 33 Z";
const GOLD = "#f5bd27";
const INK = "#111114";
const MUTED = "#6e6e73";
const HAIRLINE = "#e5e5ea";
const PAGE = "#f2f2f4";
const ratingColours = {
  U: ["#00a650", "#ffffff"],
  PG: ["#fbb800", INK],
  "12A": ["#f37021", "#ffffff"],
  12: ["#f37021", "#ffffff"],
  15: ["#e5007d", "#ffffff"],
  18: ["#dc0a0a", "#ffffff"],
};

function drawLogo(doc, x, y, height) {
  const scale = height / 48;
  doc.save().translate(x, y).scale(scale);
  doc.path(LOGO_TICKET).fill(GOLD);
  doc.path(LOGO_PLAY).fill(INK);
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(height * 0.62);
  doc.fillColor("#ffffff").text("CINE", x + 56 * scale, y + height * 0.2, {
    continued: true,
    characterSpacing: 0.5,
    lineBreak: false,
  });
  doc.fillColor(GOLD).text("GO", { characterSpacing: 0.5, lineBreak: false });
}

// Best effort: a missing or slow poster just leaves the layout without it.
const posterCache = new Map();
async function posterImage(posterPath) {
  if (!posterPath) return null;
  if (posterCache.has(posterPath)) return posterCache.get(posterPath);
  try {
    const response = await fetch(
      `https://image.tmdb.org/t/p/w342${posterPath}`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (!response.ok) return null;
    const image = Buffer.from(await response.arrayBuffer());
    posterCache.set(posterPath, image);
    return image;
  } catch {
    return null;
  }
}

// One A4 page per seat: each guest can be scanned in separately, and the
// shared booking QR on every page still resolves the whole booking.
async function pdf(booking) {
  const { screening, seats = [] } = booking;
  const [qr, poster] = await Promise.all([
    QRCode.toBuffer(token(booking), {
      width: 520,
      margin: 1,
      color: { dark: INK, light: "#ffffff" },
    }),
    posterImage(screening.posterPath),
  ]);
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
  const H = 841.89;
  const cardX = 36;
  const cardY = 36;
  const cardW = W - cardX * 2;
  const cardH = H - cardY * 2;
  const pad = 32;
  const left = cardX + pad;
  const inner = cardW - pad * 2;
  const headerH = 96;
  const cinemaName =
    cinemaNames[screening.cinema] || `Cinego ${screening.cinema}`;
  const rating = String(screening.rating || "NR");
  const pages = seats.length ? seats : [null];

  pages.forEach((seat, index) => {
    doc.addPage();
    doc.rect(0, 0, W, H).fill(PAGE);

    // Ticket card with a dark header clipped to its rounded top
    doc.roundedRect(cardX, cardY, cardW, cardH, 20).fill("#ffffff");
    doc.save();
    doc.roundedRect(cardX, cardY, cardW, cardH, 20).clip();
    doc.rect(cardX, cardY, cardW, headerH).fill("#0b0b0d");
    doc.rect(cardX, cardY + headerH, cardW, 3).fill(GOLD);
    doc.restore();
    drawLogo(doc, left, cardY + 30, 36);
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#a1a1a6");
    doc.text("E-TICKET  ·  ADMIT ONE", left, cardY + 36, {
      width: inner,
      align: "right",
      characterSpacing: 1.5,
    });
    doc.font("Helvetica").fontSize(9).fillColor("#8e8e93");
    doc.text(
      pages.length > 1
        ? `Ticket ${index + 1} of ${pages.length}`
        : booking.reference,
      left,
      cardY + 52,
      { width: inner, align: "right", characterSpacing: 0.5 },
    );

    // Film: poster beside title, rating and format
    const heroY = cardY + headerH + 34;
    const posterW = 112;
    const posterH = 168;
    let textX = left;
    if (poster) {
      doc.save();
      doc.roundedRect(left, heroY, posterW, posterH, 10).clip();
      try {
        doc.image(poster, left, heroY, { width: posterW, height: posterH });
      } catch {
        doc.rect(left, heroY, posterW, posterH).fill(HAIRLINE);
      }
      doc.restore();
      textX = left + posterW + 24;
    }
    const textW = cardX + cardW - pad - textX;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED);
    doc.text(cinemaName.toUpperCase(), textX, heroY + 4, {
      width: textW,
      characterSpacing: 1.5,
    });
    // Shrink long titles so the hero never grows past the poster's height.
    doc.font("Helvetica-Bold");
    const titleSize =
      [30, 26, 22, 19].find(
        (size) =>
          doc.fontSize(size).heightOfString(screening.movieTitle, {
            width: textW,
          }) <= 84,
      ) || 17;
    doc.fontSize(titleSize).fillColor(INK);
    doc.text(screening.movieTitle, textX, heroY + 22, { width: textW });
    const badgeY = doc.y + 12;
    const [badgeFill, badgeText] = ratingColours[rating] || [INK, "#ffffff"];
    doc.circle(textX + 14, badgeY + 14, 14).fill(badgeFill);
    doc.font("Helvetica-Bold").fontSize(rating.length > 2 ? 9 : 11);
    doc.fillColor(badgeText);
    doc.text(rating, textX, badgeY + (rating.length > 2 ? 10 : 9.5), {
      width: 28,
      align: "center",
    });
    const meta = [
      screening.experience?.name || "Standard",
      screening.runtime ? `${screening.runtime} min` : null,
    ]
      .filter(Boolean)
      .join("  ·  ");
    doc.font("Helvetica").fontSize(11).fillColor(MUTED);
    doc.text(meta, textX + 38, badgeY + 9, { width: textW - 38 });

    // Details grid
    const gridY = Math.max(poster ? heroY + posterH : 0, doc.y) + 26;
    const gridH = 128;
    doc.roundedRect(left, gridY, inner, gridH, 14).fill("#f5f5f7");
    const colW = inner / 3;
    const cell = (label, value, col, row) => {
      const x = left + 20 + col * colW;
      const y = gridY + 22 + row * 52;
      doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED);
      doc.text(label.toUpperCase(), x, y, {
        width: colW - 24,
        characterSpacing: 1.2,
      });
      doc.font("Helvetica-Bold").fontSize(14).fillColor(INK);
      doc.text(value, x, y + 13, {
        width: colW - 24,
        lineBreak: false,
        ellipsis: true,
      });
    };
    cell("Date", prettyDate(screening.date).replace(/ \d{4}$/, ""), 0, 0);
    cell("Time", screening.time, 1, 0);
    cell("Screen", String(screening.screen), 2, 0);
    cell("Cinema", cinemaName.replace(/^Cinego /, ""), 0, 1);
    cell(
      seat ? "Seat" : "Seats",
      seat
        ? `${seat.row}${seat.number}${seat.tier === "premium" ? " · Premium" : ""}`
        : "See booking",
      1,
      1,
    );
    cell("Booking ref", booking.reference, 2, 1);

    // Tear line with notches cut into the card edges
    const tearY = gridY + gridH + 32;
    doc.circle(cardX, tearY, 14).fill(PAGE);
    doc.circle(cardX + cardW, tearY, 14).fill(PAGE);
    doc
      .moveTo(cardX + 22, tearY)
      .lineTo(cardX + cardW - 22, tearY)
      .dash(5, { space: 5 })
      .lineWidth(1)
      .strokeColor("#d2d2d7")
      .stroke()
      .undash();

    // Stub: QR and entry instructions
    const stubY = tearY + 32;
    const qrSize = 168;
    doc
      .roundedRect(left, stubY, qrSize + 24, qrSize + 24, 14)
      .lineWidth(1)
      .strokeColor(HAIRLINE)
      .stroke();
    doc.image(qr, left + 12, stubY + 12, { width: qrSize });

    const infoX = left + qrSize + 24 + 28;
    const infoW = cardX + cardW - pad - infoX;
    doc.font("Helvetica-Bold").fontSize(16).fillColor(INK);
    doc.text("Scan at the entrance", infoX, stubY + 4, { width: infoW });
    doc.font("Helvetica").fontSize(10.5);
    const notes = [
      "Doors open 20 minutes before the film. Please arrive at least 15 minutes early.",
      ["15", "18"].includes(rating)
        ? `Rated ${rating}: every guest must be ${rating} or over. Photo ID may be checked.`
        : rating === "12A"
          ? "Rated 12A: under-12s must be accompanied by an adult."
          : null,
      "Show this page on your phone or printed. Each guest needs their own ticket page.",
    ].filter(Boolean);
    let noteY = stubY + 34;
    notes.forEach((note) => {
      doc.circle(infoX + 3, noteY + 6, 2.2).fill(GOLD);
      doc.fillColor("#3a3a3c").text(note, infoX + 14, noteY, {
        width: infoW - 14,
        lineGap: 2,
      });
      noteY = doc.y + 9;
    });
    doc
      .moveTo(infoX, noteY + 4)
      .lineTo(infoX + infoW, noteY + 4)
      .lineWidth(1)
      .strokeColor(HAIRLINE)
      .stroke();
    doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED);
    doc.text("TOTAL PAID", infoX, noteY + 18, { characterSpacing: 1.2 });
    doc.font("Helvetica-Bold").fontSize(18).fillColor(INK);
    doc.text(`£${(booking.totalPence / 100).toFixed(2)}`, infoX, noteY + 31);

    // Footer
    doc.font("Helvetica").fontSize(8).fillColor("#8e8e93");
    doc.text(
      "Tickets are non-transferable and valid only for the screening shown.  ·  Cinego is a portfolio demonstration project.",
      left,
      cardY + cardH - 34,
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
