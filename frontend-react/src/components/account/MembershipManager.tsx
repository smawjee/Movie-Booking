import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, money } from "../../lib/api";
import { useMyMembership } from "../../lib/hooks";

const fmt = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";

export function MembershipManager() {
  const queryClient = useQueryClient();
  const mine = useMyMembership(true);
  const plans = useQuery({ queryKey: ["membership-plans"], queryFn: api.membershipPlans });
  const [confirming, setConfirming] = useState(false);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["membership", "mine"] });
  const cancel = useMutation({
    mutationFn: api.cancelMembership,
    onSuccess: () => {
      setConfirming(false);
      void refresh();
    },
  });
  const resume = useMutation({ mutationFn: api.resumeMembership, onSuccess: refresh });
  if (mine.isLoading) return <div className="empty">Loading membership…</div>;
  const membership = mine.data;
  const plan = plans.data?.find((p) => p.id === membership?.plan);
  const error = cancel.error || resume.error || mine.error;
  return (
    <div className="account-section">
      <div className="section-head">
        <h2>Membership</h2>
      </div>
      {error && (
        <p className="error" role="alert">
          {(error as Error).message}
        </p>
      )}
      {!membership ? (
        <div className="empty">
          You don’t have a membership.{" "}
          <Link to="/membership">Compare Cinego+ plans</Link>
        </div>
      ) : (
        <article className="card membership-card">
          <div className="membership-card-head">
            <div>
              <span className="plan-tag">{plan?.name || membership.plan}</span>
              <h3>{plan ? `${money(plan.pricePence)} / month` : "Cinego+"}</h3>
            </div>
            <span className={`status-pill ${membership.status === "active" ? "verified" : "pending"}`}>
              {membership.status === "active" ? "Active" : "Cancels soon"}
            </span>
          </div>
          <dl className="facts">
            <div>
              <dt>Member since</dt>
              <dd>{fmt(membership.createdAt)}</dd>
            </div>
            <div>
              <dt>{membership.status === "active" ? "Renews on" : "Benefits end on"}</dt>
              <dd>{fmt(membership.renewsAt)}</dd>
            </div>
          </dl>
          {plan && (
            <ul className="perk-list">
              {plan.perks.map((perk) => (
                <li key={perk}>{perk}</li>
              ))}
            </ul>
          )}
          {membership.status === "cancelled" ? (
            <>
              <p className="notice">
                Your membership is cancelled. You keep every benefit until{" "}
                {fmt(membership.renewsAt)}, and won’t be charged again.
              </p>
              <button
                className="button"
                disabled={resume.isPending}
                onClick={() => resume.mutate()}
              >
                {resume.isPending ? "Resuming…" : "Resume membership"}
              </button>
            </>
          ) : confirming ? (
            <div className="confirm-box" role="alertdialog" aria-label="Cancel membership">
              <p>
                Cancel your {plan?.name} membership? You’ll keep your benefits
                until {fmt(membership.renewsAt)} and won’t be charged again.
                You can resume any time before then.
              </p>
              <div className="ticket-actions">
                <button
                  className="button danger"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate()}
                >
                  {cancel.isPending ? "Cancelling…" : "Yes, cancel membership"}
                </button>
                <button className="button secondary" onClick={() => setConfirming(false)}>
                  Keep membership
                </button>
              </div>
            </div>
          ) : (
            <div className="ticket-actions">
              <Link to="/membership" className="button secondary">
                Switch plan
              </Link>
              <button className="text-button danger" onClick={() => setConfirming(true)}>
                Cancel membership
              </button>
            </div>
          )}
        </article>
      )}
    </div>
  );
}
