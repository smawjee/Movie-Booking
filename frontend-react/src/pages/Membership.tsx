import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, money } from "../lib/api";
import { useMembershipPaymentIntent } from "../lib/hooks";
import type { MembershipPlan } from "../types";
import { PaymentForm } from "../components/PaymentForm";

export function Membership() {
  const plans = useQuery({
    queryKey: ["membership-plans"],
    queryFn: api.membershipPlans,
  });
  const [chosen, setChosen] = useState<MembershipPlan | null>(null);
  const paymentIntent = useMembershipPaymentIntent(chosen?.id ?? null);
  const pay = async (paymentIntentId: string) => {
    if (!chosen) return;
    await api.membershipPay({ plan: chosen.id, paymentIntentId });
    setChosen(null);
    alert("Membership activated");
  };
  return (
    <section className="section">
      <span className="eyebrow">Cinego members</span>
      <h1 className="page-title">More cinema. More rewards.</h1>
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
              <button className="button" onClick={() => setChosen(plan)}>
                Choose {plan.name}
              </button>
            </article>
          ))}
        </div>
      )}
      {chosen && (
        <div className="modal">
          <PaymentForm
            clientSecret={paymentIntent.data?.clientSecret ?? null}
            amountPence={chosen.pricePence}
            label={`Join ${chosen.name}`}
            onSuccess={pay}
            onCancel={() => setChosen(null)}
          />
        </div>
      )}
    </section>
  );
}
