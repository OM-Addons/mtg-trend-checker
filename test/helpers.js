// Shared test helpers: load the extension scripts into a jsdom page and fake Scryfall.
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const SRC = path.join(__dirname, "..", "extension", "src");
const FIXTURES = path.join(__dirname, "fixtures");

/** Same script lists as the content_scripts in manifest.json. */
const CART_SCRIPTS = ["parse.js", "prices.js", "settings.js", "onoff.js", "verdict.js", "content.js"];
const OFFER_SCRIPTS = ["parse.js", "prices.js", "settings.js", "onoff.js", "offers.js"];
const WIZARD_SCRIPTS = ["parse.js", "prices.js", "settings.js", "onoff.js", "verdict.js", "wizard.js"];

function fixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), "utf8");
}

/**
 * Fake `browser` API with an in-memory storage.local, for tests that need stored settings.
 * @param {Record<string, any>} [initial] starting contents of storage.local
 */
function fakeBrowser(initial = {}) {
  const data = { ...initial };
  const listeners = [];
  const local = {
    data,
    async get(key) {
      if (key == null) return { ...data };
      return key in data ? { [key]: data[key] } : {};
    },
    async set(obj) {
      const copy = JSON.parse(JSON.stringify(obj));
      const changes = Object.fromEntries(Object.entries(copy).map(([k, v]) => [k, { oldValue: data[k], newValue: v }]));
      Object.assign(data, copy);
      for (const l of listeners) l(changes, "local");
    },
    async remove(keys) { for (const k of [].concat(keys)) delete data[k]; },
  };
  const messages = [];
  const opened = [];
  const manifest = JSON.parse(fs.readFileSync(path.join(SRC, "..", "manifest.json"), "utf8"));
  return {
    // onChanged: like Firefox, every set() tells the listeners (old and new value per key).
    storage: { local, onChanged: { listeners, addListener(l) { listeners.push(l); } } },
    runtime: {
      messages,
      async sendMessage(m) { messages.push(m); },
      getURL: (p) => `moz-extension://test/${p}`,
      getManifest: () => manifest,
    },
    tabs: { opened, async create(o) { opened.push(o.url); } },
  };
}

/**
 * Load a page and inject extension scripts, like Firefox does.
 * Without `opts.browser`, `browser` is not defined, so storage falls back to defaults /
 * in-memory (no cache between tests). `opts.url` sets the page address (default: an /en/ page).
 */
function loadPage(html, scripts, fetchImpl, opts = {}) {
  const dom = new JSDOM(html, { runScripts: "outside-only", url: opts.url || "https://www.cardmarket.com/en/Magic/" });
  const w = dom.window;
  w.fetch = fetchImpl;
  if (opts.browser) w.browser = opts.browser;
  w.CMC_NO_AUTORUN = true; // tests call run()/runOffers() themselves
  for (const f of scripts) w.eval(fs.readFileSync(path.join(SRC, f), "utf8"));
  return w;
}

/**
 * Fake Scryfall API.
 * @param {object} data
 * @param {Record<string, string | object>} [data.byProductId] Cardmarket product id -> oracle id, or a
 *   whole printing ({oracle_id, name?, set_name, set, prices, finishes}, see `printing()`)
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
      body = !o ? null : typeof o === "string" ? { name: o, oracle_id: o } : { name: o.oracle_id, ...o };
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

/**
 * A printing as /cards/cardmarket/{id} returns it, for "this printing" mode.
 * @param {string} oracle @param {number | null} eur @param {number | null} eurFoil @param {string} [set]
 * @param {string[]} [finishes] Scryfall finishes (default both)
 */
const printing = (oracle, eur, eurFoil, set = "Set", finishes = ["nonfoil", "foil"]) => ({
  oracle_id: oracle, set_name: set, set: set.toLowerCase(), finishes,
  prices: { eur: eur == null ? null : String(eur), eur_foil: eurFoil == null ? null : String(eurFoil) },
});

/** Normalise text for assertions (collapses whitespace incl. the non-breaking space in "€ 1,00"). */
const text = (el) => el.textContent.replace(/\s+/g, " ").trim();

/** Notes under the card names (set link, or the full note when there's no price cell). */
const nameNotes = (w) => [...w.document.querySelectorAll(".cmc-note:not(.cmc-price-note)")].map(text);
/** Lines under Cardmarket's price, one string per card, e.g. "trend € 7,00 / ▼ € 4,50 under". */
const priceNotes = (w) => [...w.document.querySelectorAll(".cmc-price-note")].map((n) =>
  n.children.length ? [...n.children].map(text).join(" / ") : text(n));

module.exports = { fixture, loadPage, fakeBrowser, fakeScryfall, print, printing, text, nameNotes, priceNotes, CART_SCRIPTS, OFFER_SCRIPTS, WIZARD_SCRIPTS };
