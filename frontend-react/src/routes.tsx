import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from "@tanstack/react-router";
// Heavier pages (Stripe checkout, account) load on demand.
import { Shell } from "./Shell";
import { Home } from "./pages/Home";
import { Movies } from "./pages/Movies";
import { AuthCallback } from "./pages/AuthCallback";
import { NotFound } from "./pages/NotFound";

const rootRoute = createRootRoute({
  component: Shell,
  notFoundComponent: NotFound,
});
const trailersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/trailers",
  component: lazyRouteComponent(() => import("./pages/Trailers"), "Trailers"),
});
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Home,
});
export const moviesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/movies",
  validateSearch: (s: Record<string, unknown>): { movie?: string } => ({
    movie: typeof s.movie === "string" ? s.movie : "",
  }),
  component: Movies,
});
export const filmRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/film/$id",
  component: lazyRouteComponent(() => import("./pages/Film"), "Film"),
});
const premiumRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/premium",
  component: lazyRouteComponent(() => import("./pages/Premium"), "Premium"),
});
export const bookingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/booking",
  validateSearch: (s: Record<string, unknown>) => ({
    screening: String(s.screening || ""),
  }),
  component: lazyRouteComponent(() => import("./pages/Booking"), "Booking"),
});
const membershipRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/membership",
  component: lazyRouteComponent(
    () => import("./pages/Membership"),
    "Membership",
  ),
});
export const confirmationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/confirmation",
  validateSearch: (s: Record<string, unknown>) => ({
    reference: String(s.reference || ""),
  }),
  component: lazyRouteComponent(
    () => import("./pages/Confirmation"),
    "Confirmation",
  ),
});
const foodRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/food",
  component: lazyRouteComponent(() => import("./pages/Food"), "Food"),
});
const comingSoonRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/coming-soon",
  component: lazyRouteComponent(
    () => import("./pages/ComingSoon"),
    "ComingSoon",
  ),
});
const accountTabs = [
  "tickets",
  "membership",
  "payments",
  "verification",
  "profile",
] as const;
export type AccountTab = (typeof accountTabs)[number];
export const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/account",
  validateSearch: (s: Record<string, unknown>): { tab?: AccountTab } => ({
    tab: accountTabs.includes(s.tab as AccountTab)
      ? (s.tab as AccountTab)
      : undefined,
  }),
  component: lazyRouteComponent(() => import("./pages/Account"), "Account"),
});
const authCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/callback",
  component: AuthCallback,
});
const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/privacy",
  component: lazyRouteComponent(() => import("./pages/Legal"), "Privacy"),
});
const termsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/terms",
  component: lazyRouteComponent(() => import("./pages/Legal"), "Terms"),
});
const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: lazyRouteComponent(() => import("./pages/Admin"), "Admin"),
});
const routeTree = rootRoute.addChildren([
  indexRoute,
  moviesRoute,
  filmRoute,
  premiumRoute,
  bookingRoute,
  membershipRoute,
  confirmationRoute,
  foodRoute,
  comingSoonRoute,
  accountRoute,
  authCallbackRoute,
  trailersRoute,
  privacyRoute,
  termsRoute,
  adminRoute,
]);
export const router = createRouter({ routeTree });
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
