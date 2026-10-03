import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { CreditCard, Plus } from "lucide-react";
import { account } from "../../lib/api";
import { useSavedCards } from "../../lib/hooks";
import { appearance, stripePromise } from "../PaymentForm";

function AddCardForm({ onDone }: { onDone: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSaving(true);
    setError("");
    const { error: setupError } = await stripe.confirmSetup({
      elements,
      redirect: "if_required",
    });
    setSaving(false);
    if (setupError) return setError(setupError.message || "Card could not be saved.");
    onDone();
  };
  return (
    <form className="form-grid" onSubmit={submit}>
      <PaymentElement />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button" disabled={saving || !stripe}>
        {saving ? "Saving card…" : "Save card"}
      </button>
    </form>
  );
}

export function PaymentMethods() {
  const queryClient = useQueryClient();
  const cards = useSavedCards(true);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["account", "cards"] });
  const startAdd = useMutation({
    mutationFn: account.cardSetupIntent,
    onSuccess: (data) => setSetupSecret(data.clientSecret),
  });
  const remove = useMutation({ mutationFn: account.removeCard, onSuccess: refresh });
  const makeDefault = useMutation({
    mutationFn: account.setDefaultCard,
    onSuccess: refresh,
  });
  const error = cards.error || startAdd.error || remove.error || makeDefault.error;
  return (
    <div className="account-section">
      <div className="section-head">
        <div>
          <h2>Payment methods</h2>
          <p className="muted">
            Cards saved at checkout appear here and are offered next time you
            book. Card details are stored by Stripe, never by Cinego.
          </p>
        </div>
        {!setupSecret && (
          <button
            className="button secondary"
            disabled={startAdd.isPending}
            onClick={() => startAdd.mutate()}
          >
            <Plus size={16} aria-hidden="true" />
            {startAdd.isPending ? "Opening…" : "Add a card"}
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {(error as Error).message}
        </p>
      )}
      {setupSecret && stripePromise && (
        <div className="card add-card">
          <p className="notice">
            Test mode: use <strong>4242 4242 4242 4242</strong>, any future
            date and any CVC.
          </p>
          <Elements stripe={stripePromise} options={{ clientSecret: setupSecret, appearance }}>
            <AddCardForm
              onDone={() => {
                setSetupSecret(null);
                void refresh();
              }}
            />
          </Elements>
          <button className="text-button" onClick={() => setSetupSecret(null)}>
            Cancel
          </button>
        </div>
      )}
      {cards.isLoading ? (
        <div className="empty">Loading cards…</div>
      ) : !cards.data?.cards.length ? (
        <div className="empty">
          No saved cards yet. Tick “Save for future purchases” at checkout, or
          add one here.
        </div>
      ) : (
        <ul className="card-list">
          {cards.data.cards.map((card) => (
            <li key={card.id} className="card saved-card">
              <CreditCard size={22} aria-hidden="true" />
              <div>
                <strong>
                  {card.brand.toUpperCase()} •••• {card.last4}
                </strong>
                <small>
                  Expires {String(card.expMonth).padStart(2, "0")}/{card.expYear}
                </small>
              </div>
              {card.isDefault ? (
                <span className="plan-tag">Default</span>
              ) : (
                <button
                  className="text-button"
                  disabled={makeDefault.isPending}
                  onClick={() => makeDefault.mutate(card.id)}
                >
                  Make default
                </button>
              )}
              <button
                className="text-button danger"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(`Remove the card ending ${card.last4}?`))
                    remove.mutate(card.id);
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">
        To change a card, add the new one, make it your default, then remove
        the old one.
      </p>
    </div>
  );
}
