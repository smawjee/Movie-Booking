import { useEffect, useRef, useState } from "react";

// Must match --duration-modal in styles.css — the CSS exit transition this
// delay is waiting out.
const MODAL_CLOSE_MS = 260;

export function useDelayedClose(onClosed: () => void, duration = MODAL_CLOSE_MS) {
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const close = () => {
    if (timer.current) return;
    setClosing(true);
    timer.current = setTimeout(onClosed, duration);
  };
  return { closing, close };
}
