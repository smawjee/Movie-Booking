import { describe, expect, it } from "vitest";
import { detectCardBrand, passesLuhn, validExpiry } from "./payment";
describe("payment validation", () => {
  it("detects card brands", () => {
    expect(detectCardBrand("4242424242424242")).toBe("visa");
    expect(detectCardBrand("5555555555554444")).toBe("mastercard");
    expect(detectCardBrand("378282246310005")).toBe("amex");
  });
  it("checks Luhn", () => {
    expect(passesLuhn("4242424242424242")).toBe(true);
    expect(passesLuhn("4242424242424241")).toBe(false);
  });
  it("rejects expired dates", () => {
    expect(validExpiry("01/20", new Date("2026-01-01"))).toBe(false);
    expect(validExpiry("12/30", new Date("2026-01-01"))).toBe(true);
  });
});
