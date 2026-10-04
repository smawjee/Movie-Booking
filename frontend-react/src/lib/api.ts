import { z } from "zod";
import type {
  Booking,
  Membership,
  MembershipPlan,
  Movie,
  Offer,
  PaymentIntentResponse,
  Profile,
  Reservation,
  SavedCard,
  Screening,
  Trailer,
  DocumentMeta,
} from "../types";
import { supabase } from "./supabase";
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}
const json = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      body.error || `Request failed (${response.status})`,
      response.status,
      body.code,
    );
  return body as T;
};
const authHeaders = async (): Promise<Record<string, string>> => {
  const session = await supabase?.auth.getSession();
  const token = session?.data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};
/** JSON request with the signed-in user's token attached, when there is one. */
const authed = async <T>(url: string, init: RequestInit = {}) =>
  json<T>(url, {
    ...init,
    headers: { ...(await authHeaders()), ...(init.headers || {}) },
  });
const post = (body?: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body ?? {}),
});
export const account = {
  profile: () => authed<Profile>("/api/account/profile"),
  updateProfile: (body: { fullName?: string; dateOfBirth?: string }) =>
    authed<Profile>("/api/account/profile", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  bookings: () => authed<Booking[]>("/api/account/bookings"),
  cards: () =>
    authed<{ cards: SavedCard[]; defaultId: string | null }>(
      "/api/account/payment-methods",
    ),
  cardSetupIntent: () =>
    authed<{ clientSecret: string }>(
      "/api/account/payment-methods/setup-intent",
      post(),
    ),
  removeCard: (id: string) =>
    authed(`/api/account/payment-methods/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  setDefaultCard: (id: string) =>
    authed(`/api/account/payment-methods/${encodeURIComponent(id)}/default`, post()),
  verifyIdentity: (body: {
    documentType: "passport" | "driving_licence" | "national_id";
    dateOfBirth: string;
    document: DocumentMeta;
  }) =>
    authed<{ status: string; reviewMs: number }>(
      "/api/verification/identity",
      post(body),
    ),
  studentStart: (body: { studentEmail: string; institution: string }) =>
    authed<{ status: string; sentTo: string; demoCode?: string }>(
      "/api/verification/student/start",
      post(body),
    ),
  studentConfirm: (body: { code: string; document: DocumentMeta }) =>
    authed<{ status: string; reviewMs: number }>(
      "/api/verification/student/confirm",
      post(body),
    ),
};
export const api = {
  booking: (reference: string) =>
    json<Booking>(`/api/bookings/${encodeURIComponent(reference)}`),
  downloadTicket: async (reference: string) => {
    const response = await fetch(
      `/api/tickets/${encodeURIComponent(reference)}/download`,
    );
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(
        body.error || "Ticket download failed. Please try again.",
      );
    }
    const blob = await response.blob();
    if (!blob.type.includes("application/pdf"))
      throw new Error("The server did not return a PDF ticket.");
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `cinego-${reference}.pdf`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },
  movies: () => json<Movie[]>("/api/movies/now-playing"),
  showing: (cinema: string) =>
    json<Movie[]>(`/api/movies/showing?cinema=${encodeURIComponent(cinema)}`),
  upcoming: () => json<Movie[]>("/api/movies/upcoming"),
  trailers: () => json<Trailer[]>("/api/movies/trailers"),
  screenings: (params: URLSearchParams) =>
    json<Screening[]>(`/api/screenings?${params}`),
  advanceScreenings: (params: URLSearchParams) =>
    json<Screening[]>(`/api/screenings/upcoming?${params}`),
  seats: (screeningId: string) => json(`/api/screenings/${screeningId}/seats`),
  reserve: (body: unknown) => authed<Reservation>("/api/reservations", post(body)),
  createPaymentIntent: (
    reservationId: string,
    email: string,
    promoCode?: string,
  ) =>
    authed<PaymentIntentResponse>(
      `/api/reservations/${reservationId}/payment-intent`,
      post({ email, promoCode }),
    ),
  confirmFree: (reservationId: string, email: string, promoCode?: string) =>
    authed<Booking>(
      `/api/reservations/${reservationId}/confirm-free`,
      post({ email, promoCode }),
    ),
  pay: (body: {
    reservationId: string;
    email: string;
    paymentIntentId: string;
  }) =>
    json<Booking>("/api/bookings/confirm", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  emailTicket: (reference: string, to?: string) =>
    json<{ status: string; previewUrl?: string }>(
      `/api/tickets/${encodeURIComponent(reference)}/email`,
      { method: "POST", body: JSON.stringify(to ? { to } : {}) },
    ),
  ticketData: (reference: string) =>
    json<{ token: string; qrDataUrl: string }>(
      `/api/tickets/${reference}/data`,
    ),
  resendTicket: (reference: string, to?: string) =>
    json<{ status: string; previewUrl?: string }>(
      `/api/tickets/${encodeURIComponent(reference)}/resend`,
      { method: "POST", body: JSON.stringify(to ? { to } : {}) },
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
  cancelMembership: async () =>
    json<{ cancelled: boolean; accessUntil: string | null }>(
      "/api/memberships/cancel",
      { method: "POST", headers: await authHeaders() },
    ),
  resumeMembership: () => authed<Membership>("/api/memberships/resume", post()),
  activeOffers: () => json<Offer[]>("/api/offers/active"),
};
export const emailSchema = z.string().email();
/** "2026-10-04" -> "Sun 4 Oct 2026". Screening dates are calendar dates, so
 *  format them in UTC to avoid shifting a day in other timezones. */
export const showDate = (iso: string) => {
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(date.valueOf())
    ? iso
    : date.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
};
export const money = (pence: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    pence / 100,
  );
export const poster = (path: string | null, width = 500) =>
  path ? `https://image.tmdb.org/t/p/w${width}${path}` : "/cinego-mark.svg";
