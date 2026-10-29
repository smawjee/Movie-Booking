import { createRequire } from "module";
import crypto from "crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const forge = require("node-forge");
const wallet = require("./walletService");

const booking = {
  reference: "CG-1A2B3C4D",
  screening: {
    id: "screening-1",
    movieTitle: "Test Feature",
    cinema: "edinburgh",
    date: "2030-07-01",
    time: "19:30",
    screen: 3,
    rating: "12A",
    runtime: 120,
    experience: { id: "imax", name: "IMAX" },
  },
  seats: [
    { row: "D", number: 7 },
    { row: "D", number: 8 },
  ],
};

// A throwaway self-signed certificate stands in for Apple's.
function selfSigned() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(
    publicKey.export({ type: "spki", format: "pem" }),
  );
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 86400000);
  const attrs = [{ name: "commonName", value: "Cinego test" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  const keyPem = privateKey.export({ type: "pkcs1", format: "pem" });
  cert.sign(forge.pki.privateKeyFromPem(keyPem), forge.md.sha256.create());
  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem,
    privateKey,
    publicKey,
  };
}

let creds;
beforeAll(() => {
  creds = selfSigned();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("wallet configuration", () => {
  it("shows no buttons without credentials", () => {
    vi.stubEnv("APPLE_WALLET_PASS_TYPE_ID", "");
    vi.stubEnv("GOOGLE_WALLET_ISSUER_ID", "");
    expect(wallet.configured()).toEqual({ apple: false, google: false });
  });
  it("converts UK wall-clock times to instants across BST", () => {
    expect(wallet.ukInstant("2030-07-01", "19:30").toISOString()).toBe(
      "2030-07-01T18:30:00.000Z",
    );
    expect(wallet.ukInstant("2030-01-15", "19:30").toISOString()).toBe(
      "2030-01-15T19:30:00.000Z",
    );
  });
});

describe("Apple Wallet", () => {
  it("builds a signed pass whose manifest matches its files", () => {
    vi.stubEnv("APPLE_WALLET_PASS_TYPE_ID", "pass.app.cinego.ticket");
    vi.stubEnv("APPLE_WALLET_TEAM_ID", "ABCDE12345");
    // Env values usually carry escaped newlines.
    vi.stubEnv("APPLE_WALLET_CERT", creds.certPem.replace(/\n/g, "\\n"));
    vi.stubEnv("APPLE_WALLET_KEY", creds.keyPem);
    vi.stubEnv("APPLE_WALLET_WWDR_CERT", creds.certPem);
    expect(wallet.configured().apple).toBe(true);

    const pass = wallet.passJson(booking);
    expect(pass.serialNumber).toBe("CG-1A2B3C4D");
    expect(pass.eventTicket.auxiliaryFields[1].value).toBe("D7, D8");
    expect(pass.barcodes[0].format).toBe("PKBarcodeFormatQR");

    const file = wallet.applePass(booking);
    expect(file.subarray(0, 2).toString()).toBe("PK");
    for (const name of ["pass.json", "manifest.json", "signature", "icon.png"])
      expect(file.includes(Buffer.from(name))).toBe(true);
  });
});

describe("Google Wallet", () => {
  it("creates the ticket and returns a signed save link", async () => {
    vi.stubEnv("GOOGLE_WALLET_ISSUER_ID", "3388000000012345678");
    vi.stubEnv(
      "GOOGLE_WALLET_SERVICE_ACCOUNT",
      JSON.stringify({
        client_email: "wallet@cinego.iam.gserviceaccount.com",
        private_key: creds.privateKey.export({ type: "pkcs8", format: "pem" }),
      }),
    );
    const calls = [];
    vi.stubGlobal("fetch", async (url, init) => {
      calls.push({ url, body: init.body });
      if (url.includes("oauth2"))
        return Response.json({ access_token: "token", expires_in: 3600 });
      // The class already exists from an earlier booking.
      return url.endsWith("eventTicketClass")
        ? new Response("{}", { status: 409 })
        : Response.json({});
    });

    const url = await wallet.googleSaveUrl(booking, "https://cinego.test");
    expect(calls.map((c) => c.url.split("/").pop())).toEqual([
      "token",
      "eventTicketClass",
      "eventTicketObject",
    ]);
    const object = JSON.parse(calls[2].body);
    expect(object.id).toBe("3388000000012345678.CG-1A2B3C4D");
    expect(object.seatInfo.seat.defaultValue.value).toBe("D7, D8");

    const jwt = url.replace("https://pay.google.com/gp/v/save/", "");
    const [header, claims, signature] = jwt.split(".");
    expect(
      crypto.verify(
        "RSA-SHA256",
        Buffer.from(`${header}.${claims}`),
        creds.publicKey,
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true);
    const payload = JSON.parse(Buffer.from(claims, "base64url"));
    expect(payload.typ).toBe("savetowallet");
    expect(payload.payload.eventTicketObjects).toEqual([{ id: object.id }]);
  });
});
