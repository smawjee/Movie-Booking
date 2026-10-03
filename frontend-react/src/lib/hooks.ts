import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { account, api } from "./api";
import { supabase, supabaseConfigured } from "./supabase";

/** Current Supabase session: undefined while loading, null when signed out. */
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(
    supabaseConfigured ? undefined : null,
  );
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const listener = supabase.auth.onAuthStateChange((_event, next) =>
      setSession(next),
    );
    return () => listener.data.subscription.unsubscribe();
  }, []);
  return session;
}

export function useProfile(enabled: boolean) {
  return useQuery({
    queryKey: ["account", "profile"],
    queryFn: account.profile,
    enabled,
    retry: false,
    // Simulated document reviews settle a few seconds after submission.
    refetchInterval: (query) => {
      const p = query.state.data;
      return p?.identity.status === "pending" || p?.student.status === "pending"
        ? 1500
        : false;
    },
  });
}

export function useMyBookings(enabled: boolean) {
  return useQuery({
    queryKey: ["account", "bookings"],
    queryFn: account.bookings,
    enabled,
  });
}

export function useSavedCards(enabled: boolean) {
  return useQuery({
    queryKey: ["account", "cards"],
    queryFn: account.cards,
    enabled,
    retry: false,
  });
}

export function useReservationPaymentIntent(
  reservationId: string | null,
  email: string,
  promoCode?: string,
) {
  return useQuery({
    queryKey: ["payment-intent", "reservation", reservationId, email, promoCode || ""],
    queryFn: () =>
      api.createPaymentIntent(reservationId as string, email, promoCode),
    enabled: Boolean(reservationId && email),
    staleTime: Infinity,
    retry: false,
  });
}

export function useMembershipPaymentIntent(
  plan: string | null,
  promoCode?: string,
) {
  return useQuery({
    queryKey: ["payment-intent", "membership", plan, promoCode || ""],
    queryFn: () => api.membershipPaymentIntent(plan as string, promoCode),
    enabled: Boolean(plan),
    staleTime: Infinity,
    retry: false,
  });
}

export function useMyMembership(enabled: boolean) {
  return useQuery({
    queryKey: ["membership", "mine"],
    queryFn: api.myMembership,
    enabled,
    retry: false,
  });
}

export function useTrailers() {
  return useQuery({
    queryKey: ["trailers"],
    queryFn: api.trailers,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useActiveOffers() {
  return useQuery({
    queryKey: ["offers", "active"],
    queryFn: api.activeOffers,
    staleTime: 5 * 60 * 1000,
  });
}
