export type ExperienceId =
  "standard" | "3d" | "imax" | "dolby" | "4dx" | "screenx";
export interface Movie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  rating: string;
  genre_ids: number[];
  runtime: number;
  language: string;
  release_date?: string;
}
export interface Experience {
  id: ExperienceId;
  name: string;
  description: string;
  surchargePence: number;
  warning?: string;
}
export interface Screening {
  id: string;
  movieId: number;
  movieTitle: string;
  posterPath: string | null;
  cinema: string;
  date: string;
  time: string;
  screen: number;
  experience: Experience;
  pricePence: number;
  rating: string;
  runtime: number;
  language: string;
}
export interface Seat {
  id: string;
  row: string;
  number: number;
  tier: "standard" | "premium";
  pricePence: number;
  available: boolean;
}
export interface PaymentSummary {
  reference: string;
  brand: string;
  last4: string;
  amountPence: number;
  status: "paid";
  createdAt: string;
  stripePaymentIntentId?: string;
}
export interface Reservation {
  id: string;
  screeningId: string;
  seatIds: string[];
  ageConfirmation: AgeConfirmation;
  expiresAt: string;
  status: "held";
}
export interface MembershipPlan {
  id: "silver" | "gold" | "platinum";
  name: string;
  pricePence: number;
  discountPercent: number;
  tag?: string;
  style?: "featured" | "premium";
  perks: string[];
}
export interface Membership {
  id: string;
  plan: "silver" | "gold" | "platinum";
  status: "active" | "cancelled";
  renewsAt: string | null;
  createdAt: string;
}
export interface Trailer {
  id: number;
  title: string;
  trailerKey: string;
  trailerUrl: string;
  rating: string;
}
export interface Offer {
  code: string;
  description: string;
  discountPercent: number;
}
export interface PaymentIntentResponse {
  clientSecret: string;
  amountPence: number;
  discountPence: number;
  customerSessionClientSecret?: string | null;
}
export interface AgeConfirmation {
  rating: string;
  ageBand: "under-12" | "12-14" | "15-17" | "18-plus";
  declared: boolean;
  policyVersion: "uk-2026-1";
  confirmedAt: string;
}
export interface Booking {
  reference: string;
  screening: Screening;
  seats: Seat[];
  email: string;
  totalPence: number;
  payment: PaymentSummary;
  ageConfirmation: AgeConfirmation;
  emailDelivery?: {
    status: "queued" | "sent" | "preview" | "failed";
    previewUrl?: string;
  };
}
export interface BookingDraft {
  id: string;
  screening?: Screening;
  ticketCount: number;
  createdBy: "assistant" | "user";
}
