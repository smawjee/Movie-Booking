const names = new Intl.DisplayNames(["en-GB"], { type: "language" });

/** "hi" -> "Hindi"; falls back to the code for anything unknown. */
export const languageName = (code: string) => {
  try {
    return names.of(code) || code;
  } catch {
    return code;
  }
};

/** Non-English films are shown in their original language with subtitles. */
export const languageLabel = (code: string) =>
  code && code !== "en" ? `${languageName(code)} · English subtitles` : null;
