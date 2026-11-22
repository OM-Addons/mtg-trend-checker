// "Cheapest English printing" can skip printings by category (Scryfall set type or a few set
// codes) and by individual set (settings.excludedCategories / excludedSets), plus the daily
// cleanup of expired cache entries.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { fixture, loadPage, fakeBrowser, fakeScryfall, print, printing, text, CART_SCRIPTS, OFFER_SCRIPTS } = require("./helpers");

const plain = (v) => JSON.parse(JSON.stringify(v));
const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const searchCalls = (fetch) => fetch.calls.filter((c) => c.startsWith("/cards/search"));
const DAY = 24 * 60 * 60 * 1000;

/** A printing with a set type, as /cards/search returns it. */
const typed = (eur, set_name, set, set_type) => ({ set_name, set, set_type, prices: { eur: eur == null ? null : String(eur) } });

const cmc = () => loadPage("<body></body>", ["settings.js"], null).CMC;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

test("excluded sets: Memorabilia is skipped by default, also for settings saved before the feature", () => {
  const { migrate, DEFAULTS } = cmc();
  assert.deepEqual(plain(DEFAULTS.excludedCategories), ["memorabilia"]);
  assert.deepEqual(plain(DEFAULTS.excludedSets), []);
  const old = migrate({ brackets: [{ from: 1, pct: 25 }], englishOnly: true });
  assert.deepEqual(plain([old.excludedCategories, old.excludedSets]), [["memorabilia"], []]);
  assert.deepEqual(plain(migrate({ excludedCategories: [] }).excludedCategories), [], "unticking everything is kept");
});

test("excluded sets: unknown categories and odd set codes are dropped, codes are lowercased once each", () => {
  const { migrate } = cmc();
  const s = migrate({ excludedCategories: ["promo", "nonsense", "promo"], excludedSets: ["SLD", " m10 ", "sld", "", 5, "no spaces!", null] });
  assert.deepEqual(plain(s.excludedCategories), ["promo"]);
  assert.deepEqual(plain(s.excludedSets), ["sld", "m10"]);
  assert.deepEqual(plain(migrate({ excludedCategories: "promo", excludedSets: {} })), plain({ ...migrate({}), excludedCategories: [], excludedSets: [] }));
});

test("exclusionOf: categories become Scryfall set types and set codes, merged with the ticked sets", () => {
  const { exclusionOf } = cmc();
  assert.deepEqual(plain(exclusionOf({ excludedCategories: ["memorabilia", "secretLair"], excludedSets: ["m10", "sld"] })), {
    types: ["memorabilia"],
    sets: ["m10", "pssc", "sld", "slc", "slp", "slu"].sort(),
  });
  assert.deepEqual(plain(exclusionOf({ excludedCategories: [], excludedSets: [] })), { types: [], sets: [] });
});

// ---------------------------------------------------------------------------
// lookup()
// ---------------------------------------------------------------------------

function boltPage(opts = {}) {
  const fetch = fakeScryfall({
    byProductId: { 1: printing("bolt", 2, 6, "Magic 2010"), 2: "gold" },
    prints: {
      bolt: [
        typed(0.4, "World Championship Decks 1997", "wc97", "memorabilia"),
        typed(0.8, "Secret Lair Drop", "sld", "box"),
        typed(2, "Magic 2010", "m10", "core"),
        typed(5, "Promo", "pm10", "promo"), // skipped but pricier: not counted
      ],
      gold: [typed(3, "World Championship Decks 1997", "wc97", "memorabilia"), typed(1, "Collectors' Edition", "ced", "memorabilia")],
    },
  });
  return { w: loadPage("<body></body>", OFFER_SCRIPTS, fetch, opts), fetch };
}
const ex = (types, sets = []) => ({ types, sets });

test("lookup: skipped printings don't count for the cheapest, only cheaper skipped ones are counted", async () => {
  const { w } = boltPage();
  const p = await w.CMC.lookup("1", "Lightning Bolt", { exclude: ex(["memorabilia", "promo"], ["sld"]) });
  assert.deepEqual([p.trend, p.set, p.skipped, !!p.excludedFallback], [2, "Magic 2010", 2, false]);
  assert.equal(w.CMC.trendSetText(p), "Magic 2010, 2 cheaper skipped");
});

test("lookup: without anything skipped the result is as before (no skipped note)", async () => {
  const { w } = boltPage();
  const p = await w.CMC.lookup("1", "Lightning Bolt", { exclude: ex([]) });
  assert.deepEqual([p.trend, p.set, p.skipped], [0.4, "World Championship Decks 1997", 0]);
  assert.equal(w.CMC.trendSetText(p), "World Championship Decks 1997");
  const none = await w.CMC.lookup("1", "Lightning Bolt");
  assert.equal(none.trend, 0.4, "no exclude option: nothing skipped");
});

test("lookup: when every printing is skipped, the cheapest is used anyway and marked", async () => {
  const { w } = boltPage();
  const p = await w.CMC.lookup("2", "Gold card", { exclude: ex(["memorabilia"]) });
  assert.deepEqual([p.trend, p.set, p.excludedFallback], [1, "Collectors' Edition", true]);
  assert.equal(w.CMC.trendSetText({ ...p, foilOnly: true }), "Collectors' Edition, foil, excluded set");
});

test("lookup: 'This printing' ignores the skipped sets", async () => {
  const { w } = boltPage();
  const p = await w.CMC.lookup("1", "Lightning Bolt", { source: "printing", exclude: ex(["core"], ["m10"]) });
  assert.deepEqual([p.trend, p.set, p.skipped], [2, "Magic 2010", undefined]);
});

test("cache: same skipped sets (in any order) come from the cache, other ones fetch the card again", async () => {
  const browser = fakeBrowser();
  const { w, fetch } = boltPage({ browser });
  await w.CMC.lookup("1", "Lightning Bolt", { exclude: ex(["memorabilia", "promo"], ["sld", "abc"]) });
  await w.CMC.lookup("1", "Lightning Bolt", { exclude: ex(["promo", "memorabilia"], ["abc", "sld"]) });
  assert.equal(searchCalls(fetch).length, 1);
  const p = await w.CMC.lookup("1", "Lightning Bolt", { exclude: ex(["memorabilia"]) });
  assert.equal(searchCalls(fetch).length, 2, "selection changed: fetched again");
  assert.deepEqual([p.trend, p.set, p.skipped], [0.8, "Secret Lair Drop", 1]);
  assert.equal(browser.storage.local.data["cmc:oracle:bolt"].v.sig, "memorabilia|", "the entry remembers what was skipped");
});

test("cache: an entry from before this feature (no record of skipped sets) is fetched again", async () => {
  const browser = fakeBrowser({
    "cmc:pid:1": { t: Date.now(), v: { oracleId: "bolt", name: "Lightning Bolt" } },
    "cmc:oracle:bolt": { t: Date.now(), v: { trend: 0.4, foilOnly: false, set: "World Championship Decks 1997", setCode: "WC97", printings: 4 } },
  });
  const { w, fetch } = boltPage({ browser });
  const p = await w.CMC.lookup("1", "Lightning Bolt", { exclude: ex(["memorabilia"]) });
  assert.equal(searchCalls(fetch).length, 1);
  assert.equal(p.set, "Secret Lair Drop");
});

// ---------------------------------------------------------------------------
// Notes on the pages
// ---------------------------------------------------------------------------

test("cart: the note says how many cheaper printings were skipped", async () => {
  const fetch = fakeScryfall({
    byProductId: { 100: "bolt", 200: "counter", 300: "solring" },
    prints: {
      bolt: [typed(0.5, "Promo", "p", "promo"), typed(1.8, "M10", "m10", "core")],
      counter: [typed(0.9, "Masters 25", "a25", "masters")],
      solring: [typed(2.1, "Commander", "cmd", "commander")],
    },
  });
  const browser = fakeBrowser({ settings: { excludedCategories: ["promo"] } });
  const w = loadPage(fixture("cart.html"), CART_SCRIPTS, fetch, { browser });
  await w.CMC.run();
  const notes = [...w.document.querySelectorAll(".cmc-note")].map(text);
  assert.match(notes[0], /Cheapest EN trend: € 1,80 \(M10, 1 cheaper skipped\)/);
  assert.match(notes[1], /€ 0,90 \(Masters 25\)$/, "nothing skipped: plain note");
});

test("seller page: default settings skip Memorabilia, in the note and the name tooltip", async () => {
  const names = ["Low Deal", "Low NoDeal", "Mid Deal", "High Deal", "High NoDeal", "Boundary Five", "German Deal", "Above Trend", "Cheap Card"];
  const prints = Object.fromEntries(names.map((n) => [n, [print(10, "S")]]));
  prints["Mid Deal"] = [typed(1, "World Championship Decks 1997", "wc97", "memorabilia"), typed(4, "M10", "m10", "core")];
  prints["High Deal"] = [typed(10, "Collectors' Edition", "ced", "memorabilia")];
  const fetch = fakeScryfall({ byProductId: { 555: "High Deal" }, byName: Object.fromEntries(names.map((n) => [n, n])), prints });
  const browser = fakeBrowser({ settings: { englishOnly: true } });
  const w = loadPage(fixture("offers-list.html"), OFFER_SCRIPTS, fetch, { browser });
  await w.CMC.runOffers();
  const notes = [...w.document.querySelectorAll(".cmc-note")].map(text).join(" | ");
  assert.match(notes, /€ 4,00 \(M10, 1 cheaper skipped\)/);
  assert.match(notes, /€ 10,00 \(Collectors' Edition, excluded set\)/);
  const mid = [...w.document.querySelectorAll("a")].find((a) => a.textContent.trim() === "Mid Deal");
  assert.match(mid.title, /cheapest EN trend: €\s4,00 \(M10, 1 cheaper skipped\)/);
});

test("seller page: skipping sets keeps 'no API calls under €1 and for other languages'", async () => {
  const names = ["Cheap Card", "German Deal"];
  const fetch = fakeScryfall({ byName: Object.fromEntries(names.map((n) => [n, n])), prints: {} });
  const browser = fakeBrowser({ settings: { englishOnly: true, excludedCategories: ["promo", "memorabilia"], excludedSets: ["m10"] } });
  const w = loadPage(fixture("offers-list.html"), OFFER_SCRIPTS, fetch, { browser });
  await w.CMC.runOffers();
  for (const n of names) assert.ok(!fetch.calls.some((c) => c.includes(n)), `${n}: no lookup`);
});

// ---------------------------------------------------------------------------
// Cleanup of expired cache entries
// ---------------------------------------------------------------------------

test("cleanup: expired cache entries are removed, fresh ones and the settings are kept", async () => {
  const now = Date.now();
  const browser = fakeBrowser({
    settings: { englishOnly: true },
    "cmc:pid:1": { t: now - DAY - 1, v: { oracleId: "old" } },
    "cmc:oracle:old": { t: now - 3 * DAY, v: null },
    "cmc:pid:2": { t: now - 1000, v: { oracleId: "fresh" } },
    "cmc:broken": "not an entry",
  });
  const w = loadPage("<body></body>", OFFER_SCRIPTS, null, { browser });
  assert.equal(await w.CMC.cleanupCache(now), 3);
  assert.deepEqual(Object.keys(browser.storage.local.data).sort(), ["cacheCleanedAt", "cmc:pid:2", "settings"]);
});

test("cleanup: runs at most once a day", async () => {
  const now = Date.now();
  const browser = fakeBrowser({ cacheCleanedAt: now - 1000, "cmc:pid:1": { t: now - 2 * DAY, v: null } });
  const w = loadPage("<body></body>", OFFER_SCRIPTS, null, { browser });
  assert.equal(await w.CMC.cleanupCache(now), 0, "cleaned a moment ago");
  assert.ok("cmc:pid:1" in browser.storage.local.data);
  assert.equal(await w.CMC.cleanupCache(now + DAY), 1, "a day later it runs again");
});

test("cleanup: runs once before the first lookup of a page", async () => {
  const browser = fakeBrowser({ "cmc:pid:9": { t: Date.now() - 2 * DAY, v: null } });
  const { w } = boltPage({ browser });
  await w.CMC.lookup("1", "Lightning Bolt");
  assert.ok(!("cmc:pid:9" in browser.storage.local.data), "expired entry removed");
  assert.equal(typeof browser.storage.local.data.cacheCleanedAt, "number");
  assert.ok("cmc:oracle:bolt" in browser.storage.local.data, "the fresh lookup is cached");
});

test("Refresh prices keeps the cleanup date (it only clears cmc: keys)", async () => {
  const browser = fakeBrowser({ cacheCleanedAt: 123, "cmc:pid:1": { t: Date.now(), v: null } });
  const w = loadPage("<body></body>", OFFER_SCRIPTS, null, { browser });
  await w.CMC.clearCache();
  assert.deepEqual(Object.keys(browser.storage.local.data), ["cacheCleanedAt"]);
});

// ---------------------------------------------------------------------------
// Settings page
// ---------------------------------------------------------------------------

const OPTIONS = path.join(__dirname, "..", "extension", "options");
const SETS = [
  { code: "fdn", name: "Foundations", set_type: "core", digital: false },
  { code: "m10", name: "Magic 2010", set_type: "core", digital: false },
  { code: "mh2", name: "Modern Horizons 2", set_type: "draft_innovation", digital: false },
  { code: "mh1", name: "Modern Horizons", set_type: "draft_innovation", digital: false },
  { code: "ymid", name: "Alchemy: Innistrad", set_type: "alchemy", digital: true },
  { code: "tmh2", name: "Modern Horizons 2 Tokens", set_type: "token", digital: false },
];

/** options.html with a fake storage and a fake Scryfall /sets (or a failing one). */
async function optionsPage(stored, { fail = false } = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(OPTIONS, "options.html"), "utf8"), { runScripts: "outside-only" });
  const w = dom.window;
  w.browser = fakeBrowser(stored ? { settings: stored } : {});
  const calls = [];
  w.fetch = async (url) => {
    calls.push(url);
    if (fail) throw new Error("offline");
    return { ok: true, status: 200, json: async () => ({ data: SETS }) };
  };
  w.eval(fs.readFileSync(path.join(__dirname, "..", "extension", "src", "settings.js"), "utf8"));
  w.eval(fs.readFileSync(path.join(OPTIONS, "options.js"), "utf8"));
  await wait();
  const d = w.document;
  const search = async (q) => {
    const input = d.getElementById("setSearch");
    input.value = q;
    input.dispatchEvent(new w.Event("input", { bubbles: true }));
  };
  const listed = () => [...d.querySelectorAll("#setList label")].map(text);
  const chips = () => [...d.querySelectorAll("#chips button")].map(text);
  const click = async (id) => { d.getElementById(id).click(); await wait(); };
  return { w, d, calls, search, listed, chips, click, stored: () => w.browser.storage.local.data.settings };
}

test("settings page: categories are listed, Memorabilia ticked by default", async () => {
  const { d } = await optionsPage();
  const boxes = [...d.querySelectorAll("#categories input")];
  assert.deepEqual(boxes.map((b) => b.dataset.category), ["memorabilia", "funny", "promo", "secretLair", "theList"]);
  assert.deepEqual(boxes.filter((b) => b.checked).map((b) => b.dataset.category), ["memorabilia"]);
  assert.match(text(d.body), /Only used with "Cheapest English printing"/);
});

test("settings page: search lists matching paper sets (name or code), not digital or token sets", async () => {
  const { search, listed, d } = await optionsPage();
  assert.match(text(d.getElementById("setStatus")), /Type to search 4 sets/);
  assert.deepEqual(listed(), [], "nothing listed before typing");
  await search("modern");
  assert.deepEqual(listed(), ["Modern Horizons 2 (MH2)", "Modern Horizons (MH1)"]);
  await search("M1");
  assert.deepEqual(listed(), ["Magic 2010 (M10)"]);
  await search("zzz");
  assert.match(text(d.getElementById("setStatus")), /No set matches/);
});

test("settings page: ticking a set adds a tag, saving stores it, the tag removes it again", async () => {
  const { d, search, chips, click, stored } = await optionsPage();
  await search("modern");
  d.querySelector("#setList input[data-set=mh2]").click();
  assert.deepEqual(chips(), ["Modern Horizons 2 (MH2) ✕"]);
  d.querySelector("#categories input[data-category=promo]").click();
  await click("save");
  assert.deepEqual(plain([stored().excludedCategories, stored().excludedSets]), [["memorabilia", "promo"], ["mh2"]]);
  assert.match(text(d.getElementById("saved")), /Prices will be fetched again/);

  d.querySelector("#chips button").click();
  assert.deepEqual(chips(), []);
  assert.equal(d.querySelector("#setList input[data-set=mh2]").checked, false, "the list follows the tag");
  await click("save");
  assert.deepEqual(plain(stored().excludedSets), []);
});

test("settings page: saving without changing the skipped sets doesn't announce a refetch", async () => {
  const { d, click } = await optionsPage({ excludedSets: ["m10"] });
  await click("save");
  assert.equal(text(d.getElementById("saved")), "Saved ✓");
});

test("settings page: the set list is fetched once and cached for a day", async () => {
  const first = await optionsPage();
  assert.deepEqual(first.calls, ["https://api.scryfall.com/sets"]);
  const cached = first.w.browser.storage.local.data["cmc:sets"];
  assert.equal(cached.v.length, 4);

  // A fresh page with the cached list makes no request.
  const again = new JSDOM(fs.readFileSync(path.join(OPTIONS, "options.html"), "utf8"), { runScripts: "outside-only" });
  again.window.browser = fakeBrowser({ "cmc:sets": cached });
  const calls = [];
  again.window.fetch = async (u) => { calls.push(u); throw new Error("should not fetch"); };
  again.window.eval(fs.readFileSync(path.join(__dirname, "..", "extension", "src", "settings.js"), "utf8"));
  again.window.eval(fs.readFileSync(path.join(OPTIONS, "options.js"), "utf8"));
  await wait();
  assert.deepEqual(calls, []);
  assert.match(text(again.window.document.getElementById("setStatus")), /Type to search 4 sets/);
});

test("settings page: set list unavailable -> message, already skipped sets are kept on save", async () => {
  const { d, chips, click, stored } = await optionsPage({ excludedSets: ["sld"] }, { fail: true });
  assert.match(text(d.getElementById("setStatus")), /Couldn't load the set list/);
  assert.deepEqual(chips(), ["SLD ✕"]);
  await click("save");
  assert.deepEqual(plain(stored().excludedSets), ["sld"]);
});

test("settings page: reset ticks only Memorabilia and clears the sets", async () => {
  const { d, chips, click, stored } = await optionsPage({ excludedCategories: ["promo"], excludedSets: ["m10"] });
  assert.deepEqual(chips(), ["Magic 2010 (M10) ✕"]);
  await click("reset");
  assert.deepEqual(chips(), []);
  assert.deepEqual([...d.querySelectorAll("#categories input:checked")].map((b) => b.dataset.category), ["memorabilia"]);
  assert.deepEqual(plain([stored().excludedCategories, stored().excludedSets]), [["memorabilia"], []]);
});
