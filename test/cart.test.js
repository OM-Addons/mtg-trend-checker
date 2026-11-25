const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixture, loadPage, fakeScryfall, print, text, nameNotes, priceNotes, CART_SCRIPTS } = require("./helpers");

function cartPage() {
  const fetch = fakeScryfall({
    byProductId: { 100: "bolt", 200: "counter", 300: "solring" },
    prints: {
      // Cheapest English printing of Bolt is a foil-only promo (no non-foil trend).
      bolt: [print(900, "Alpha"), print(1.8, "M10"), { set_name: "Promo", set: "p", prices: { eur: null, eur_foil: "0.50" } }],
      counter: [print(0.9, "Masters 25"), { set_name: "No price", set: "x", prices: {} }],
      solring: [print(2.1, "Commander")],
    },
  });
  return { w: loadPage(fixture("cart.html"), CART_SCRIPTS, fetch), fetch };
}

test("each seller gets a verdict panel", async () => {
  const { w } = cartPage();
  await w.CMC.run();
  const panels = [...w.document.querySelectorAll(".shipment-block")];
  assert.equal(panels.length, 3);
  // Alice: total 3,85 vs 2 x 0,50 + 0,90 = 1,90 -> not worth it
  assert.ok(panels[0].classList.contains("cmc-block-bad"), text(panels[0]));
  // Bob: 1.052,50 vs 2,10 -> not worth it
  assert.ok(panels[1].classList.contains("cmc-block-bad"), text(panels[1]));
  // Carol: card unknown to Scryfall -> incomplete
  assert.ok(panels[2].classList.contains("cmc-block-unknown"), text(panels[2]));
});

test("cards: trend and difference per copy under the price, the set link under the name", async () => {
  const { w } = cartPage();
  await w.CMC.run();
  assert.deepEqual(nameNotes(w), ["(Trend from: Promo, foil)", "(Trend from: Masters 25)", "(Trend from: Commander)", "No English trend price found"]);
  assert.deepEqual(priceNotes(w), [
    "0,30 € ▲ / 0,50 € Trend", // 2x Bolt at 0,80 each: per copy, not per line
    "0,10 € ▲ / 0,90 € Trend",
    "1.047,90 € ▲ / 2,10 € Trend",
    "no trend", // the reason is under the name
  ]);
  assert.equal(w.document.querySelectorAll(".cmc-under").length, 0, "only prices under trend are green, not over");
  const priceCell = w.document.querySelector("[data-product-id='100'] td.price");
  assert.ok(priceCell.querySelector(".cmc-price-note"), "the trend is in the price cell itself");
});

test("priceNote: Cardmarket's format, amount first; arrow / Trend after it (in whole cents)", () => {
  const { w } = cartPage();
  const lines = (price, trend, opts) => [...w.CMC.priceNote(price, trend, opts).children].map(text);
  assert.deepEqual(lines(2.5, 7), ["4,50 € ▼", "7,00 € Trend"]);
  assert.deepEqual(lines(5.8, 5), ["0,80 € ▲", "5,00 € Trend"]);
  assert.deepEqual(lines(3, 3.0000001), ["0,00 € =", "3,00 € Trend"]);
  assert.deepEqual(lines(1050, 2.1), ["1.047,90 € ▲", "2,10 € Trend"]);
  assert.deepEqual(lines(8, 10, { pct: "20" }), ["2,00 € ▼ (20%) 🔥", "10,00 € Trend"], "deal: % and fire after the arrow");
  // The amount and the text after it are separate, so the amounts line up under the price.
  const first = w.CMC.priceNote(2.5, 7).firstElementChild;
  assert.equal(text(first.querySelector(".cmc-amount")), "4,50 €");
  assert.equal(text(first.querySelector(".cmc-suffix")), "▼");
});

test("cart rows without a price cell keep the full note under the name", async () => {
  const { w } = cartPage();
  w.document.querySelector("[data-product-id='200'] td.price").className = "something-else";
  await w.CMC.run();
  assert.equal(nameNotes(w)[1], "Cheapest EN trend: € 0,90 (Masters 25)");
});

test("evaluate: worth it only when the total is strictly lower than the trend sum", () => {
  const { w } = cartPage();
  const prices = new w.Map([["1", { trend: 2 }]]);
  const r = w.CMC.evaluate({ total: 3, articles: [{ productId: "1", unitPrice: 1, qty: 2 }] }, prices);
  assert.equal(r.worth, true);
  assert.equal(r.shipping, 1);
  const equal = w.CMC.evaluate({ total: 4, articles: [{ productId: "1", unitPrice: 1, qty: 2 }] }, prices);
  assert.equal(equal.worth, false);
});

test("running twice doesn't duplicate annotations", async () => {
  const { w } = cartPage();
  await w.CMC.run();
  await w.CMC.run();
  assert.equal(w.document.querySelectorAll(".cmc-cart-row").length, 6, "two rows per seller");
  assert.equal(w.document.querySelectorAll(".cmc-overview").length, 1);
});

test("cart: trend link is a Cardmarket search, not Scryfall's idProduct link", async () => {
  const fetch = fakeScryfall({
    byProductId: { 100: "Lightning Bolt", 200: "Counterspell", 300: "Sol Ring" },
    prints: {
      "Lightning Bolt": [{ ...print(1.8, "M10"), purchase_uris: { cardmarket: "https://www.cardmarket.com/en/Magic/Products?idProduct=1&referrer=scryfall" } }],
      Counterspell: [print(0.9, "Masters 25")],
      "Sol Ring": [print(2.1, "Commander")],
    },
  });
  const w = loadPage(fixture("cart.html"), CART_SCRIPTS, fetch);
  await w.CMC.run();
  const hrefs = [...w.document.querySelectorAll(".cmc-link")].map((a) => a.getAttribute("href"));
  assert.ok(hrefs.length > 0);
  assert.ok(hrefs.every((h) => h.startsWith("https://www.cardmarket.com/en/Magic/Products/Search?searchString=")), hrefs.join("\n"));
  assert.ok(hrefs.includes("https://www.cardmarket.com/en/Magic/Products/Search?searchString=Lightning%20Bolt"));
});
