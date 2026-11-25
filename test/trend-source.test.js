// "Compare with": the cheapest English printing (default) or the exact printing on offer
// (settings.trendSource = "printing"), on the cart and seller pages, plus foil detection.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixture, loadPage, fakeBrowser, fakeScryfall, print, printing, text, nameNotes, priceNotes, CART_SCRIPTS, OFFER_SCRIPTS } = require("./helpers");

const plain = (v) => JSON.parse(JSON.stringify(v));
const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const cardmarketCalls = (fetch) => fetch.calls.filter((c) => c.startsWith("/cards/cardmarket/"));
const searchCalls = (fetch) => fetch.calls.filter((c) => c.startsWith("/cards/search"));
/** Waits until the overview shows a finished check (not "Looking up…"). */
async function done(w, re = /Checked \d+|worth it ·/) {
  for (let i = 0; i < 400; i++) {
    const o = w.document.querySelector(".cmc-overview");
    if (o && re.test(o.textContent)) return;
    await wait(25);
  }
  throw new Error("check didn't finish");
}

// ---------------------------------------------------------------------------
// Foil detection
// ---------------------------------------------------------------------------

test("foil: Cardmarket's foil icon is recognised, also after Bootstrap moved its title", () => {
  const w = loadPage("<body></body>", OFFER_SCRIPTS, null);
  const row = (html) => { const d = w.document.createElement("div"); d.innerHTML = html; return d; };
  assert.equal(w.CMC.isFoil(row(`<span class="icon" title="Foil"></span>`)), true);
  assert.equal(w.CMC.isFoil(row(`<span class="icon" data-bs-original-title="Foil" aria-label="Foil"></span>`)), true);
  assert.equal(w.CMC.isFoil(row(`<span title="English"></span><a>Foil Bird</a>`)), false, "the word in a card name doesn't count");
  assert.equal(w.CMC.isFoil(row(`<span title="Foil Bird"></span>`)), false);
});

test("real seller page: foil offers are marked", () => {
  const w = loadPage(fixture("real-offers-foil.html"), OFFER_SCRIPTS, null);
  const offers = w.CMC.parseOffers(w.document);
  assert.equal(offers.length, 20);
  assert.equal(offers.filter((o) => o.foil).length, 8);
  assert.deepEqual(plain(offers.slice(0, 3).map((o) => [o.productId, o.price, o.foil])), [
    ["676516", 0.44, false], ["676498", 0.44, true], ["676498", 0.28, false],
  ]);
});

test("real cart: foil rows are marked (same card as foil and non-foil = two articles)", () => {
  const w = loadPage(fixture("real-cart-foil.html"), CART_SCRIPTS, null);
  const shipments = w.CMC.parseCart(w.document);
  assert.deepEqual(plain(shipments.map((s) => [s.total, s.articles.map((a) => [a.productId, a.unitPrice, a.foil])])), [
    [13.46, [["313985", 0.81, true], ["313985", 0.28, false]]],
    [7.6, [["556296", 5, true]]],
  ]);
});

// ---------------------------------------------------------------------------
// lookup() in "printing" mode
// ---------------------------------------------------------------------------

function lookupPage() {
  const fetch = fakeScryfall({
    byProductId: {
      1: printing("bolt", 2, 6, "M10"),
      2: printing("promo", null, 3, "Promo", ["foil"]), // foil-only printing
      3: printing("noprice", null, null, "Fresh"),
    },
    byName: { "Lightning Bolt": "bolt" },
    prints: { bolt: [print(0.5, "Cheap reprint"), print(2, "M10")] },
  });
  return { w: loadPage("<body></body>", OFFER_SCRIPTS, fetch), fetch };
}

test("printing lookup: normal trend for non-foil, foil trend for foil, of that printing only", async () => {
  const { w, fetch } = lookupPage();
  const nf = await w.CMC.lookup("1", "Lightning Bolt", { source: "printing" });
  assert.deepEqual([nf.trend, nf.set, nf.foilOnly, nf.source], [2, "M10", false, "printing"]);
  const f = await w.CMC.lookup("1", "Lightning Bolt", { source: "printing", foil: true });
  assert.deepEqual([f.trend, f.foilOnly], [6, true]);
  assert.equal(searchCalls(fetch).length, 0, "no search for other printings");
  assert.equal(cardmarketCalls(fetch).length, 1, "the second lookup comes from the cache");
  const cheapest = await w.CMC.lookup("1", "Lightning Bolt");
  assert.deepEqual([cheapest.trend, cheapest.set, cheapest.source], [0.5, "Cheap reprint", "cheapestEnglish"]);
});

test("printing lookup: a foil-only printing uses its foil trend even without the foil icon", async () => {
  const { w } = lookupPage();
  const p = await w.CMC.lookup("2", "Promo card", { source: "printing" });
  assert.deepEqual([p.trend, p.foilOnly], [3, true]);
});

test("printing lookup: no trend for that finish, or no product id -> no trend (no fallback)", async () => {
  const { w, fetch } = lookupPage();
  assert.equal(await w.CMC.lookup("3", "No price", { source: "printing" }), null);
  assert.equal(await w.CMC.lookup("1", "Lightning Bolt", { source: "printing", foil: true }).then((p) => p.trend), 6);
  const before = fetch.calls.length;
  assert.equal(await w.CMC.lookup(null, "Lightning Bolt", { source: "printing" }), null);
  assert.equal(fetch.calls.length, before, "without a product id there is nothing to look up");
});

test("switching mode costs no extra request: the product-id call caches both", async () => {
  const { w, fetch } = lookupPage();
  await w.CMC.lookup("1", "Lightning Bolt"); // cheapest English first
  await w.CMC.lookup("1", "Lightning Bolt", { source: "printing" });
  assert.equal(cardmarketCalls(fetch).length, 1);
});

// ---------------------------------------------------------------------------
// Seller page (real-offers-foil.html: 20 offers, 2 of them at €1 or more, both foil:
// "Lifetime" Pass Holder €2,90 (676400) and ________ Goblin €3,99 (677324))
// ---------------------------------------------------------------------------

function realFoilOffers(settings) {
  const fetch = fakeScryfall({
    byProductId: {
      676400: printing("pass", 1, 3.2, "Unfinity"), // 2,90 vs foil 3,20 = 9% -> no deal (needs 25%)
      677324: printing("goblin", 1, 5, "Unfinity"), // 3,99 vs foil 5,00 = 20% -> deal (needs 15%)
    },
    prints: { pass: [print(1, "Unfinity")], goblin: [print(1, "Unfinity")] },
  });
  const browser = fakeBrowser({ settings: { englishOnly: true, ...settings } });
  return { w: loadPage(fixture("real-offers-foil.html"), OFFER_SCRIPTS, fetch, { browser }), fetch, browser };
}
const flagged = (w) => [...w.document.querySelectorAll(".cmc-deal-row")].map((r) => r.querySelector("a").textContent.trim());

test("seller page, this printing: foil offers vs their foil trend; still no calls under €1", async () => {
  const { w, fetch } = realFoilOffers({ trendSource: "printing" });
  await w.CMC.runOffers();
  assert.deepEqual(flagged(w), ["________ Goblin"]);
  assert.deepEqual(cardmarketCalls(fetch).sort(), ["/cards/cardmarket/676400", "/cards/cardmarket/677324"]);
  assert.equal(searchCalls(fetch).length, 0);
  const notes = priceNotes(w);
  assert.ok(notes.includes("▼ € 1,01 under (20%) 🔥 / trend € 5,00"), notes.join(" | "));
  assert.ok(notes.some((n) => n.endsWith(" / trend € 3,20")), notes.join(" | "));
  assert.deepEqual(nameNotes(w).sort(), ["(Trend from: Unfinity, foil)", "(Trend from: Unfinity, foil)"]);
  const goblin = [...w.document.querySelectorAll(".cmc-deal-row a")][0];
  assert.match(goblin.title, /trend of this printing: €\s5,00 \(Unfinity, foil\)/);
});

test("seller page, cheapest EN (default): same offers compared with the cheapest English printing", async () => {
  const { w } = realFoilOffers({});
  await w.CMC.runOffers();
  assert.deepEqual(flagged(w), [], "both are far above the €1 cheapest trend");
  assert.deepEqual(priceNotes(w), ["▲ € 1,90 over / trend € 1,00", "▲ € 2,99 over / trend € 1,00"]);
  assert.deepEqual(nameNotes(w), ["(Trend from: Unfinity)", "(Trend from: Unfinity)"]);
});

test("seller page switch: 'This printing' is saved and the page is re-checked", async () => {
  const { w, browser } = realFoilOffers({});
  await w.CMC.runOffers();
  const row = w.document.querySelector(".cmc-source");
  assert.ok(row, "second switch row in the overview box");
  assert.deepEqual([...row.querySelectorAll("button")].map((b) => [b.textContent, b.getAttribute("aria-pressed")]),
    [["Cheapest EN", "true"], ["This printing", "false"]]);
  row.querySelectorAll("button")[1].click();
  await wait();
  await done(w);
  assert.equal(browser.storage.local.data.settings.trendSource, "printing");
  assert.deepEqual(flagged(w), ["________ Goblin"]);
  assert.equal(w.document.querySelector(".cmc-source [aria-pressed=true]").textContent, "This printing");
  assert.equal(w.document.querySelectorAll(".cmc-overview").length, 1);
});

test("seller page, this printing: offers without a product id can't be priced and cost no call", async () => {
  // offers-list.html: only "High Deal" has a product id (555).
  const fetch = fakeScryfall({ byProductId: { 555: printing("high", 10, 20, "M10") }, prints: {} });
  const browser = fakeBrowser({ settings: { dealMode: "anyUnder", trendSource: "printing", englishOnly: true } });
  const w = loadPage(fixture("offers-list.html"), OFFER_SCRIPTS, fetch, { browser });
  await w.CMC.runOffers();
  assert.deepEqual(fetch.calls, ["/cards/cardmarket/555"]);
  assert.deepEqual(flagged(w), ["High Deal"]);
  const overview = text(w.document.querySelector(".cmc-overview"));
  assert.match(overview, /7 couldn't be priced/);
  assert.match(overview, /Low Deal: printing unknown \(no product ID\)/);
  assert.match(overview, /Skipped 1 non-English/, "language filter still runs first, without a call");
});

// ---------------------------------------------------------------------------
// Cart (real-cart-foil.html)
// Seller1: "Rumors of My Death" foil 0,81 + non-foil 0,28 (same product 313985), total 13,46
// Seller2: Adrix and Nev foil 5,00, total 7,60
// ---------------------------------------------------------------------------

function realFoilCart(settings) {
  const fetch = fakeScryfall({
    byProductId: {
      313985: printing("rumors", 0.3, 1, "Unhinged"),
      556296: printing("adrix", 2, 8, "Strixhaven"),
    },
    prints: { rumors: [print(0.3, "Unhinged")], adrix: [print(3, "Strixhaven")] },
  });
  const browser = fakeBrowser({ settings: { ...settings } });
  return { w: loadPage(fixture("real-cart-foil.html"), CART_SCRIPTS, fetch, { browser }), fetch, browser };
}

test("cart, this printing: foil and non-foil copies get their own trend; foil trend decides the verdict", async () => {
  const { w, fetch } = realFoilCart({ trendSource: "printing" });
  await w.CMC.run();
  assert.deepEqual(nameNotes(w), ["(Trend from: Unhinged, foil)", "(Trend from: Unhinged)", "(Trend from: Strixhaven, foil)"]);
  assert.deepEqual(priceNotes(w), [
    "▼ € 0,19 under / trend € 1,00", // foil copy at 0,81
    "▼ € 0,02 under / trend € 0,30", // non-foil copy at 0,28
    "▼ € 3,00 under / trend € 8,00", // foil at 5,00
  ]);
  assert.equal(cardmarketCalls(fetch).filter((c) => c.endsWith("313985")).length, 1, "one request for both copies");
  const panels = [...w.document.querySelectorAll(".shipment-block")];
  assert.ok(panels[0].classList.contains("cmc-block-bad"), "13,46 vs 1,30");
  assert.ok(panels[1].classList.contains("cmc-block-good"), "7,60 < 8,00 foil trend");
  assert.match(text(panels[1]), /Σ trend of these printings\s*€ 8,00/);
});

test("cart, cheapest EN (default): the same foil is compared with the cheapest English trend", async () => {
  const { w } = realFoilCart({});
  await w.CMC.run();
  const panels = [...w.document.querySelectorAll(".shipment-block")];
  assert.ok(panels[1].classList.contains("cmc-block-bad"), "7,60 vs 3,00");
  assert.match(text(panels[1]), /Σ trend \(cheapest EN\)\s*€ 3,00/);
});

test("cart, this printing: no foil trend -> that seller is incomplete, never green", async () => {
  const fetch = fakeScryfall({
    byProductId: { 313985: printing("rumors", 0.3, 1, "Unhinged"), 556296: printing("adrix", 20, null, "Strixhaven") },
    prints: {},
  });
  const browser = fakeBrowser({ settings: { trendSource: "printing" } });
  const w = loadPage(fixture("real-cart-foil.html"), CART_SCRIPTS, fetch, { browser });
  await w.CMC.run();
  const panels = [...w.document.querySelectorAll(".shipment-block")];
  assert.ok(panels[1].classList.contains("cmc-block-unknown"), "the non-foil trend (€20) is not used for a foil");
  assert.match(text(w.document.body), /No foil trend for this printing/);
});

test("cart switch: 'This printing' is saved and the cart is re-checked", async () => {
  const { w, browser } = realFoilCart({});
  await w.CMC.run();
  const buttons = w.document.querySelectorAll(".cmc-overview .cmc-source button");
  assert.deepEqual([...buttons].map((b) => b.textContent), ["Cheapest EN", "This printing"]);
  buttons[1].click();
  await wait();
  await done(w, /worth it ·/);
  assert.equal(browser.storage.local.data.settings.trendSource, "printing");
  assert.ok(w.document.querySelectorAll(".shipment-block")[1].classList.contains("cmc-block-good"));
  assert.equal(w.document.querySelectorAll(".cmc-cart-row").length, 4, "old rows are replaced, not doubled");
});

test("evaluate: in printing mode foil copies are keyed separately", () => {
  const w = loadPage("<body></body>", CART_SCRIPTS, null);
  const prices = new w.Map([["7", { trend: 1 }], ["7:foil", { trend: 4 }]]);
  const articles = [{ productId: "7", foil: true, unitPrice: 2, qty: 1 }, { productId: "7", foil: false, unitPrice: 0.5, qty: 1 }];
  assert.equal(w.CMC.evaluate({ total: 4.5, articles }, prices, "printing").trendSum, 5);
  assert.equal(w.CMC.evaluate({ total: 4.5, articles }, prices).trendSum, 2, "cheapest EN: same trend for both");
});
