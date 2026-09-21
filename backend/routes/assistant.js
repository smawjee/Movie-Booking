const express = require("express");
const { z } = require("zod");
const rateLimit = require("express-rate-limit").rateLimit;
const OpenAI = require("openai").default;
const { getNowPlaying } = require("../../services/tmdbService");
const store = require("../../services/store");
const router = express.Router();
const limiter = rateLimit({ windowMs: 60_000, limit: 15 });
const sensitive =
  /\b(?:\d[ -]*?){13,19}\b|\bcvv\b|security code|date of birth|password/gi;
const schema = z.object({
  message: z.string().min(1).max(500),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().max(1000),
      }),
    )
    .max(8)
    .default([]),
});
const ratingInfo = {
  U: "Suitable for all audiences.",
  PG: "Parental guidance is advised.",
  "12A": "Under-12s must be accompanied by an adult.",
  15: "All guests must be 15 or older; photo ID may be requested.",
  18: "All guests must be 18 or older; photo ID may be requested.",
};
async function context(message) {
  const movies = await getNowPlaying();
  const city = /glasgow/i.test(message)
    ? "glasgow"
    : /london/i.test(message)
      ? "london"
      : "edinburgh";
  const tomorrow = /tomorrow/i.test(message);
  const d = new Date();
  if (tomorrow) d.setDate(d.getDate() + 1);
  const date = d.toISOString().slice(0, 10);
  const format = ["4dx", "imax", "dolby", "screenx", "3d"].find((x) =>
    message.toLowerCase().includes(x),
  );
  const all = await store.buildScreenings(movies, { cinema: city, date, format });
  return { movies, screenings: all.slice(0, 40), city, date };
}
function fallback(message, data) {
  const rating = Object.keys(ratingInfo).find((r) =>
    new RegExp(`\\b${r}\\b`, "i").test(message),
  );
  if (rating && /age|id|rating/i.test(message))
    return { message: ratingInfo[rating] };
  const family = /family|children|kids/i.test(message);
  const list = data.screenings
    .filter((s) => !family || ["U", "PG", "12A"].includes(s.rating))
    .slice(0, 4);
  if (!list.length)
    return {
      message:
        "I could not find a matching screening. Try another cinema, date or format.",
    };
  return {
    message: `I found ${list.map((s) => `${s.movieTitle} at ${s.time} in ${s.experience.name}`).join("; ")}. I can prepare the first option for you.`,
    draftUrl: `/booking?screening=${encodeURIComponent(list[0].id)}`,
    bookingDraftId: `draft-${Date.now()}`,
  };
}
async function live(message, history, data) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const tools = [
    {
      type: "function",
      name: "list_screenings",
      description: "Return verified Cinego screenings matching the request.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      strict: true,
    },
    {
      type: "function",
      name: "explain_age_rating",
      description: "Explain verified UK cinema rating rules.",
      parameters: {
        type: "object",
        properties: {
          rating: { type: "string", enum: ["U", "PG", "12A", "15", "18"] },
        },
        required: ["rating"],
        additionalProperties: false,
      },
      strict: true,
    },
  ];
  const input = [
    ...history.map((x) => ({ role: x.role, content: x.text })),
    { role: "user", content: message },
  ];
  let response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    instructions:
      "You are Cinebot. Use only tool results for films, screenings, prices and ratings. Never request payment data, passwords, DOB or ID. You may recommend and prepare a draft but cannot reserve seats, confirm age or take payment. Be concise.",
    input,
    tools,
    store: false,
  });
  const calls = response.output.filter((x) => x.type === "function_call");
  if (calls.length) {
    const outputs = calls.map((call) => ({
      type: "function_call_output",
      call_id: call.call_id,
      output: JSON.stringify(
        call.name === "explain_age_rating"
          ? { rule: ratingInfo[JSON.parse(call.arguments).rating] }
          : { screenings: data.screenings },
      ),
    }));
    response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      instructions:
        "Answer only from the tool data. Include a concise recommendation.",
      input: [...input, ...response.output, ...outputs],
      tools,
      store: false,
    });
  }
  const result = fallback(message, data);
  return { ...result, message: response.output_text || result.message };
}
// Prefer the live OpenAI-backed assistant when configured, but never let an
// OpenAI-side failure (no credits, rate limit, outage) take the whole
// assistant down — fall back to the rule-based responder so Cinebot always
// answers something useful.
async function respond(message, history, data) {
  if (!process.env.OPENAI_API_KEY)
    return { ...fallback(message, data), mode: "guided-fallback" };
  try {
    return { ...(await live(message, history, data)), mode: "ai" };
  } catch (error) {
    console.error("[assistant:live]", error.message);
    return { ...fallback(message, data), mode: "guided-fallback" };
  }
}
router.post("/assistant/chat", limiter, async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid assistant request" });
  if (sensitive.test(parsed.data.message))
    return res.status(400).json({
      message:
        "For your security, do not share payment details, passwords, date of birth or ID in chat.",
    });
  try {
    const data = await context(parsed.data.message);
    res.json(await respond(parsed.data.message, parsed.data.history, data));
  } catch (error) {
    console.error("[assistant]", error.message);
    res.status(502).json({
      message: "The assistant is unavailable. You can still browse showtimes.",
      fallbackUrl: "/movies",
    });
  }
});
router.post("/assistant/stream", limiter, async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid assistant request" });
  if (sensitive.test(parsed.data.message))
    return res.status(400).json({
      error: "Do not share payment details, passwords, DOB or ID in chat.",
    });
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  const emit = (event, value) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
  try {
    emit("progress", { message: "Checking live Cinego showtimes…" });
    const data = await context(parsed.data.message);
    const result = await respond(parsed.data.message, parsed.data.history, data);
    const words = result.message.split(/(\s+)/);
    for (let index = 0; index < words.length; index += 5)
      emit("delta", { text: words.slice(index, index + 5).join("") });
    emit("complete", result);
    res.end();
  } catch (error) {
    emit("error", {
      message: "Cinebot is temporarily unavailable. Browse showtimes instead.",
      fallbackUrl: "/movies",
    });
    res.end();
  }
});
module.exports = router;
