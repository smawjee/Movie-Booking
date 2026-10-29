import { createRequire } from "module";
import { beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { planDay, MAX_FILMS, SHOWTIMES } = require("./schedule");

const films = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, title: `Film ${i + 1}` }));
const screens = ["standard", "3d", "imax", "dolby", "4dx", "screenx"].map(
  (formatId, i) => ({ id: `aud-${i}`, screenNumber: i + 1, formatId }),
);

describe("planDay", () => {
  it("gives a showtime to 18 different films, not just the first six", () => {
    const plan = planDay(films(25), screens);
    expect(plan).toHaveLength(SHOWTIMES.length * screens.length);
    expect(new Set(plan.map((p) => p.movie.id)).size).toBe(MAX_FILMS);
  });
  it("never puts a film or a screen twice in the same showtime", () => {
    const plan = planDay(films(25), screens);
    for (const hour of SHOWTIMES) {
      const slot = plan.filter((p) => p.hour === hour);
      expect(new Set(slot.map((p) => p.movie.id)).size).toBe(screens.length);
      expect(new Set(slot.map((p) => p.auditorium.id)).size).toBe(
        screens.length,
      );
    }
  });
  it("shows the most popular film twice, in two different formats", () => {
    const top = planDay(films(25), screens).filter((p) => p.movie.id === 1);
    expect(top).toHaveLength(2);
    expect(top[0].auditorium.id).not.toBe(top[1].auditorium.id);
  });
});

// A minimal stand-in for the Supabase query builder: records writes and
// answers the read-back from an in-memory screenings table.
function fakeSupabase(existing = []) {
  const table = [...existing];
  let nextId = 1;
  const client = {
    calls: [],
    table,
    from(name) {
      const query = { name, filters: [] };
      const builder = {
        select: () => builder,
        upsert(rows, options) {
          client.calls.push({ name, options });
          if (name === "screenings")
            for (const row of rows) {
              const clash = table.find(
                (r) =>
                  r.auditorium_id === row.auditorium_id &&
                  r.starts_at === row.starts_at,
              );
              if (!clash) table.push({ id: `s${nextId++}`, ...row });
              else if (!options.ignoreDuplicates) Object.assign(clash, row);
            }
          return Promise.resolve({ error: null });
        },
        in: (col, values) => (
          query.filters.push((r) => values.includes(r[col])),
          builder
        ),
        gte: (col, v) => (query.filters.push((r) => r[col] >= v), builder),
        lt: (col, v) => (query.filters.push((r) => r[col] < v), builder),
        order: () => builder,
        then: (resolve) =>
          resolve({
            error: null,
            data: table
              .filter((r) => query.filters.every((f) => f(r)))
              .map((r) => ({
                ...r,
                movies: {
                  title: `Film ${r.movie_id}`,
                  rating: "PG",
                  runtime: 100,
                  poster_path: null,
                },
              })),
          }),
      };
      if (name === "auditoriums")
        builder.select = () =>
          Promise.resolve({
            error: null,
            data: screens.map((s) => ({
              id: s.id,
              experience_id: s.formatId,
              screen_number: s.screenNumber,
              cinemas: { slug: "edinburgh" },
            })),
          });
      return builder;
    },
  };
  return client;
}

describe("Supabase schedule", () => {
  let store, db;
  beforeAll(() => {
    db = fakeSupabase([
      // Booked yesterday under the old schedule: must keep its film.
      {
        id: "booked",
        movie_id: 3,
        auditorium_id: "aud-0",
        starts_at: "2030-05-01T11:00:00.000Z",
        base_price_pence: 899,
        language: "en",
      },
      // Another day: must not leak into this day's programme.
      {
        id: "other-day",
        movie_id: 1,
        auditorium_id: "aud-1",
        starts_at: "2030-05-02T11:00:00.000Z",
        base_price_pence: 899,
        language: "en",
      },
    ]);
    const clientPath = require.resolve("./supabaseClient");
    require.cache[clientPath] = {
      id: clientPath,
      filename: clientPath,
      loaded: true,
      exports: { supabase: db, supabaseConfigured: true },
    };
    delete require.cache[require.resolve("./supabaseBookingStore")];
    store = require("./supabaseBookingStore");
  });

  it("schedules 18 films and never changes the film of an existing screening", async () => {
    const day = await store.buildScreenings(films(25), { date: "2030-05-01" });
    expect(
      db.calls.find((c) => c.name === "screenings").options.ignoreDuplicates,
    ).toBe(true);
    expect(day.find((s) => s.id === "booked").movieId).toBe(3);
    expect(day.some((s) => s.id === "other-day")).toBe(false);
    expect(new Set(day.map((s) => s.movieId)).size).toBeGreaterThanOrEqual(17);
  });
  it("filters by format after planning, so the schedule doesn't change", async () => {
    const imax = await store.buildScreenings(films(25), {
      date: "2030-05-01",
      format: "imax",
    });
    expect(imax).toHaveLength(SHOWTIMES.length);
    expect(imax.every((s) => s.experience.id === "imax")).toBe(true);
  });
});
