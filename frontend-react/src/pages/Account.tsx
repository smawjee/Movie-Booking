import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AccountPanel } from "../components/AccountPanel";
import { MyTickets } from "../components/account/MyTickets";
import { MembershipManager } from "../components/account/MembershipManager";
import { PaymentMethods } from "../components/account/PaymentMethods";
import { Verification } from "../components/account/Verification";
import { ProfileSettings } from "../components/account/ProfileSettings";
import { account } from "../lib/api";
import { useProfile, useSession } from "../lib/hooks";
import { accountRoute, type AccountTab } from "../routes";

const tabs: { id: AccountTab; label: string }[] = [
  { id: "tickets", label: "Tickets" },
  { id: "membership", label: "Membership" },
  { id: "payments", label: "Payment methods" },
  { id: "verification", label: "Verification" },
  { id: "profile", label: "Profile" },
];

export function Account() {
  const session = useSession();
  const { tab } = accountRoute.useSearch();
  const navigate = accountRoute.useNavigate();
  const queryClient = useQueryClient();
  const profile = useProfile(Boolean(session));
  const synced = useRef(false);

  // The sign-up form stores name + DOB in auth metadata (the user has no
  // session until they confirm their email); copy them into the profile the
  // first time they sign in.
  useEffect(() => {
    const meta = session?.user.user_metadata;
    if (!profile.data || synced.current || !meta) return;
    const missing = {
      ...(!profile.data.fullName && meta.full_name && { fullName: meta.full_name }),
      ...(!profile.data.dateOfBirth &&
        meta.date_of_birth && { dateOfBirth: meta.date_of_birth }),
    };
    synced.current = true;
    if (Object.keys(missing).length)
      account
        .updateProfile(missing)
        .then((data) => queryClient.setQueryData(["account", "profile"], data))
        .catch(() => undefined);
  }, [profile.data, session, queryClient]);

  if (session === undefined)
    return <section className="section narrow empty">Loading…</section>;
  if (!session)
    return (
      <section className="section narrow">
        <span className="eyebrow">Your Cinego</span>
        <h1 className="page-title">Account</h1>
        <AccountPanel />
      </section>
    );
  const active = tab || "tickets";
  const name = profile.data?.fullName?.split(" ")[0];
  return (
    <section className="section account-page">
      <span className="eyebrow">Your Cinego</span>
      <h1 className="page-title">{name ? `Hi, ${name}.` : "Your account."}</h1>
      {profile.data && !profile.data.dateOfBirth && (
        <p className="notice">
          Add your date of birth in{" "}
          <button className="text-button" onClick={() => navigate({ search: { tab: "profile" } })}>
            Profile
          </button>{" "}
          so we can check age ratings when you book.
        </p>
      )}
      <div className="segmented account-tabs" role="tablist" aria-label="Account sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={active === t.id}
            className={active === t.id ? "active" : undefined}
            onClick={() => navigate({ search: { tab: t.id }, replace: true })}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {active === "tickets" && <MyTickets email={session.user.email} />}
        {active === "membership" && <MembershipManager />}
        {active === "payments" && <PaymentMethods />}
        {(active === "verification" || active === "profile") &&
          (profile.isLoading ? (
            <div className="empty">Loading profile…</div>
          ) : profile.isError ? (
            <div className="empty" role="alert">
              {(profile.error as Error).message}
            </div>
          ) : active === "verification" ? (
            <Verification profile={profile.data!} />
          ) : (
            <ProfileSettings key={profile.data!.dateOfBirth} profile={profile.data!} />
          ))}
      </div>
    </section>
  );
}
