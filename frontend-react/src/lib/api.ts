import { z } from "zod";
import type { Booking, Movie, Screening } from "../types";
const json = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(body.error || `Request failed (${response.status})`);
  return body as T;
};
export const api = {
  movies: () => json<Movie[]>("/api/movies/now-playing"),
  upcoming: () => json<Movie[]>("/api/movies/upcoming"),
  screenings: (params: URLSearchParams) =>
    json<Screening[]>(`/api/screenings?${params}`),
  seats: (screeningId: string) => json(`/api/screenings/${screeningId}/seats`),
  reserve: (body: unknown) =>
    json("/api/reservations", { method: "POST", body: JSON.stringify(body) }),
  pay: (body: unknown) =>
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
  membershipPay: (body: unknown) =>
    json("/api/memberships/checkout", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
export const emailSchema = z.string().email();
export const money = (pence: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    pence / 100,
  );
export const poster = (path: string | null, width = 500) =>
  path ? `https://image.tmdb.org/t/p/w${width}${path}` : "/cinego-mark.svg";
