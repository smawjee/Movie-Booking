import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

/** Every Cinego location, as served by /api/cinemas. */
export function useCinemas() {
  return useQuery({
    queryKey: ["cinemas"],
    queryFn: api.cinemas,
    staleTime: Infinity,
  });
}

export function CinemaSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (slug: string) => void;
}) {
  const cinemas = useCinemas();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {(cinemas.data || [{ slug: value, city: "Loading…" }]).map((c) => (
        <option key={c.slug} value={c.slug}>
          {c.city}
        </option>
      ))}
    </select>
  );
}

/** Looks up a cinema by slug, e.g. for a booking's "edinburgh". */
export function useCinemaLookup() {
  const cinemas = useCinemas();
  return (slug: string) => cinemas.data?.find((c) => c.slug === slug);
}
