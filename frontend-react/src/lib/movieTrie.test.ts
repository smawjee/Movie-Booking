import { describe, expect, it } from "vitest";
import { MovieTrie } from "./movieTrie";
const trie = new MovieTrie([
  { id: 1, title: "The Dark Knight" },
  { id: 2, title: "Dark Waters" },
  { id: 3, title: "Am\u00e9lie" },
  { id: 4, title: "Spider-Man" },
]);
describe("movie prefix trie", () => {
  it("matches any title word prefix", () =>
    expect([...trie.search("kn")]).toEqual([1]));
  it("intersects multiple prefixes", () =>
    expect([...trie.search("dark kn")]).toEqual([1]));
  it("normalizes accents, punctuation, case and spaces", () => {
    expect([...trie.search(" AMEL ")]).toEqual([3]);
    expect([...trie.search("spider man")]).toEqual([4]);
  });
  it("returns all indexed films for empty input", () =>
    expect(trie.search(" ").size).toBe(4));
  it("returns nothing for unknown prefixes", () =>
    expect(trie.search("xyz").size).toBe(0));
  it("does not index films without screenings when built from inventory", () => {
    const available = new MovieTrie([{ id: 2, title: "Dark Waters" }]);
    expect(available.search("knight").size).toBe(0);
  });
  it("suggests titles starting with the query first", () =>
    expect(trie.suggest("dark").map((m) => m.id)).toEqual([2, 1]));
  it("limits suggestions and ignores empty input", () => {
    expect(trie.suggest("dark", 1)).toHaveLength(1);
    expect(trie.suggest("  ")).toEqual([]);
  });
});
