import { z } from "zod";
import type {
  Booking,
  Membership,
  MembershipPlan,
  Movie,
  Offer,
  PaymentIntentResponse,
  Reservation,
  Screening,
  Trailer,
} from "../types";
import { supabase } from "./supabase";
const json = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(body.error || `Request failed (${response.status})`);
  return body as T;
};
const authHeaders = async (): Promise<Record<string, string>> => {
  const session = await supabase?.auth.getSession();
  const token = session?.data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};
export const api = {
  movies: () => json<Movie[]>("/api/movies/now-playing"),
  upcoming: () => json<Movie[]>("/api/movies/upcoming"),
  trailers: () => json<Trailer[]>("/api/movies/trailers"),
  screenings: (params: URLSearchParams) =>
    json<Screening[]>(`/api/screenings?${params}`),
  advanceScreenings: (params: URLSearchParams) =>
    json<Screening[]>(`/api/screenings/upcoming?${params}`),
  seats: (screeningId: string) => json(`/api/screenings/${screeningId}/seats`),
  reserve: (body: unknown) =>
    json<Reservation>("/api/reservations", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  createPaymentIntent: (reservationId: string, email: string, promoCode?: string) =>
    json<PaymentIntentResponse>(
      `/api/reservations/${reservationId}/payment-intent`,
      { method: "POST", body: JSON.stringify({ email, promoCode }) },
    ),
  pay: (body: { reservationId: string; email: string; paymentIntentId: string }) =>
    json<Booking>("/api/bookings/confirm", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  emailTicket: (reference: string) =>
    json<{ status: string; previewUrl?: string }>(
      `/api/tickets/${reference}/email`,
      { method: "POST" },
    ),
  ticketData: (reference: string) =>
    json<{ token: string; qrDataUrl: string }>(
      `/api/tickets/${reference}/data`,
    ),
  resendTicket: (reference: string) =>
    json<{ status: string; previewUrl?: string }>(
      `/api/tickets/${reference}/resend`,
      { method: "POST" },
    ),
  membershipPlans: () => json<MembershipPlan[]>("/api/memberships/plans"),
  membershipPaymentIntent: async (plan: string, promoCode?: string) =>
    json<PaymentIntentResponse>("/api/memberships/payment-intent", {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ plan, promoCode }),
    }),
  membershipPay: async (body: { plan: string; paymentIntentId: string }) =>
    json<Membership>("/api/memberships/checkout", {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify(body),
    }),
  myMembership: async () =>
    json<Membership | null>("/api/memberships/mine", {
      headers: await authHeaders(),
    }),
  activeOffers: () => json<Offer[]>("/api/offers/active"),
};
export const emailSchema = z.string().email();
export const money = (pence: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    pence / 100,
  );
export const poster = (path: string | null, width = 500) =>
  path ? `https://image.tmdb.org/t/p/w${width}${path}` : "/cinego-mark.svg";
