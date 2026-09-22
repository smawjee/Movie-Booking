import { useState } from "react";
import { Tag, X } from "lucide-react";
import { useActiveOffers } from "../lib/hooks";
import { useDelayedClose } from "../lib/useDelayedClose";

export function OffersBanner() {
  const offers = useActiveOffers();
  const [dismissed, setDismissed] = useState(false);
  const { closing, close: dismiss } = useDelayedClose(() => setDismissed(true));
  if (dismissed || (!offers.data?.length && !closing)) return null;
  return (
    <div className={`offers-banner${closing ? " is-closing" : ""}`}>
      <Tag size={15} aria-hidden="true" />
      <p>
        {(offers.data ?? [])
          .map((o) => `${o.description} — use code ${o.code}`)
          .join("  ·  ")}
      </p>
      <button type="button" aria-label="Dismiss offers" onClick={dismiss}>
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
