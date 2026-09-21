import { useState } from "react";
import { Tag, X } from "lucide-react";
import { useActiveOffers } from "../lib/hooks";

export function OffersBanner() {
  const offers = useActiveOffers();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || !offers.data?.length) return null;
  return (
    <div className="offers-banner">
      <Tag size={15} aria-hidden="true" />
      <p>
        {offers.data
          .map((o) => `${o.description} — use code ${o.code}`)
          .join("  ·  ")}
      </p>
      <button
        type="button"
        aria-label="Dismiss offers"
        onClick={() => setDismissed(true)}
      >
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
