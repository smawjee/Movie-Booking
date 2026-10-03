import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, money } from "../lib/api";
import {
  useMembershipPaymentIntent,
  useMyMembership,
  useProfile,
  useSession,
} from "../lib/hooks";
import type { MembershipPlan } from "../types";
import { PaymentForm } from "../components/PaymentForm";
import { useDelayedClose } from "../lib/useDelayedClose";

export function Membership() {
  const queryClient = useQueryClient();
  const session = useSession();
  const signedIn = session === undefined ? null : Boolean(session);
  const profile = useProfile(signedIn === true);
  const isStudent = profile.data?.student.status === "verified";

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
        <div className="notice membership-notice">
          <p>
            You're on the <strong>{mine.data.plan}</strong> plan
            {mine.data.status === "cancelled" && mine.data.renewsAt
              ? `, cancelled — benefits continue until ${new Date(mine.data.renewsAt).toLocaleDateString("en-GB")}`
              : `, active since ${new Date(mine.data.createdAt).toLocaleDateString("en-GB")}`}
            .
          </p>
          <Link to="/account" search={{ tab: "membership" }}>
            Manage or cancel membership
          </Link>
        </div>
      )}

      {plans.isLoading ? (
        <div className="empty">Loading plans…</div>
      ) : (
        <div className="plan-grid">
          {plans.data?.map((plan) => {
            const isCurrent = mine.data?.plan === plan.id;
            return (
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
                {plan.requiresStudent && signedIn && !isStudent ? (
                  <Link
                    to="/account"
                    search={{ tab: "verification" }}
                    className="button secondary"
                  >
                    Verify student status to join
                  </Link>
                ) : (
                  <button
                    className="button"
                    disabled={!signedIn || isCurrent}
                    onClick={() => setChosen(plan)}
                  >
                    {!signedIn
                      ? "Sign in to join"
                      : isCurrent
                        ? "Current plan"
                        : mine.data
                          ? `Switch to ${plan.name}`
                          : `Choose ${plan.name}`}
                  </button>
                )}
                {plan.requiresStudent && (
                  <small className="muted">
                    Verified students only. Not a member? Verified students
                    still get 25% off every ticket.
                  </small>
                )}
              </article>
            );
          })}
        </div>
      )}
      {chosen && (
        <div className={`modal${chosenClosing ? " is-closing" : ""}`}>
          <PaymentForm
            clientSecret={paymentIntent.data?.clientSecret ?? null}
            customerSessionClientSecret={paymentIntent.data?.customerSessionClientSecret}
            amountPence={paymentIntent.data?.amountPence ?? chosen.pricePence}
            label={mine.data ? `Switch to ${chosen.name}` : `Join ${chosen.name}`}
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
