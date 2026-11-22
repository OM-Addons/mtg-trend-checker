// Shopping wizard results (real-wizard.html: 15 sellers, 28 cards, 2 of them foil,
// grand total € 200,82). Same "worth it" rule as the cart, per seller and overall.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixture, loadPage, fakeBrowser, fakeScryfall, print, printing, text, WIZARD_SCRIPTS } = require("./helpers");

const plain = (v) => JSON.parse(JSON.stringify(v));
const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));

/** Every card of the fixture with its offer price (product id -> price), read once without lookups. */
function cardsOfFixture() {
  const w = loadPage(fixture("real-wizard.html"), WIZARD_SCRIPTS, null);
  return w.CMC.parseWizard(w.document).shipments.flatMap((s) => s.articles.map((a) => [a.productId, a.unitPrice]));
}

/**
 * Fake Scryfall for the fixture. By default every card's trend equals its offer price, so each
 * seller is "not worth it" by exactly its shipping. `trends` overrides per product id:
 * a number (same for both modes), or {eur, foil} for the printing, null = unknown card.
 * @param {(price: number) => number} [base]
 */
function wizardScryfall(trends = {}, base = (p) => p) {
  const byProductId = {};
  const prints = {};
  for (const [pid, price] of cardsOfFixture()) {
    const t = pid in trends ? trends[pid] : base(price);
    if (t == null) continue;
    const eur = typeof t === "number" ? t : t.eur;
    const foil = typeof t === "number" ? t : t.foil;
    byProductId[pid] = printing(`o${pid}`, eur, foil, `Set ${pid}`);
    prints[`o${pid}`] = [print(eur, `Set ${pid}`)];
  }
  return fakeScryfall({ byProductId, prints });
}

/** @param {object} [trends] @param {object} [settings] @param {(price: number) => number} [base] */
function wizardPage(trends, settings = {}, base) {
  const fetch = wizardScryfall(trends, base);
  const browser = fakeBrowser({ settings });
  return { w: loadPage(fixture("real-wizard.html"), WIZARD_SCRIPTS, fetch, { browser }), fetch, browser };
}

const blocks = (w) => [...w.document.querySelectorAll(".detailed-result-card")];
const kindOf = (block) => ["good", "bad", "unknown"].find((k) => block.classList.contains(`cmc-block-${k}`)) || null;
const addedRows = (dl) => [...dl.querySelectorAll("dt.cmc-wiz-row")].map((dt) => `${text(dt)} ${text(dt.nextElementSibling)}`.trim());

// Seller2: 1 card at € 1,00, total € 2,55. Seller3: € 3 + € 9, total € 14,60.
// Seller4: foil Boros Charm (796173) € 3,99 + € 8,99 + € 7,99, total € 22,52. Seller5: 1 card (919101), total € 4,83.
const TRENDS = {
  919102: 2.55, // Seller2: Σ trend = total -> NOT worth it (strictly lower)
  786368: 5, 759962: 10, // Seller3: Σ 15,00 > 14,60 -> worth it, save € 0,40
  796173: { eur: 1, foil: 6 }, // Seller4: cheapest EN Σ 17,98 -> not; this printing (foil) Σ 22,98 -> worth it
  919101: null, // Seller5: unknown to Scryfall -> incomplete
};

test("wizard page: every seller block and card is read once (desktop table, not the mobile copy)", () => {
  const w = loadPage(fixture("real-wizard.html"), WIZARD_SCRIPTS, null);
  const r = w.CMC.parseWizard(w.document);
  assert.equal(r.total, 200.82);
  assert.equal(r.shipments.length, 15);
  assert.equal(r.shipments.flatMap((s) => s.articles).length, 28);
  assert.equal(r.shipments.flatMap((s) => s.articles).filter((a) => a.foil).length, 2);
  assert.deepEqual(plain(r.shipments.slice(2, 4).map((s) => ({ seller: s.seller, total: s.total, articles: s.articles.map(({ el, ...a }) => a) }))), [
    { seller: "Seller3", total: 14.6, articles: [
      { productId: "786368", name: "Dollmaker's Shop // Porcelain Gallery", unitPrice: 3, qty: 1, foil: false },
      { productId: "759962", name: "Ajani, Nacatl Pariah // Ajani, Nacatl Avenger", unitPrice: 9, qty: 1, foil: false },
    ] },
    { seller: "Seller4", total: 22.52, articles: [
      { productId: "864974", name: "Springleaf Parade", unitPrice: 8.99, qty: 1, foil: false },
      { productId: "920262", name: "Heroic Intervention", unitPrice: 7.99, qty: 1, foil: false },
      { productId: "796173", name: "Boros Charm", unitPrice: 3.99, qty: 1, foil: true },
    ] },
  ]);
});

test("wizard page: per seller verdict in Cardmarket's list, strictly lower, incomplete never green", async () => {
  const { w } = wizardPage(TRENDS);
  await w.CMC.runWizard();
  const b = blocks(w);
  assert.deepEqual(b.slice(0, 5).map(kindOf), ["bad", "bad", "good", "bad", "unknown"]);
  assert.deepEqual(addedRows(b[2].querySelector("dl")), ["Σ trend (cheapest EN) € 15,00", "✅ Worth it: you save € 0,40"]);
  assert.deepEqual(addedRows(b[1].querySelector("dl")), ["Σ trend (cheapest EN) € 2,55", "❌ Not worth it: equal to trend € 0,00"], "equal is not worth it");
  assert.deepEqual(addedRows(b[4].querySelector("dl")), ["Σ trend (cheapest EN) € 0,00 (excl. 1)", "⚠️ Incomplete: no price for 1 card(s)"]);
  // The new rows go before Cardmarket's "Selected Articles Value", which stays last.
  const dl = b[2].querySelector("dl");
  assert.ok(dl.lastElementChild.classList.contains("selected-articles-value"));
});

test("wizard page: each card gets the cart's note and price bar", async () => {
  const { w } = wizardPage(TRENDS);
  await w.CMC.runWizard();
  const rows = [...blocks(w)[2].querySelectorAll("table tbody tr")];
  assert.deepEqual(rows.map((r) => text(r.querySelector(".cmc-note"))), ["Cheapest EN trend: € 5,00 (Set 786368)", "Cheapest EN trend: € 10,00 (Set 759962)"]);
  assert.ok(rows.every((r) => r.classList.contains("cmc-row-good")));
  assert.match(text(blocks(w)[4]), /No English trend price found/);
});

test("wizard page: overall verdict in the Results Summary and the overview box", async () => {
  // Every trend 20% above the offer price: Σ 208,40 vs grand total 200,82.
  const { w } = wizardPage({}, {}, (p) => Math.round(p * 120) / 100);
  await w.CMC.runWizard();
  const summary = w.document.querySelector("#ShoppingWizardResult dl");
  assert.deepEqual(addedRows(summary), ["Σ trend (cheapest EN) € 208,40", "✅ Worth it: you save € 7,58"]);
  const box = text(w.document.querySelector(".cmc-overview"));
  assert.match(box, /MTG wizard check/);
  assert.match(box, /Overall: ✅ Worth it, you save € 7,58/);
  assert.match(box, /\d+ worth it · \d+ not · 0 unknown/);
  assert.match(box, /Seller3: € 14,60 vs € 14,40/);
});

test("wizard page: one card without a trend makes the whole result incomplete", async () => {
  const { w } = wizardPage(TRENDS);
  await w.CMC.runWizard();
  assert.deepEqual(addedRows(w.document.querySelector("#ShoppingWizardResult dl")).slice(1), ["⚠️ Incomplete: no price for 1 card(s)"]);
  assert.match(text(w.document.querySelector(".cmc-overview")), /Overall: ⚠️ Incomplete: no price for 1 card\(s\)/);
  assert.match(text(w.document.querySelector(".cmc-overview")), /1 worth it · 13 not · 1 unknown/);
});

test("wizard page, this printing: a foil is compared with its foil trend", async () => {
  const { w } = wizardPage(TRENDS, { trendSource: "printing" });
  await w.CMC.runWizard();
  const b = blocks(w)[3];
  assert.equal(kindOf(b), "good", "22,52 < 8,99 + 7,99 + 6,00");
  assert.deepEqual(addedRows(b.querySelector("dl")), ["Σ trend of these printings € 22,98", "✅ Worth it: you save € 0,46"]);
  assert.match(text(b), /Trend of this printing: € 6,00 \(Set 796173, foil\)/);
});

test("wizard page: the trend switch is saved and the page is re-checked without doubling rows", async () => {
  const { w, browser } = wizardPage(TRENDS);
  await w.CMC.runWizard();
  assert.equal(kindOf(blocks(w)[3]), "bad");
  const buttons = w.document.querySelectorAll(".cmc-overview .cmc-source button");
  buttons[1].click();
  for (let i = 0; i < 100 && !/worth it ·/.test(text(w.document.querySelector(".cmc-overview"))); i++) await wait(25);
  await wait();
  assert.equal(browser.storage.local.data.settings.trendSource, "printing");
  assert.equal(kindOf(blocks(w)[3]), "good");
  assert.equal(blocks(w)[3].querySelectorAll("dt.cmc-wiz-row").length, 2);
  assert.equal(w.document.querySelectorAll(".cmc-overview").length, 1);
});

test("wizard page: running twice doesn't duplicate rows, notes or classes", async () => {
  const { w } = wizardPage(TRENDS);
  await w.CMC.runWizard();
  await w.CMC.runWizard();
  assert.equal(w.document.querySelectorAll("#ShoppingWizardResult dt.cmc-wiz-row").length, 2);
  assert.equal(w.document.querySelectorAll(".cmc-note").length, 28);
});

test("wizard page: the checkboxes don't change the verdict (whole result, like Cardmarket's Total)", async () => {
  const { w } = wizardPage(TRENDS);
  for (const cb of blocks(w)[2].querySelectorAll("input[type=checkbox]")) cb.checked = false;
  await w.CMC.runWizard();
  assert.deepEqual(addedRows(blocks(w)[2].querySelector("dl")), ["Σ trend (cheapest EN) € 15,00", "✅ Worth it: you save € 0,40"]);
});

test("wizard page: seller blocks may grow to fit the added rows, and only while checked", async () => {
  const { w, browser } = wizardPage(TRENDS);
  await w.CMC.runWizard();
  const b = blocks(w)[7]; // Seller8: 5 cards
  assert.ok(b.classList.contains("cmc-grow"), "block");
  assert.ok(b.querySelector(":scope > .card-body").classList.contains("cmc-grow"), "block body");
  assert.ok(b.parentElement.classList.contains("cmc-grow"), "its column");
  browser.storage.local.data.settings = { enabled: false };
  await w.CMC.runWizard();
  assert.equal(w.document.querySelectorAll(".cmc-grow").length, 0, "off: Cardmarket's layout is left alone");
});

test("wizard page while off: nothing is parsed or looked up", async () => {
  const { w, fetch } = wizardPage(TRENDS, { enabled: false });
  await w.CMC.runWizard();
  assert.equal(fetch.calls.length, 0);
  assert.equal(w.document.querySelectorAll(".cmc-wiz-row, .cmc-note, .cmc-overview").length, 0);
  assert.ok(w.document.querySelector(".cmc-off-box"));
});

test("wizard page: lookups are shared, each product once", async () => {
  const { w, fetch } = wizardPage(TRENDS);
  await w.CMC.runWizard();
  const ids = fetch.calls.filter((c) => c.startsWith("/cards/cardmarket/"));
  assert.equal(ids.length, new Set(ids).size);
  assert.equal(ids.length, 28);
});

// Quantity > 1 hasn't been seen on a real page yet: the price column is read as per copy,
// unless the sum per line matches Cardmarket's "Articles Value" better.
function qtyBlock(price, articlesValue) {
  return `<section><div id="ShoppingWizardResult"><dl><dt>Total</dt><dd>${articlesValue + 2},00 €</dd></dl></div></section>
  <div class="row"><div class="card detailed-result-card"><div class="card-body">
    <span class="seller-name"><a href="/en/Magic/Users/Seller1">Seller1</a></span>
    <dl><dt>Articles Value</dt><dd>${articlesValue},00 €</dd><dt>Shipping Cost</dt><dd>2,00 €</dd><dt>Total</dt><dd>${articlesValue + 2},00 €</dd></dl>
    <table><tbody><tr><td></td><td><span data-bs-title="&lt;img src=&quot;https://x/1/S/111/111.jpg&quot;&gt;"></span></td>
      <td>3</td><td class="card-name">Some Card</td><td></td><td></td><td></td><td></td><td>${price},00 €</td></tr></tbody></table>
  </div></div></div>`;
}

test("wizard page: price per copy vs per line is decided by Cardmarket's Articles Value", () => {
  const perCopy = loadPage(qtyBlock(2, 6), WIZARD_SCRIPTS, null);
  assert.equal(perCopy.CMC.parseWizard(perCopy.document).shipments[0].articles[0].unitPrice, 2);
  const perLine = loadPage(qtyBlock(6, 6), WIZARD_SCRIPTS, null);
  const a = perLine.CMC.parseWizard(perLine.document).shipments[0].articles[0];
  assert.deepEqual([a.qty, a.unitPrice], [3, 2]);
});
