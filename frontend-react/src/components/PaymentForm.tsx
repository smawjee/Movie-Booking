// @ts-nocheck
import { useMemo, useState } from "react";
import { money } from "../lib/api";
import type { PaymentSummary } from "../types";
const brandOf = (digits: string) =>
  /^4/.test(digits)
    ? "visa"
    : /^5[1-5]|^2[2-7]/.test(digits)
      ? "mastercard"
      : /^3[47]/.test(digits)
        ? "amex"
        : "unknown";
const luhn = (value: string) => {
  let sum = 0,
    even = false;
  for (let i = value.length - 1; i >= 0; i--) {
    let n = Number(value[i]);
    if (even && (n *= 2) > 9) n -= 9;
    sum += n;
    even = !even;
  }
  return sum % 10 === 0;
};
export function PaymentForm({
  amountPence,
  label,
  onSuccess,
  onCancel,
}: {
  amountPence: number;
  label: string;
  onSuccess: (payment: PaymentSummary) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(""),
    [number, setNumber] = useState(""),
    [expiry, setExpiry] = useState(""),
    [cvv, setCvv] = useState(""),
    [postcode, setPostcode] = useState(""),
    [error, setError] = useState(""),
    [processing, setProcessing] = useState(false);
  const digits = number.replace(/\D/g, "");
  const brand = useMemo(() => brandOf(digits), [digits]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const [month, year] = expiry.split("/").map(Number);
    const expires = new Date(2000 + year, month);
    if (
      !name ||
      !luhn(digits) ||
      !month ||
      month > 12 ||
      expires <= new Date() ||
      !new RegExp(brand === "amex" ? "^\\d{4}$" : "^\\d{3}$").test(cvv) ||
      postcode.trim().length < 3
    ) {
      setError(
        "Check the card details, future expiry date, security code and billing postcode.",
      );
      return;
    }
    setProcessing(true);
    await new Promise((r) => setTimeout(r, 900));
    const payment = {
      reference: `PAY-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      brand,
      last4: digits.slice(-4),
      amountPence,
      status: "simulated" as const,
      createdAt: new Date().toISOString(),
    };
    setNumber("");
    setCvv("");
    onSuccess(payment);
  };
  return (
    <form className="payment card" onSubmit={submit}>
      <div className="payment-heading">
        <div>
          <span className="eyebrow">Secure checkout</span>
          <h2>Payment details</h2>
        </div>
        <span className="lock-badge">● Encrypted</span>
      </div>
      {onCancel && (
        <button
          type="button"
          className="payment-close"
          onClick={onCancel}
          aria-label="Close payment"
        >
          ×
        </button>
      )}
      <div className={`visual-card ${brand}`}>
        <span>{brand === "unknown" ? "CARD" : brand.toUpperCase()}</span>
        <strong>•••• •••• •••• {digits.slice(-4).padStart(4, "•")}</strong>
        <small>{name || "CARDHOLDER NAME"}</small>
      </div>
      <div className="accepted">
        <span>VISA</span>
        <span>Mastercard</span>
        <span>AMEX</span>
      </div>
      <p className="notice">
        Secure demo payment. No charge is made and full card details are never
        stored.
      </p>
      <div className="form-grid">
        <label>
          Name on card
          <input
            value={name}
            autoComplete="cc-name"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Card number
          <input
            inputMode="numeric"
            autoComplete="cc-number"
            value={number}
            placeholder="4242 4242 4242 4242"
            onChange={(e) =>
              setNumber(
                e.target.value
                  .replace(/\D/g, "")
                  .slice(0, brand === "amex" ? 15 : 16)
                  .replace(/(.{4})/g, "$1 ")
                  .trim(),
              )
            }
          />
        </label>
        <div className="form-row">
          <label>
            Expiry
            <input
              value={expiry}
              placeholder="MM/YY"
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                setExpiry(v.length > 2 ? `${v.slice(0, 2)}/${v.slice(2)}` : v);
              }}
            />
          </label>
          <label>
            CVV
            <input
              type="password"
              inputMode="numeric"
              value={cvv}
              maxLength={brand === "amex" ? 4 : 3}
              onChange={(e) => setCvv(e.target.value.replace(/\D/g, ""))}
            />
          </label>
        </div>
        <label>
          Billing postcode
          <input
            value={postcode}
            autoComplete="postal-code"
            onChange={(e) => setPostcode(e.target.value.toUpperCase())}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="button" disabled={processing}>
          {processing
            ? "Processing demo payment…"
            : `${label} · ${money(amountPence)}`}
        </button>
      </div>
    </form>
  );
}
