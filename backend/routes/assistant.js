const express = require("express");
const { z } = require("zod");
const rateLimit = require("express-rate-limit").rateLimit;
const OpenAI = require("openai").default;
const {
  buildContext,
  RATING_RULES,
} = require("../../services/assistantContext");
const router = express.Router();
const limiter = rateLimit({ windowMs: 60_000, limit: 15 });
const sensitive =
  /\b(?:\d[ -]*?){13,19}\b|\bcvv\b|security code|date of birth|password/i;
const schema = z.object({
  message: z.string().min(1).max(500),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().max(2000),
      }),
    )
    .max(10)
    .default([]),
});

const INSTRUCTIONS = `You are Cinebot, the friendly booking assistant for Cinego, a UK cinema chain.
Answer from the CINEGO FACTS below only; never invent films, times, prices or rules. If something isn't in the facts, say so and suggest where to look on the site.
To offer a showing, write its booking tag exactly as given, e.g. [[book:S12]], straight after describing it; the app turns each tag into a Book button. Offer at most 4 tags per reply, choosing the best matches.
Showtimes are only listed for the cinema in focus; if the user wants another city, tell them to name it (e.g. "in Glasgow") and you'll check.
Family-friendly means U, PG or 12A. Mention subtitles for non-English films.
You can recommend films and prepare bookings, but you cannot hold seats, take payment or verify age. Never ask for card details, passwords, date of birth or ID.
Style: warm, brief and specific. Use short paragraphs or "- " bullet lists, **bold** film titles, no headings. Keep most replies under 120 words.`;

let client = null;
const openai = () =>
  (client ||= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 25_000,
    maxRetries: 1,
  }));
const model = () => process.env.OPENAI_MODEL || "gpt-4o-mini";

// Used when OpenAI is not configured or fails: keyword matching over the
// same facts, so Cinebot still answers with real showtimes.
const genreWords = {
  horror: 27,
  scary: 27,
  comed: 35,
  funny: 35,
  action: 28,
  adventure: 12,
  animat: 16,
  drama: 18,
  thriller: 53,
  romanc: 10749,
  "sci-fi": 878,
  family: 10751,
  fantasy: 14,
  crime: 80,
};
function fallback(message, { aliases, films }) {
  const rating = Object.keys(RATING_RULES).find((r) =>
    new RegExp(`\\b${r}\\b`, "i").test(message),
  );
  if (rating && /age|id|rating|rated/i.test(message))
    return `**${rating}**: ${RATING_RULES[rating]}`;
  if (/member|cinego\+|plan/i.test(message))
    return "Cinego+ has Silver (£4.99), Gold (£8.99), Platinum (£14.99) and Student (£4.99) plans, from 5% to 25% off tickets plus perks. See the Membership page for details.";
  const family = /family|children|kids/i.test(message);
  const genre = Object.entries(genreWords).find(([w]) =>
    new RegExp(`\\b${w}`, "i").test(message),
  )?.[1];
  const format = ["4dx", "imax", "dolby", "screenx", "3d"].find((x) =>
    message.toLowerCase().includes(x),
  );
  const genresByTitle = new Map(films.map((f) => [f.title, f.genre_ids || []]));
  const ratingByTitle = new Map(films.map((f) => [f.title, f.rating]));
  const seen = new Set();
  const picks = Object.entries(aliases)
    .filter(
      ([, a]) =>
        (!family || ["U", "PG", "12A"].includes(ratingByTitle.get(a.title))) &&
        (!genre || genresByTitle.get(a.title)?.includes(genre)) &&
        (!format || a.label.toLowerCase().includes(format)),
    )
    .filter(([, a]) => !seen.has(a.title) && seen.add(a.title))
    .slice(0, 4);
  if (!picks.length)
    return "I couldn't find a matching showing. Try another day, format or cinema, or browse the Movies page.";
  return `Here's what I found:\n${picks
    .map(([alias, a]) => `- **${a.title}**, ${a.label} [[book:${alias}]]`)
    .join("\n")}`;
}

// Streams the reply as server-sent events: `showtimes` (booking tags the
// reply may use), then `delta` chunks as the model writes, then `complete`.
router.post("/assistant/stream", limiter, async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid assistant request" });
  const { message, history } = parsed.data;
  if (sensitive.test(message))
    return res.status(400).json({
      error: "Do not share payment details, passwords, DOB or ID in chat.",
    });
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  const emit = (event, value) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
  let sent = false;
  try {
    const ctx = await buildContext(message, history);
    emit("showtimes", {
      cinema: ctx.cinema.city,
      tags: Object.fromEntries(
        Object.entries(ctx.aliases).map(([alias, a]) => [
          alias,
          { screening: a.id, label: a.label },
        ]),
      ),
    });
    let mode = "ai";
    if (process.env.OPENAI_API_KEY) {
      try {
        const stream = await openai().responses.create({
          model: model(),
          instructions: `${INSTRUCTIONS}\n\nCINEGO FACTS\n${ctx.facts}`,
          input: [
            ...history.map((h) => ({ role: h.role, content: h.text })),
            { role: "user", content: message },
          ],
          max_output_tokens: 500,
          stream: true,
          store: false,
        });
        for await (const event of stream) {
          if (event.type === "response.output_text.delta" && event.delta) {
            sent = true;
            emit("delta", { text: event.delta });
          }
        }
      } catch (error) {
        console.error("[assistant:live]", error.message);
        // Mid-answer failures can't be patched over; earlier ones fall back.
        if (sent) throw error;
        mode = "guided-fallback";
      }
    } else mode = "guided-fallback";
    if (mode === "guided-fallback")
      emit("delta", { text: fallback(message, ctx) });
    emit("complete", { mode });
  } catch (error) {
    console.error("[assistant]", error.message);
    emit("error", {
      message: "Cinebot is temporarily unavailable. Browse showtimes instead.",
      fallbackUrl: "/movies",
    });
  }
  res.end();
});
module.exports = router;
