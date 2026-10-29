import { createRequire } from "module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
process.env.TMDB_API_KEY = "";
const tmdb = require("./tmdbService");
const { MAX_FILMS } = require("./schedule");

const films = (prefix, n) =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}` }));

describe("world cinema programme", () => {
  it("puts a world film after every two UK releases", () => {
    const mixed = tmdb.mixProgramme(films("uk", 6), films("w", 2));
    expect(mixed.map((m) => m.id)).toEqual([
      "uk0",
      "uk1",
      "w0",
      "uk2",
      "uk3",
      "w1",
      "uk4",
      "uk5",
    ]);
  });
  it("schedules world films and the week's classics, not just UK releases", () => {
    const mixed = tmdb.mixProgramme(
      films("uk", 20),
      films("w", 18),
      films("c", 4),
    );
    const scheduled = mixed.slice(0, MAX_FILMS).map((m) => m.id);
    expect(scheduled.filter((id) => id.startsWith("c"))).toHaveLength(4);
    expect(
      scheduled.filter((id) => id.startsWith("w")).length,
    ).toBeGreaterThanOrEqual(8);
    expect(
      scheduled.filter((id) => id.startsWith("uk")).length,
    ).toBeGreaterThanOrEqual(15);
  });
  it("covers 18 languages", () => {
    expect(new Set(tmdb.WORLD_LANGUAGES).size).toBe(18);
  });
  it("doesn't repeat a world film that is already in the UK list", () => {
    const local = [{ id: 1 }, { id: 2 }];
    const mixed = tmdb.mixProgramme(local, [{ id: 2 }, { id: 3 }]);
    expect(mixed.map((m) => m.id)).toEqual([1, 2, 3]);
  });
  it("includes films in other languages without TMDB", async () => {
    const languages = new Set(
      (await tmdb.getNowPlaying()).map((m) => m.language),
    );
    expect(languages.size).toBeGreaterThanOrEqual(4);
  });
});
