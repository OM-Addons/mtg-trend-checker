// Shared test helpers: load the extension scripts into a jsdom page and fake Scryfall.
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const SRC = path.join(__dirname, "..", "extension", "src");
const FIXTURES = path.join(__dirname, "fixtures");

/** Same script lists as the content_scripts in manifest.json. */
const CART_SCRIPTS = ["parse.js", "prices.js", "content.js"];
const OFFER_SCRIPTS = ["parse.js", "prices.js", "settings.js", "offers.js"];

function fixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), "utf8");
}

/**
 * Load a page and inject extension scripts, like Firefox does.
 * `browser` is not defined, so storage falls back to in-memory (no cache between tests).
 */
function loadPage(html, scripts, fetchImpl) {
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://www.cardmarket.com/en/Magic/" });
  const w = dom.window;
  w.fetch = fetchImpl;
  w.CMC_NO_AUTORUN = true; // tests call run()/runOffers() themselves
  for (const f of scripts) w.eval(fs.readFileSync(path.join(SRC, f), "utf8"));
  return w;
}

/**
 * Fake Scryfall API.
 * @param {object} data
 * @param {Record<string, string>} [data.byProductId] Cardmarket product id -> oracle id
 * @param {Record<string, string>} [data.byName]      card name -> oracle id (for /cards/named)
 * @param {Record<string, object[]>} data.prints      oracle id -> list of printings ({set_name, set, prices})
 * Returns a fetch function; every requested URL is recorded in `fetch.calls`.
 */
function fakeScryfall({ byProductId = {}, byName = {}, prints }) {
  const calls = [];
  async function fetch(url) {
    const u = new URL(url);
    calls.push(decodeURIComponent(u.pathname + u.search));
    let body = null;
    let m;
    if ((m = u.pathname.match(/^\/cards\/cardmarket\/(\d+)$/))) {
      const o = byProductId[m[1]];
      body = o ? { name: o, oracle_id: o } : null;
    } else if (u.pathname === "/cards/named") {
      const n = u.searchParams.get("exact") || u.searchParams.get("fuzzy");
      const o = byName[n];
      body = o ? { name: n, oracle_id: o } : null;
    } else if (u.pathname === "/cards/search") {
      const q = u.searchParams.get("q");
      if (!q.includes("lang:en")) throw new Error("search must be restricted to English printings");
      const o = q.match(/oracleid:(.+?) lang:en/)[1];
      body = { data: prints[o] || [], has_more: false };
    }
    return { ok: !!body, status: body ? 200 : 404, json: async () => body };
  }
  fetch.calls = calls;
  return fetch;
}

/** A printing with a non-foil trend price. */
const print = (eur, set = "Set") => ({ set_name: set, set: set.toLowerCase(), prices: { eur: eur == null ? null : String(eur) } });

/** Normalise text for assertions (collapses whitespace incl. the non-breaking space in "€ 1,00"). */
const text = (el) => el.textContent.replace(/\s+/g, " ").trim();

module.exports = { fixture, loadPage, fakeScryfall, print, text, CART_SCRIPTS, OFFER_SCRIPTS };
