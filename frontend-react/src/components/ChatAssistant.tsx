import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles, RotateCcw, Ticket, X } from "lucide-react";
import { useDelayedClose } from "../lib/useDelayedClose";
type Tag = { screening: string; label: string };
type Message = {
  role: "user" | "assistant";
  text: string;
  tags?: Record<string, Tag>;
};
const starters = [
  "What's good for a family tomorrow?",
  "Anything scary tonight?",
  "What's on in IMAX this weekend?",
  "Which membership saves me most?",
  "Films with subtitles in Glasgow",
];
const TAG = /\[\[book:(S\d+)\]\]/g;

/** **bold** spans within a line. */
const inline = (text: string) =>
  text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    );

/** Renders a reply: bullet lists, bold, and booking tags as Book buttons.
 *  A tag still being streamed ("[[bo…") is held back until it completes. */
function Reply({
  message,
  onNavigate,
}: {
  message: Message;
  onNavigate: () => void;
}) {
  const text = message.text.replace(/\[\[[^\]]*$/, "");
  const blocks: ReactNode[] = [];
  let bullets: ReactNode[] = [];
  const flush = () => {
    if (bullets.length) blocks.push(<ul key={blocks.length}>{bullets}</ul>);
    bullets = [];
  };
  text.split("\n").forEach((line, i) => {
    const bullet = /^\s*[-•*]\s+/.test(line);
    const parts = line.replace(/^\s*[-•*]\s+/, "").split(TAG);
    const content = parts.map((part, j) => {
      if (j % 2 === 0) return <Fragment key={j}>{inline(part)}</Fragment>;
      const tag = message.tags?.[part];
      return tag ? (
        <Link
          key={j}
          className="chat-book"
          to="/booking"
          search={{ screening: tag.screening }}
          onClick={onNavigate}
        >
          <Ticket size={13} aria-hidden="true" /> Book {tag.label}
        </Link>
      ) : null;
    });
    if (bullet) bullets.push(<li key={i}>{content}</li>);
    else {
      flush();
      if (line.trim()) blocks.push(<p key={`p${i}`}>{content}</p>);
    }
  });
  flush();
  return <>{blocks}</>;
}

export function ChatAssistant() {
  const greeting: Message = {
    role: "assistant",
    text: "Hi, I’m Cinebot. Ask me what’s on, what suits your plans, or how to save, and I’ll line up seats to book.",
  };
  const [open, setOpen] = useState(false),
    [input, setInput] = useState(""),
    [messages, setMessages] = useState<Message[]>([greeting]),
    [busy, setBusy] = useState(false),
    [waiting, setWaiting] = useState(false);
  const { closing, close } = useDelayedClose(() => setOpen(false));
  const scroller = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, waiting, open]);
  useEffect(() => () => abort.current?.abort(), []);
  const updateLast = (change: (m: Message) => Message) =>
    setMessages((current) =>
      current.map((m, i) => (i === current.length - 1 ? change(m) : m)),
    );
  const send = async (text = input) => {
    if (!text.trim() || busy) return;
    // Booking tags are numbered per reply, so they're dropped from history.
    const history = messages
      .slice(1)
      .slice(-10)
      .map((m) => ({
        role: m.role,
        text: m.text.replace(TAG, "").slice(0, 2000),
      }));
    setMessages((m) => [
      ...m,
      { role: "user", text },
      { role: "assistant", text: "" },
    ]);
    setInput("");
    setBusy(true);
    setWaiting(true);
    abort.current = new AbortController();
    try {
      const response = await fetch("/api/assistant/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
        signal: abort.current.signal,
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Assistant unavailable");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const event of events) {
          const name = event.match(/^event: (.+)$/m)?.[1];
          const raw = event.match(/^data: (.+)$/m)?.[1];
          if (!raw) continue;
          const data = JSON.parse(raw);
          if (name === "showtimes")
            updateLast((m) => ({ ...m, tags: data.tags }));
          if (name === "delta") {
            setWaiting(false);
            updateLast((m) => ({ ...m, text: m.text + data.text }));
          }
          if (name === "error") throw new Error(data.message);
        }
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      updateLast((m) => ({
        ...m,
        text:
          m.text ||
          (error as Error).message ||
          "Cinebot is offline. You can still browse all showtimes.",
      }));
    } finally {
      setBusy(false);
      setWaiting(false);
    }
  };
  const reset = () => {
    abort.current?.abort();
    setMessages([greeting]);
  };
  return (
    <>
      <button
        className="chat-launch"
        onClick={() => setOpen(true)}
        aria-label="Open booking assistant"
      >
        <Sparkles size={16} aria-hidden="true" /> <span>Ask Cinebot</span>
      </button>
      {open && (
        <div className={`chat-layer${closing ? " is-closing" : ""}`}>
          <button
            className="chat-backdrop"
            aria-label="Close booking assistant"
            onClick={close}
          />
          <aside
            className="chat-drawer"
            aria-label="Booking assistant"
            role="dialog"
            aria-modal="true"
          >
            <header>
              <div>
                <span className="bot-avatar">C</span>
                <span>
                  <strong>Cinebot</strong>
                  <small>
                    <i /> Online · Booking assistant
                  </small>
                </span>
              </div>
              <div className="chat-actions">
                <button onClick={reset} aria-label="Reset conversation">
                  <RotateCcw size={16} aria-hidden="true" />
                </button>
                <button onClick={close} aria-label="Close">
                  <X size={20} aria-hidden="true" />
                </button>
              </div>
            </header>
            <div className="chat-messages" aria-live="polite" ref={scroller}>
              {messages.map((m, i) =>
                m.role === "assistant" && !m.text ? null : (
                  <div key={i} className={`bubble ${m.role}`}>
                    {m.role === "assistant" ? (
                      <Reply message={m} onNavigate={close} />
                    ) : (
                      m.text
                    )}
                  </div>
                ),
              )}
              {waiting && (
                <div className="bubble assistant typing">
                  <i />
                  <i />
                  <i />
                  <span className="sr-only">Cinebot is typing</span>
                </div>
              )}
            </div>
            {messages.length === 1 && (
              <div className="quick-replies">
                {starters.map((x) => (
                  <button key={x} onClick={() => send(x)}>
                    {x}
                  </button>
                ))}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about films, times or prices…"
                enterKeyHint="send"
              />
              <button disabled={busy}>Send</button>
            </form>
            <small className="chat-safety">
              Never share card details, passwords, DOB or ID in chat.
            </small>
          </aside>
        </div>
      )}
    </>
  );
}
