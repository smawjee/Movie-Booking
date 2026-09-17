export type CardBrand = "visa" | "mastercard" | "amex" | "unknown";
export const detectCardBrand = (digits: string): CardBrand =>
  /^4/.test(digits)
    ? "visa"
    : /^5[1-5]|^2[2-7]/.test(digits)
      ? "mastercard"
      : /^3[47]/.test(digits)
        ? "amex"
        : "unknown";
export const passesLuhn = (value: string) => {
  let sum = 0,
    even = false;
  for (let i = value.length - 1; i >= 0; i--) {
    let n = Number(value[i]);
    if (even && (n *= 2) > 9) n -= 9;
    sum += n;
    even = !even;
  }
  return value.length >= 13 && sum % 10 === 0;
};
export const validExpiry = (value: string, now = new Date()) => {
  const [month, year] = value.split("/").map(Number);
  return Boolean(
    month >= 1 && month <= 12 && year && new Date(2000 + year, month) > now,
  );
};
