const crypto = require("crypto");
const forge = require("node-forge");
const zip = require("do-not-zip");
const { token } = require("./ticketService");
const { cinemaName: nameOf } = require("./cinemas");
const images = require("./walletImages");

// Apple Wallet needs a Pass Type ID certificate from a paid Apple Developer
// account; Google Wallet needs an issuer account and a service account key.
// Each button only appears once its credentials are set.
const pem = (name) => (process.env[name] || "").replace(/\\n/g, "\n").trim();
const appleConfigured = () =>
  Boolean(
    process.env.APPLE_WALLET_PASS_TYPE_ID &&
    process.env.APPLE_WALLET_TEAM_ID &&
    pem("APPLE_WALLET_CERT") &&
    pem("APPLE_WALLET_KEY") &&
    pem("APPLE_WALLET_WWDR_CERT"),
  );
function googleAccount() {
  if (!process.env.GOOGLE_WALLET_ISSUER_ID) return null;
  try {
    const key = JSON.parse(process.env.GOOGLE_WALLET_SERVICE_ACCOUNT || "");
    return key.client_email && key.private_key ? key : null;
  } catch {
    return null;
  }
}
const configured = () => ({
  apple: appleConfigured(),
  google: Boolean(googleAccount()),
});

// Screening times are UK wall-clock times; wallets want a real instant.
function ukInstant(date, time) {
  const guess = new Date(`${date}T${time}:00Z`);
  const london = new Date(
    guess.toLocaleString("en-US", { timeZone: "Europe/London" }),
  );
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (london - utc));
}
const seatList = (booking) =>
  booking.seats.map((s) => `${s.row}${s.number}`).join(", ");
const cinemaName = (booking) => nameOf(booking.screening.cinema);

// --- Apple Wallet (.pkpass) ---

function passJson(booking) {
  const { screening } = booking;
  const starts = ukInstant(screening.date, screening.time);
  const entry = token(booking);
  const barcode = {
    format: "PKBarcodeFormatQR",
    message: entry,
    messageEncoding: "iso-8859-1",
    altText: booking.reference,
  };
  return {
    formatVersion: 1,
    passTypeIdentifier: process.env.APPLE_WALLET_PASS_TYPE_ID,
    teamIdentifier: process.env.APPLE_WALLET_TEAM_ID,
    serialNumber: booking.reference,
    organizationName: "Cinego",
    description: `Cinego ticket: ${screening.movieTitle}`,
    foregroundColor: "rgb(255, 255, 255)",
    backgroundColor: "rgb(17, 17, 17)",
    labelColor: "rgb(245, 189, 39)",
    relevantDate: starts.toISOString(),
    expirationDate: new Date(
      starts.getTime() + ((screening.runtime || 120) + 60) * 60000,
    ).toISOString(),
    barcode,
    barcodes: [barcode],
    eventTicket: {
      primaryFields: [
        { key: "film", label: "FILM", value: screening.movieTitle },
      ],
      secondaryFields: [
        {
          key: "date",
          label: "DATE",
          value: starts.toISOString(),
          dateStyle: "PKDateStyleMedium",
          timeStyle: "PKDateStyleShort",
        },
        { key: "cinema", label: "CINEMA", value: cinemaName(booking) },
      ],
      auxiliaryFields: [
        { key: "screen", label: "SCREEN", value: `${screening.screen}` },
        { key: "seats", label: "SEATS", value: seatList(booking) },
        { key: "format", label: "FORMAT", value: screening.experience.name },
      ],
      backFields: [
        {
          key: "reference",
          label: "Booking reference",
          value: booking.reference,
        },
        { key: "rating", label: "Rating", value: screening.rating || "NR" },
        {
          key: "entry",
          label: "Entry",
          value: "Show this pass at the auditorium entrance.",
        },
      ],
    },
  };
}

function signManifest(manifest) {
  const certificate = forge.pki.certificateFromPem(pem("APPLE_WALLET_CERT"));
  const keyPem = pem("APPLE_WALLET_KEY");
  const key = process.env.APPLE_WALLET_KEY_PASSPHRASE
    ? forge.pki.decryptRsaPrivateKey(
        keyPem,
        process.env.APPLE_WALLET_KEY_PASSPHRASE,
      )
    : forge.pki.privateKeyFromPem(keyPem);
  if (!key) throw new Error("Apple Wallet key could not be read");
  const signed = forge.pkcs7.createSignedData();
  signed.content = forge.util.createBuffer(manifest.toString("binary"));
  signed.addCertificate(certificate);
  signed.addCertificate(
    forge.pki.certificateFromPem(pem("APPLE_WALLET_WWDR_CERT")),
  );
  signed.addSigner({
    key,
    certificate,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  signed.sign({ detached: true });
  return Buffer.from(forge.asn1.toDer(signed.toAsn1()).getBytes(), "binary");
}

/** A signed .pkpass file: pass.json, images, a SHA-1 manifest and its signature. */
function applePass(booking) {
  const files = {
    "pass.json": Buffer.from(JSON.stringify(passJson(booking))),
    ...Object.fromEntries(
      Object.entries(images).map(([name, data]) => [
        name,
        Buffer.from(data, "base64"),
      ]),
    ),
  };
  const manifest = Buffer.from(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(files).map(([name, data]) => [
          name,
          crypto.createHash("sha1").update(data).digest("hex"),
        ]),
      ),
    ),
  );
  files["manifest.json"] = manifest;
  files.signature = signManifest(manifest);
  return zip.toBuffer(
    Object.entries(files).map(([path, data]) => ({ path, data })),
  );
}

// --- Google Wallet ---

const base64url = (value) =>
  Buffer.from(
    typeof value === "string" ? value : JSON.stringify(value),
  ).toString("base64url");
function signJwt(claims, account) {
  const unsigned = `${base64url({ alg: "RS256", typ: "JWT" })}.${base64url(claims)}`;
  const signature = crypto
    .sign("RSA-SHA256", Buffer.from(unsigned), account.private_key)
    .toString("base64url");
  return `${unsigned}.${signature}`;
}

let cachedToken = null;
async function accessToken(account) {
  if (cachedToken && cachedToken.expires > Date.now() + 60000)
    return cachedToken.value;
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt(
    {
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/wallet_object.issuer",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    },
    account,
  );
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      `Google auth failed: ${body.error_description || body.error}`,
    );
  cachedToken = {
    value: body.access_token,
    expires: Date.now() + body.expires_in * 1000,
  };
  return cachedToken.value;
}

const text = (value) => ({
  defaultValue: { language: "en-GB", value: String(value) },
});
const walletId = (value) => String(value).replace(/[^\w.-]/g, "_");

function googleObjects(booking, origin) {
  const issuer = process.env.GOOGLE_WALLET_ISSUER_ID;
  const { screening } = booking;
  const ticketClass = {
    id: `${issuer}.screening-${walletId(screening.id)}`,
    issuerName: "Cinego",
    reviewStatus: "UNDER_REVIEW",
    eventName: text(screening.movieTitle),
    venue: {
      name: text(cinemaName(booking)),
      address: text(cinemaName(booking)),
    },
    dateTime: {
      start: ukInstant(screening.date, screening.time).toISOString(),
    },
    logo: { sourceUri: { uri: `${origin}/wallet-logo.png` } },
    hexBackgroundColor: "#111111",
  };
  const ticketObject = {
    id: `${issuer}.${walletId(booking.reference)}`,
    classId: ticketClass.id,
    state: "ACTIVE",
    ticketType: text(screening.experience.name),
    seatInfo: {
      seat: text(seatList(booking)),
      section: text(`Screen ${screening.screen}`),
    },
    reservationInfo: { confirmationCode: booking.reference },
    barcode: {
      type: "QR_CODE",
      value: token(booking),
      alternateText: booking.reference,
    },
    hexBackgroundColor: "#111111",
  };
  return { ticketClass, ticketObject };
}

// Creates the class and object through the Wallet API (a 409 means they
// already exist), then signs a short JWT that only names the object, which
// keeps the save link well under URL length limits.
async function googleSaveUrl(booking, origin) {
  const account = googleAccount();
  if (!account) throw new Error("Google Wallet is not configured");
  const { ticketClass, ticketObject } = googleObjects(booking, origin);
  const auth = `Bearer ${await accessToken(account)}`;
  for (const [resource, body] of [
    ["eventTicketClass", ticketClass],
    ["eventTicketObject", ticketObject],
  ]) {
    const response = await fetch(
      `https://walletobjects.googleapis.com/walletobjects/v1/${resource}`,
      {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok && response.status !== 409) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(
        `Google Wallet ${resource} failed: ${detail.error?.message || response.status}`,
      );
    }
  }
  const jwt = signJwt(
    {
      iss: account.client_email,
      aud: "google",
      typ: "savetowallet",
      origins: [origin],
      payload: { eventTicketObjects: [{ id: ticketObject.id }] },
    },
    account,
  );
  return `https://pay.google.com/gp/v/save/${jwt}`;
}

module.exports = {
  configured,
  applePass,
  passJson,
  googleObjects,
  googleSaveUrl,
  ukInstant,
};
