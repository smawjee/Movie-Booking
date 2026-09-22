import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, money } from "../lib/api";
import { useMembershipPaymentIntent, useMyMembership } from "../lib/hooks";
import { supabase, supabaseConfigured } from "../lib/supabase";
import type { MembershipPlan } from "../types";
import { PaymentForm } from "../components/PaymentForm";
import { useDelayedClose } from "../lib/useDelayedClose";

export function Membership() {
  const queryClient = useQueryClient();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    if (!supabaseConfigured) {
      setSignedIn(false);
      return;
    }
    supabase?.auth
      .getSession()
      .then(({ data }) => setSignedIn(Boolean(data.session)));
    const listener = supabase?.auth.onAuthStateChange((_event, session) =>
      setSignedIn(Boolean(session)),
    );
    return () => listener?.data.subscription.unsubscribe();
  }, []);

  const plans = useQuery({
    queryKey: ["membership-plans"],
    queryFn: api.membershipPlans,
  });
  const mine = useMyMembership(signedIn === true);
  const [chosen, setChosen] = useState<MembershipPlan | null>(null);
  const { closing: chosenClosing, close: closeChosen } = useDelayedClose(() =>
    setChosen(null),
  );
  const [promoCode, setPromoCode] = useState("");
  const paymentIntent = useMembershipPaymentIntent(
    chosen?.id ?? null,
    promoCode || undefined,
  );
  const pay = async (paymentIntentId: string) => {
    if (!chosen) return;
    await api.membershipPay({ plan: chosen.id, paymentIntentId });
    setChosen(null);
    setPromoCode("");
    queryClient.invalidateQueries({ queryKey: ["membership", "mine"] });
  };

  return (
    <section className="section">
      <span className="eyebrow">Cinego members</span>
      <h1 className="page-title">More cinema. More rewards.</h1>

      {signedIn === false && (
        <div className="notice">
          <Link to="/account">Sign in</Link> to join Cinego+ — membership is
          tied to your account so it's there whenever you come back.
        </div>
      )}
      {signedIn === true && mine.data && (
        <div className="notice">
          You're on the <strong>{mine.data.plan}</strong> plan, active since{" "}
          {new Date(mine.data.createdAt).toLocaleDateString()}.
        </div>
      )}

      {plans.isLoading ? (
        <div className="empty">Loading plans…</div>
      ) : (
        <div className="plan-grid">
          {plans.data?.map((plan) => (
            <article
              className={`plan card${plan.style ? ` ${plan.style}` : ""}`}
              key={plan.id}
            >
              {plan.tag && <span className="plan-tag">{plan.tag}</span>}
              <h2>{plan.name}</h2>
              <strong>
                {money(plan.pricePence)} <small>/ month</small>
              </strong>
              <ul>
                {plan.perks.map((perk) => (
                  <li key={perk}>{perk}</li>
                ))}
              </ul>
              <button
                className="button"
                disabled={!signedIn}
                onClick={() => setChosen(plan)}
              >
                {signedIn ? `Choose ${plan.name}` : "Sign in to join"}
              </button>
            </article>
          ))}
        </div>
      )}
      {chosen && (
        <div className={`modal${chosenClosing ? " is-closing" : ""}`}>
          <PaymentForm
            clientSecret={paymentIntent.data?.clientSecret ?? null}
            amountPence={paymentIntent.data?.amountPence ?? chosen.pricePence}
            label={`Join ${chosen.name}`}
            onSuccess={pay}
            onCancel={closeChosen}
          >
            <label>
              Promo code (optional)
              <input
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                placeholder="e.g. WELCOME10"
              />
            </label>
            {paymentIntent.isError && (
              <p className="error">{(paymentIntent.error as Error).message}</p>
            )}
            {!!paymentIntent.data?.discountPence && (
              <p className="notice">
                Promo applied: −{money(paymentIntent.data.discountPence)}
              </p>
            )}
          </PaymentForm>
        </div>
      )}
    </section>
  );
}
