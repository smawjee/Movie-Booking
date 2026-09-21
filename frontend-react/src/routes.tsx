import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { Shell } from "./Shell";
import { Home } from "./pages/Home";
import { Movies } from "./pages/Movies";
import { Premium } from "./pages/Premium";
import { Booking } from "./pages/Booking";
import { Membership } from "./pages/Membership";
import { Confirmation } from "./pages/Confirmation";
import { Food } from "./pages/Food";
import { ComingSoon } from "./pages/ComingSoon";
import { Account } from "./pages/Account";
import { AuthCallback } from "./pages/AuthCallback";

const rootRoute = createRootRoute({ component: Shell });
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
const premiumRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/premium",
  component: Premium,
});
export const bookingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/booking",
  validateSearch: (s: Record<string, unknown>) => ({
    screening: String(s.screening || ""),
  }),
  component: Booking,
});
const membershipRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/membership",
  component: Membership,
});
export const confirmationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/confirmation",
  validateSearch: (s: Record<string, unknown>) => ({
    reference: String(s.reference || ""),
  }),
  component: Confirmation,
});
const foodRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/food",
  component: Food,
});
const comingSoonRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/coming-soon",
  component: ComingSoon,
});
const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/account",
  component: Account,
});
const authCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/callback",
  component: AuthCallback,
});
const routeTree = rootRoute.addChildren([
  indexRoute,
  moviesRoute,
  premiumRoute,
  bookingRoute,
  membershipRoute,
  confirmationRoute,
  foodRoute,
  comingSoonRoute,
  accountRoute,
  authCallbackRoute,
]);
export const router = createRouter({ routeTree });
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
