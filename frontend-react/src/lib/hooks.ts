import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export function useReservationPaymentIntent(
  reservationId: string | null,
  email: string,
) {
  return useQuery({
    queryKey: ["payment-intent", "reservation", reservationId],
    queryFn: () => api.createPaymentIntent(reservationId as string, email),
    enabled: Boolean(reservationId && email),
    staleTime: Infinity,
    retry: false,
  });
}

export function useMembershipPaymentIntent(plan: string | null) {
  return useQuery({
    queryKey: ["payment-intent", "membership", plan],
    queryFn: () => api.membershipPaymentIntent(plan as string),
    enabled: Boolean(plan),
    staleTime: Infinity,
    retry: false,
  });
}
