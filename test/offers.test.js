const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixture, loadPage, fakeScryfall, print, text, OFFER_SCRIPTS } = require("./helpers");

// ---------------------------------------------------------------------------
// Thresholds (pure logic)
// ---------------------------------------------------------------------------

test("default price brackets map to the right required discount (each start is inclusive)", () => {
  const w = loadPage("<body></body>", OFFER_SCRIPTS, fakeScryfall({ prints: {} }));
  const { requiredDiscount, DEFAULTS: s } = w.CMC;
  assert.equal(requiredDiscount(null, s), null);
  assert.equal(requiredDiscount(0.99, s), null);
  assert.equal(requiredDiscount(1, s), 25);
  assert.equal(requiredDiscount(2.99, s), 25);
  assert.equal(requiredDiscount(3, s), 15);
  assert.equal(requiredDiscount(4.99, s), 15);
  assert.equal(requiredDiscount(5, s), 10); // from €5 on: 10% (was 15% before ranges became editable)
  assert.equal(requiredDiscount(500, s), 10);
});

test("judge: exact threshold counts as a deal (no float noise) and custom % apply", () => {
  const w = loadPage("<body></body>", OFFER_SCRIPTS, fakeScryfall({ prints: {} }));
  const { judge, DEFAULTS: s } = w.CMC;
  assert.equal(judge(9, 10, s).deal, true); // exactly 10%
  assert.equal(judge(1.8, 2.2, s).deal, false); // 18% < 25%
  assert.equal(judge(1.8, 2.2, { ...s, brackets: [{ from: 1, pct: 15 }] }).deal, true);
});

// ---------------------------------------------------------------------------
// List layout
// ---------------------------------------------------------------------------

function listPage() {
  const trends = { "Low Deal": 2.0, "Low NoDeal": 2.2, "Mid Deal": 4.0, "High Deal": 10.0, "High NoDeal": 10.0, "Boundary Five": 5.8, "German Deal": 10, "Above Trend": 2.5 };
  const fetch = fakeScryfall({
    byProductId: { 555: "High Deal" },
    byName: Object.fromEntries(Object.keys(trends).map((n) => [n, n])),
    prints: Object.fromEntries(Object.entries(trends).map(([n, t]) => [n, [print(t, "S"), print(99, "Pricey")]])),
  });
  return { w: loadPage(fixture("offers-list.html"), OFFER_SCRIPTS, fetch), fetch };
}

test("list layout: rows, product id from thumbnail, language", () => {
  const { w } = listPage();
  const offers = w.CMC.parseOffers(w.document);
  assert.equal(offers.length, 9);
  assert.equal(offers[4].productId, "555");
  assert.equal(offers[6].language, "German");
  assert.equal(offers[7].name, "Boundary Five");
});

test("list layout: deals are flagged, others show just the trend price", async () => {
  const { w } = listPage();
  await w.CMC.runOffers();
  const flagged = [...w.document.querySelectorAll(".cmc-deal-row")].map((r) => r.querySelector("a").textContent);
  // Boundary Five: €5.00 vs €5.80 trend = 13.8% under; €5 falls in the "from €5" range (10%), so a deal.
  assert.deepEqual(flagged, ["Low Deal", "Mid Deal", "High Deal", "Boundary Five (V.2)"]);

  const notes = [...w.document.querySelectorAll(".cmc-note")].map(text);
  assert.ok(notes.includes("🔥 25% under EN trend € 2,00 (S)"));
  // Non-deals, including above trend: price only, no percentage
  assert.ok(notes.includes("EN trend € 2,20 (S)"));
  assert.ok(notes.includes("EN trend € 2,50 (S)"), "above-trend card still shows its trend");
  assert.ok(notes.filter((n) => !n.startsWith("🔥")).every((n) => !n.includes("%")));
});

test("no Scryfall calls for cards under €1 or non-English cards", async () => {
  const { w, fetch } = listPage();
  await w.CMC.runOffers();
  assert.ok(!fetch.calls.some((c) => c.includes("Cheap Card")));
  assert.ok(!fetch.calls.some((c) => c.includes("German Deal")));
  assert.ok(fetch.calls.some((c) => c.includes("/cards/cardmarket/555")), "uses the thumbnail product id");
});

test("hovering a card name shows price read and trend", async () => {
  const { w } = listPage();
  await w.CMC.runOffers();
  const link = w.document.querySelector("#articleRow3 a");
  assert.match(link.title.replace(/\s/g, " "), /Price read: € 1,80 · cheapest EN trend: € 2,20 \(S\)/);
});

// ---------------------------------------------------------------------------
// Table layout
// ---------------------------------------------------------------------------

test("table layout: parses rows, languages and puts notes in the name cell", async () => {
  const trend = { 100: 12, 200: 12.5, 300: 30, 400: 5, 500: 10 };
  const fetch = fakeScryfall({
    byProductId: Object.fromEntries(Object.keys(trend).map((id) => [id, id])),
    prints: Object.fromEntries(Object.entries(trend).map(([id, t]) => [id, [print(t, "S")]])),
  });
  const w = loadPage(fixture("offers-table.html"), OFFER_SCRIPTS, fetch);

  const offers = w.CMC.parseOffers(w.document);
  assert.equal(offers.length, 5);
  assert.equal(offers.map((o) => o.language).join(), "English,English,S-Chinese,English,Japanese");
  assert.equal(offers[0].productId, "100");
  assert.equal(offers[1].name, "Necropotence");

  await w.CMC.runOffers();
  assert.equal(w.document.querySelectorAll(".cmc-deal-row").length, 1); // Dualcaster 9 vs 12 = 25%
  const notes = [...w.document.querySelectorAll(".cmc-note")];
  assert.ok(notes.every((n) => n.parentElement.className === "name"));
  assert.ok(!fetch.calls.some((c) => /\/(300|400|500)$/.test(c)), "no calls for cheap/non-English");
});

// ---------------------------------------------------------------------------
// Robustness
// ---------------------------------------------------------------------------

test("page with no recognisable offers shows a diagnostic message", async () => {
  const w = loadPage("<body><p>nothing</p></body>", OFFER_SCRIPTS, fakeScryfall({ prints: {} }));
  await w.CMC.runOffers();
  assert.match(text(w.document.querySelector(".cmc-overview")), /No card offers recognised/);
});

test("rows added during a run are checked; unknown cards are listed", async () => {
  const row = (id, name, price) => `<div id="articleRow${id}" class="row article-row"><div class="col-seller"><a href="/en/Magic/Products/Singles/S/${name}">${name}</a></div><div class="product-attributes"><span class="icon" aria-label="English"></span></div><div class="col-offer"><div class="price-container"><span class="color-primary">${price}</span></div></div></div>`;
  const inner = fakeScryfall({ byName: { Known: "k", Late: "l" }, prints: { k: [print(10)], l: [print(10)] } });
  let injected = false;
  let w;
  const fetch = async (url) => {
    // Simulate Cardmarket adding a row while the first lookup is in flight.
    if (!injected) { injected = true; w.document.querySelector(".table-body").insertAdjacentHTML("beforeend", row(3, "Late", "4,00 €")); }
    return inner(url);
  };
  w = loadPage(`<body><div class="table-body">${row(1, "Known", "1,00 €")}${row(2, "Mystery", "2,00 €")}</div></body>`, OFFER_SCRIPTS, fetch);

  await w.CMC.runOffers();
  await new Promise((r) => setTimeout(r, 2500)); // the automatic re-run
  const flagged = [...w.document.querySelectorAll(".cmc-deal-row .col-seller > a")].map((a) => a.textContent);
  assert.ok(flagged.includes("Late"), "row added during the run must be processed");

  const overview = text(w.document.querySelector(".cmc-overview"));
  assert.match(overview, /1 couldn't be priced/);
  assert.match(overview, /Mystery: no English trend found/);
  assert.ok(inner.calls.some((c) => c.includes("fuzzy=Mystery")), "fuzzy name fallback is tried");
});

test("overview has no 'hover a card name' hint (owner's wish), but the tooltips are still there", async () => {
  const { w } = listPage();
  await w.CMC.runOffers();
  assert.doesNotMatch(text(w.document.querySelector(".cmc-overview")), /hover/i);
  assert.ok(w.document.querySelector("#articleRow3 a").title.startsWith("Price read:"));
});
