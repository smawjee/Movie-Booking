import { createRequire } from "module";
import { describe, expect, it } from "vitest";

const { ukNow, bookableDate, hasStarted, upcomingOnly } = createRequire(
  import.meta.url,
)("./showtimes");

// 13:30 UTC on 4 Oct 2026 is 14:30 in London (BST).
const at = new Date("2026-10-04T13:30:00Z");

describe("showtimes", () => {
  it("reads the clock in UK time", () => {
    expect(ukNow(at)).toEqual({ date: "2026-10-04", time: "14:30" });
    // Just after midnight UTC is already the next day in summer.
    expect(ukNow(new Date("2026-10-04T23:30:00Z")).date).toBe("2026-10-05");
  });

  it("accepts today through the booking window only", () => {
    expect(bookableDate(undefined, at)).toBe("2026-10-04");
    expect(bookableDate("2026-10-04", at)).toBe("2026-10-04");
    expect(bookableDate("2026-11-20", at)).toBe("2026-11-20");
    expect(bookableDate("2026-10-03", at)).toBeNull();
    expect(bookableDate("3000-01-01", at)).toBeNull();
    expect(bookableDate("2026-13-40", at)).toBeNull();
    expect(bookableDate("tomorrow", at)).toBeNull();
  });

  it("treats a showtime as started once its UK time has passed", () => {
    expect(hasStarted({ date: "2026-10-04", time: "14:00" }, at)).toBe(true);
    expect(hasStarted({ date: "2026-10-04", time: "14:30" }, at)).toBe(true);
    expect(hasStarted({ date: "2026-10-04", time: "17:00" }, at)).toBe(false);
    expect(hasStarted({ date: "2026-10-03", time: "20:00" }, at)).toBe(true);
    expect(hasStarted({ date: "2026-10-05", time: "11:00" }, at)).toBe(false);
  });

  it("filters started screenings out of a list", () => {
    const list = [
      { date: "2026-10-04", time: "11:00" },
      { date: "2026-10-04", time: "20:00" },
    ];
    expect(upcomingOnly(list, at)).toEqual([list[1]]);
  });
});
