import { useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api, poster } from "../lib/api";
import { MovieTrie } from "../lib/movieTrie";

/** Header search: a trie over films showing at the cinema, with typeahead. */
export function SearchSuggest({ onNavigate }: { onNavigate?: () => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const blurTimer = useRef<number>(undefined);
  const navigate = useNavigate();
  const showing = useQuery({
    queryKey: ["showing", "edinburgh"],
    queryFn: () => api.showing("edinburgh"),
    staleTime: 5 * 60 * 1000,
  });
  const trie = useMemo(() => new MovieTrie(showing.data || []), [showing.data]);
  const byId = useMemo(
    () => new Map((showing.data || []).map((m) => [m.id, m] as const)),
    [showing.data],
  );
  const suggestions = trie.suggest(query);
  const go = (movie: string) => {
    setOpen(false);
    setActive(-1);
    setQuery(movie);
    onNavigate?.();
    navigate({ to: "/movies", search: { movie: movie.trim() } });
  };
  const expanded = open && query.trim().length > 0;
  return (
    <form
      className="nav-search"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        go(active >= 0 ? suggestions[active].title : query);
      }}
    >
      <button type="submit" aria-label="Search films">
        <Search size={16} aria-hidden="true" />
      </button>
      <input
        type="search"
        role="combobox"
        aria-label="Search films showing now"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          active >= 0 ? `${listId}-${suggestions[active]?.id}` : undefined
        }
        placeholder="Search films"
        autoComplete="off"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => {
          window.clearTimeout(blurTimer.current);
          setOpen(true);
        }}
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, suggestions.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((i) => Math.max(i - 1, -1));
          } else if (event.key === "Escape") {
            setOpen(false);
            setActive(-1);
          }
        }}
      />
      {expanded && (
        <ul className="search-suggest" id={listId} role="listbox">
          {suggestions.length ? (
            suggestions.map((s, index) => (
              <li
                key={s.id}
                id={`${listId}-${s.id}`}
                role="option"
                aria-selected={index === active}
                className={index === active ? "active" : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => go(s.title)}
              >
                <img src={poster(byId.get(s.id)?.poster_path ?? null, 92)} alt="" />
                <span>
                  <strong>{s.title}</strong>
                  <small>{byId.get(s.id)?.rating} · Showing now</small>
                </span>
              </li>
            ))
          ) : (
            <li className="search-empty" role="option" aria-selected={false}>
              {showing.isLoading
                ? "Loading films…"
                : "No films showing match that title."}
            </li>
          )}
        </ul>
      )}
    </form>
  );
}
