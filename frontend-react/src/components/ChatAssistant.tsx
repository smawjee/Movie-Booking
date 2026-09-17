import { useState } from "react";
type Message = { role: "user" | "assistant"; text: string; draftUrl?: string };
const starters = [
  "Find a family film tomorrow",
  "What is showing in 4DX?",
  "Explain the 15 age rating",
  "Show membership options",
];
export function ChatAssistant() {
  const [open, setOpen] = useState(false),
    [input, setInput] = useState(""),
    [messages, setMessages] = useState<Message[]>([
      {
        role: "assistant",
        text: "Hi, I’m Cinebot. I can find films, compare premium screens and prepare a booking.",
      },
    ]),
    [busy, setBusy] = useState(false);
  const send = async (text = input) => {
    if (!text.trim() || busy) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setBusy(true);
    try {
      const response = await fetch("/api/assistant/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: messages.slice(-8) }),
      });
      if (!response.ok || !response.body)
        throw new Error("Assistant unavailable");
      setMessages((current) => [...current, { role: "assistant", text: "" }]);
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
          const eventName = event.match(/^event: (.+)$/m)?.[1];
          const raw = event.match(/^data: (.+)$/m)?.[1];
          if (!raw) continue;
          const data = JSON.parse(raw);
          if (eventName === "delta")
            setMessages((current) =>
              current.map((item, index) =>
                index === current.length - 1
                  ? { ...item, text: item.text + data.text }
                  : item,
              ),
            );
          if (eventName === "complete" && data.draftUrl)
            setMessages((current) =>
              current.map((item, index) =>
                index === current.length - 1
                  ? { ...item, draftUrl: data.draftUrl }
                  : item,
              ),
            );
        }
      }
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "The assistant is offline. You can still browse all showtimes.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        className="chat-launch"
        onClick={() => setOpen(true)}
        aria-label="Open booking assistant"
      >
        ✦ <span>Ask Cinebot</span>
      </button>
      {open && (
        <div className="chat-layer">
          <button
            className="chat-backdrop"
            aria-label="Close booking assistant"
            onClick={() => setOpen(false)}
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
                <button
                  onClick={() => setMessages(messages.slice(0, 1))}
                  aria-label="Reset conversation"
                >
                  ↻
                </button>
                <button onClick={() => setOpen(false)} aria-label="Close">
                  ×
                </button>
              </div>
            </header>
            <div className="chat-messages" aria-live="polite">
              {messages.map((m, i) => (
                <div key={i} className={`bubble ${m.role}`}>
                  {m.text}
                  {m.draftUrl && (
                    <a className="button" href={m.draftUrl}>
                      Continue booking
                    </a>
                  )}
                </div>
              ))}
              {busy && (
                <div className="bubble assistant typing">
                  <i />
                  <i />
                  <i />
                  <span className="sr-only">Thinking</span>
                </div>
              )}
            </div>
            <div className="quick-replies">
              {starters.map((x) => (
                <button key={x} onClick={() => send(x)}>
                  {x}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about films or showtimes…"
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
