import { X } from "lucide-react";
import { useDelayedClose } from "../lib/useDelayedClose";

export function TrailerModal({
  trailerUrl,
  title,
  onClose,
}: {
  trailerUrl: string;
  title: string;
  onClose: () => void;
}) {
  const { closing, close } = useDelayedClose(onClose);
  return (
    <div className={`modal${closing ? " is-closing" : ""}`} onClick={close}>
      <div className="trailer-frame" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="payment-close"
          onClick={close}
          aria-label="Close trailer"
        >
          <X size={20} aria-hidden="true" />
        </button>
        <iframe
          src={`${trailerUrl}?autoplay=1`}
          title={`${title} trailer`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );
}
