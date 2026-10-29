import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router } from "./routes";
import { supabase } from "./lib/supabase";
import "./styles.css";
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
});
// Account data (profile, admin flag, membership) belongs to one user: drop it
// whenever the signed-in user changes, including sign-out and expiry.
let currentUser: string | null | undefined;
supabase?.auth.onAuthStateChange((_event, session) => {
  const next = session?.user.id ?? null;
  if (currentUser !== undefined && next !== currentUser)
    for (const key of ["account", "membership", "admin"])
      queryClient.removeQueries({ queryKey: [key] });
  currentUser = next;
});
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
