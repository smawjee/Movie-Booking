class TrieNode {
  constructor() {
    this.children = {};
    this.isEndOfWord = false;
    this.fullTitles = [];
  }
}

class Trie {
  constructor() {
    this.root = new TrieNode();
  }

  insert(title) {
    let node = this.root;
    const lowerTitle = title.toLowerCase();
    for (let char of lowerTitle) {
      if (!node.children[char]) node.children[char] = new TrieNode();
      node = node.children[char];
      node.fullTitles.push(title);
    }
    node.isEndOfWord = true;
  }

  suggest(prefix) {
    let node = this.root;
    prefix = prefix.toLowerCase();
    for (let char of prefix) {
      if (!node.children[char]) return [];
      node = node.children[char];
    }
    return [...new Set(node.fullTitles)];
  }
}

const trie = new Trie();
let movies = [];

async function fetchMovies() {
  try {
    const res = await fetch("http://localhost:5000/api/movies/now-playing");
    movies = await res.json();
    movies.forEach(m => {
      if (m.title) trie.insert(m.title);
    });
  } catch (err) {
    console.error("Error fetching movies:", err);
  }
}

function highlightMatch(text, query) {
  const regex = new RegExp(`(${query})`, "gi");
  return text.replace(regex, "<span class='highlight'>$1</span>");
}

function createSuggestionList(query) {
  const input = document.getElementById("searchInput");
  const parent = input.closest(".search-box") || input.parentElement;
  let box = document.querySelector(".cinego-search-list");

  if (!box) {
    box = document.createElement("div");
    box.className = "cinego-search-list";
    parent.appendChild(box);
  }

  const suggestions = trie.suggest(query);
  if (!query || suggestions.length === 0) {
    box.innerHTML = "";
    box.style.display = "none";
    return;
  }

  box.innerHTML = suggestions.slice(0, 10).map(title => {
    const highlighted = highlightMatch(title, query);
    return `<div class="cinego-suggestion" data-title="${title}">${highlighted}</div>`;
  }).join("");

  box.style.display = "block";

  // 🔁 When a suggestion is clicked
  box.querySelectorAll(".cinego-suggestion").forEach(item => {
    item.addEventListener("click", () => {
      const title = item.getAttribute("data-title");
      input.value = title; // auto-fill input
      window.location.href = `whatson.html?search=${encodeURIComponent(title)}`;
    });
  });
}

function searchMovies() {
  const input = document.getElementById("searchInput");
  const query = input.value.trim();
  if (query) {
    window.location.href = `whatson.html?search=${encodeURIComponent(query)}`;
  }
}
window.searchMovies = searchMovies;

document.addEventListener("DOMContentLoaded", async () => {
  await fetchMovies();

  const input = document.getElementById("searchInput");

  input.addEventListener("input", e => {
    const val = e.target.value.trim();
    createSuggestionList(val);
  });

  input.addEventListener("keypress", e => {
    if (e.key === "Enter") searchMovies();
  });

  // Hide suggestions on blur (with slight delay for click to register)
  input.addEventListener("blur", () => {
    setTimeout(() => {
      const box = document.querySelector(".cinego-search-list");
      if (box) box.style.display = "none";
    }, 200);
  });
});
