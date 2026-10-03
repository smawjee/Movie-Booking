const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
class Node {
  children = new Map<string, Node>();
  ids = new Set<number>();
}

/** Index word prefixes, so both "dark kn" and "knight" find The Dark Knight. */
export class MovieTrie {
  private root = new Node();
  private titles = new Map<number, string>();
  constructor(movies: ReadonlyArray<{ id: number; title: string }>) {
    for (const movie of movies) {
      this.titles.set(movie.id, movie.title);
      this.root.ids.add(movie.id);
      for (const word of normalize(movie.title).split(" ")) {
        let node = this.root;
        for (const character of word) {
          if (!node.children.has(character))
            node.children.set(character, new Node());
          node = node.children.get(character)!;
          node.ids.add(movie.id);
        }
      }
    }
  }
  search(query: string): Set<number> {
    const words = normalize(query).split(" ").filter(Boolean);
    let result: Set<number> | undefined;
    for (const word of words) {
      let node: Node | undefined = this.root;
      for (const character of word) node = node?.children.get(character);
      if (!node) return new Set();
      result = result
        ? new Set([...result].filter((id) => node!.ids.has(id)))
        : new Set(node.ids);
    }
    return result ?? new Set(this.root.ids);
  }
  /** Typeahead: titles starting with the query rank first, then alphabetical. */
  suggest(query: string, limit = 6): { id: number; title: string }[] {
    const needle = normalize(query);
    if (!needle) return [];
    return [...this.search(query)]
      .map((id) => ({ id, title: this.titles.get(id)! }))
      .sort((a, b) => {
        const rank = (title: string) =>
          normalize(title).startsWith(needle) ? 0 : 1;
        return rank(a.title) - rank(b.title) || a.title.localeCompare(b.title);
      })
      .slice(0, limit);
  }
}
