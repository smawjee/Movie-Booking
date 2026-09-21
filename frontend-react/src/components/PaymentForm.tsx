import { useState, type FormEvent, type ReactNode } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { ShieldCheck, X } from "lucide-react";
import { money } from "../lib/api";

// Fallback default for this project's Stripe test-mode publishable key —
// not a secret (it can only create/confirm PaymentIntents, never charge
// without the secret key), so this keeps the deployed site working even if
// VITE_STRIPE_PUBLISHABLE_KEY isn't set as a Vercel env var yet.
const FALLBACK_PUBLISHABLE_KEY =
  "pk_test_51UHtYiHCekLv4ToNZZWdZ31ZblQqrB2neAaxGx0CxkBD5aTv24fntFDH4sHtGVkturFGSfqMcURJWgodbihZT2lH00hZc3IWST";
const publishableKey =
  (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined) ||
  FALLBACK_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

const appearance = {
  theme: "night" as const,
  variables: {
    colorPrimary: "#f5c948",
    colorBackground: "#20232a",
    colorText: "#f7f7f5",
    colorTextSecondary: "#a6a9b2",
    colorDanger: "#ff7e86",
    borderRadius: "10px",
    fontFamily: "Inter, system-ui, sans-serif",
  },
};

function StripeCheckoutForm({
  amountPence,
  label,
  onSuccess,
}: {
  amountPence: number;
  label: string;
  onSuccess: (paymentIntentId: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    setError("");
    const { error: confirmError, paymentIntent } = await stripe.confirmPayment(
      { elements, redirect: "if_required" },
    );
    if (confirmError) {
      setError(confirmError.message || "Payment failed. Please try again.");
      setProcessing(false);
      return;
    }
    if (!paymentIntent) {
      setError("Payment could not be confirmed.");
      setProcessing(false);
      return;
    }
    onSuccess(paymentIntent.id);
  };
  return (
    <form className="form-grid" onSubmit={submit}>
      <PaymentElement />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button" disabled={processing || !stripe}>
        {processing
          ? "Processing payment…"
          : `${label} · ${money(amountPence)}`}
      </button>
    </form>
  );
}

export function PaymentForm({
  clientSecret,
  amountPence,
  label,
  onSuccess,
  onCancel,
  children,
}: {
  clientSecret: string | null;
  amountPence: number;
  label: string;
  onSuccess: (paymentIntentId: string) => void;
  onCancel?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="payment card">
      <div className="payment-heading">
        <div>
          <span className="eyebrow">Secure checkout</span>
          <h2>Payment details</h2>
        </div>
        <span className="lock-badge">
          <ShieldCheck size={14} aria-hidden="true" /> Encrypted
        </span>
      </div>
      {onCancel && (
        <button
          type="button"
          className="payment-close"
          onClick={onCancel}
          aria-label="Close payment"
        >
          <X size={20} aria-hidden="true" />
        </button>
      )}
      <p className="notice">
        Stripe test mode — no real charge is made. Use{" "}
        <strong>4242 4242 4242 4242</strong>, any future expiry date and any
        CVC.
      </p>
      {children}
      {!stripePromise ? (
        <p className="error" role="alert">
          Payments are not configured.
        </p>
      ) : !clientSecret ? (
        <p>Preparing secure payment…</p>
      ) : (
        <Elements
          stripe={stripePromise}
          options={{ clientSecret, appearance }}
        >
          <StripeCheckoutForm
            amountPence={amountPence}
            label={label}
            onSuccess={onSuccess}
          />
        </Elements>
      )}
    </div>
  );
}
