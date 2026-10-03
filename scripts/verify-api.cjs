// Isolated API regression checks. No external credentials or services are used.
// Run: node scripts/verify-api.cjs
const assert = require("node:assert/strict");
for (const key of [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "TMDB_API_KEY",
  "STRIPE_SECRET_KEY",
  "OPENAI_API_KEY",
  "SMTP_USER",
  "SMTP_PASS",
])
  process.env[key] = "";
const app = require("../backend");
const store = require("../services/cinemaStore");
const results = [];
async function main() {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (path, body) => {
    const r = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json" },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: r.status, data, headers: r.headers };
  };
  const check = async (name, fn) => {
    try {
      await fn();
      results.push({ name, pass: true });
    } catch (e) {
      results.push({ name, pass: false, error: e.message });
    }
  };
  const age = {
    rating: "12A",
    ageBand: "18-plus",
    declared: true,
    policyVersion: "uk-2026-1",
  };
  let screening, reservation, booking;
  try {
    await check("health reports fallback", async () =>
      assert.equal((await request("/health")).data.database, "memory-fallback"),
    );
    for (const path of [
      "/movies/now-playing",
      "/movies/upcoming",
      "/screenings",
      "/screenings/upcoming",
      "/memberships/plans",
      "/experiences",
    ]) {
      await check(`catalogue ${path}`, async () => {
        const r = await request(path);
        assert.equal(r.status, 200);
        assert.ok(r.data.length);
      });
    }
    await check("movie search matches", async () => {
      const r = await request("/movies/search?q=Horizon");
      assert.equal(r.status, 200);
      assert.equal(r.data.length, 1);
    });
    await check("empty search returns an empty successful result", async () => {
      const r = await request("/movies/search?q=zzzz-no-match");
      assert.equal(r.status, 200);
      assert.deepEqual(r.data, []);
    });
    for (const path of [
      "/movies/search?q=x",
      "/movies/details/not-a-number",
      "/movies/showing?cinema=invalid",
    ])
      await check(`reject invalid ${path}`, async () =>
        assert.equal((await request(path)).status, 400),
      );
    for (const path of [
      "/screenings/missing",
      "/screenings/missing/seats",
      "/bookings/missing",
      "/tickets/missing/data",
      "/tickets/missing/download",
    ])
      await check(`missing resource ${path}`, async () =>
        assert.equal((await request(path)).status, 404),
      );
    await check("reject invalid ticket signature", async () =>
      assert.equal(
        (await request("/tickets/verify/bad-token")).data.valid,
        false,
      ),
    );
    await check("reject malformed reservation", async () =>
      assert.equal((await request("/reservations", {})).status, 400),
    );
    screening = (await request("/screenings")).data[0];
    const seats = (
      await request(`/screenings/${screening.id}/seats`)
    ).data.seats.filter((s) => s.available);
    await check("reserve available seat", async () => {
      const r = await request("/reservations", {
        screeningId: screening.id,
        seatIds: [seats[0].id],
        ageConfirmation: age,
      });
      assert.equal(r.status, 201);
      reservation = r.data;
    });
    await check("held seat becomes unavailable", async () =>
      assert.equal(
        (await request(`/screenings/${screening.id}/seats`)).data.seats.find(
          (s) => s.id === seats[0].id,
        ).available,
        false,
      ),
    );
    await check("reject conflicting reservation", async () =>
      assert.equal(
        (
          await request("/reservations", {
            screeningId: screening.id,
            seatIds: [seats[0].id],
            ageConfirmation: age,
          })
        ).status,
        409,
      ),
    );
    await check("reject repeated seat IDs", async () =>
      assert.equal(
        (
          await request("/reservations", {
            screeningId: screening.id,
            seatIds: [seats[1].id, seats[1].id],
            ageConfirmation: age,
          })
        ).status,
        400,
      ),
    );
    await check("reject unknown seat", async () =>
      assert.equal(
        (
          await request("/reservations", {
            screeningId: screening.id,
            seatIds: ["Z999"],
            ageConfirmation: age,
          })
        ).status,
        409,
      ),
    );
    await check("reject underage reservation", async () => {
      const s = (await request("/screenings")).data.find(
        (s) => s.rating === "15",
      );
      assert.equal(
        (
          await request("/reservations", {
            screeningId: s.id,
            seatIds: ["A1"],
            ageConfirmation: { ...age, ageBand: "under-12" },
          })
        ).status,
        403,
      );
    });
    await check("reject unknown promotion", async () =>
      assert.equal(
        (
          await request(`/reservations/${reservation.id}/payment-intent`, {
            email: "qa@example.test",
            promoCode: "INVALID",
          })
        ).status,
        400,
      ),
    );
    await check("guest cannot claim free checkout", async () =>
      assert.equal(
        (
          await request(`/reservations/${reservation.id}/confirm-free`, {
            email: "qa@example.test",
          })
        ).status,
        402,
      ),
    );
    await check("reject malformed payment confirmation", async () =>
      assert.equal((await request("/bookings/confirm", {})).status, 400),
    );
    // Seed a local booking to exercise ticket endpoints without pretending a Stripe payment succeeded.
    booking = store.confirm({
      reservationId: reservation.id,
      email: "qa@example.test",
      payment: {
        reference: "isolated-fixture",
        brand: "test",
        last4: "0000",
        status: "paid",
      },
    });
    await check("public booking omits email/payment/user", async () => {
      const r = await request(`/bookings/${booking.reference}`);
      assert.equal(r.status, 200);
      for (const k of ["email", "payment", "userId"]) assert.ok(!(k in r.data));
    });
    await check("ticket QR verifies through API", async () => {
      const r = await request(`/tickets/${booking.reference}/data`);
      assert.ok(r.data.qrDataUrl.startsWith("data:image/png"));
      assert.equal(
        (await request(`/tickets/verify/${r.data.token}`)).data.valid,
        true,
      );
    });
    await check("ticket download is PDF", async () => {
      const r = await request(`/tickets/${booking.reference}/download`);
      assert.equal(r.status, 200);
      assert.ok(r.data.startsWith("%PDF"));
    });
    await check("email fallback produces preview", async () => {
      const r = await request(`/tickets/${booking.reference}/email`, {});
      assert.equal(r.data.status, "preview");
      const preview = await fetch(
        `http://127.0.0.1:${server.address().port}${r.data.previewUrl}`,
      );
      assert.equal(preview.status, 200);
    });
    await check("assistant validates empty message", async () =>
      assert.equal(
        (await request("/assistant/chat", { message: "" })).status,
        400,
      ),
    );
    await check(
      "assistant consistently blocks repeated sensitive input",
      async () => {
        for (let i = 0; i < 2; i++)
          assert.equal(
            (await request("/assistant/chat", { message: "password" })).status,
            400,
          );
      },
    );
    await check("guided assistant returns grounded draft", async () => {
      const r = await request("/assistant/chat", {
        message: "Show IMAX tomorrow",
      });
      assert.equal(r.status, 200);
      assert.equal(r.data.mode, "guided-fallback");
      assert.ok(r.data.draftUrl.startsWith("/booking?"));
    });
    await check("assistant stream finishes", async () => {
      const r = await request("/assistant/stream", { message: "Family films" });
      assert.equal(r.status, 200);
      assert.ok(r.data.includes("event: complete"));
    });
    await check("accounts fail explicitly without service", async () =>
      assert.equal((await request("/account/profile")).status, 503),
    );
    await check(
      "membership purchase fails explicitly without service",
      async () =>
        assert.equal(
          (await request("/memberships/payment-intent", { plan: "silver" }))
            .status,
          503,
        ),
    );
    await check("expired reservation rejects confirmation", async () => {
      const hold = store.reserve({
        screeningId: screening.id,
        seatIds: [seats[2].id],
        ageConfirmation: age,
      });
      hold.expiresAt = "2000-01-01";
      await assert.rejects(store.getReservationQuote(hold.id), /expired/);
    });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  for (const result of results)
    console.log(
      `${result.pass ? "PASS" : "FAIL"} ${result.name}${result.error ? ": " + result.error : ""}`,
    );
  console.log(
    `${results.filter((r) => r.pass).length}/${results.length} checks passed`,
  );
  process.exitCode = results.some((r) => !r.pass) ? 1 : 0;
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
