import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export function useReservationPaymentIntent(
  reservationId: string | null,
  email: string,
  promoCode?: string,
) {
  return useQuery({
    queryKey: ["payment-intent", "reservation", reservationId, promoCode || ""],
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
