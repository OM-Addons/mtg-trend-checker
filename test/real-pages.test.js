// Tests on REAL Cardmarket pages (saved by the owner, anonymised with
// scripts/clean-page.js). These catch differences between the hand-made
// fixtures and the live site.
const { test } = require("node:test");
const assert = require("node:assert/strict");
/** Copy values out of the jsdom window so deepEqual compares plain data. */
const plain = (v) => JSON.parse(JSON.stringify(v));
const { fixture, loadPage, fakeScryfall, print, text, CART_SCRIPTS, OFFER_SCRIPTS } = require("./helpers");

// ---------------------------------------------------------------------------
// Cart (real-cart.html): 2 sellers, 1 card each.
// Seller1: Daughter of the Deep 2,50 + shipping 3,74 = 6,24
// Seller2: Bennie Bracks, Zoologist 6,00 + shipping 2,55 = 8,55
// ---------------------------------------------------------------------------

function realCart() {
  const fetch = fakeScryfall({
    byProductId: { 891958: "daughter", 753334: "bennie" },
    prints: { daughter: [print(7, "Marvel")], bennie: [print(8, "Bloomburrow")] },
  });
  return { w: loadPage(fixture("real-cart.html"), CART_SCRIPTS, fetch), fetch };
}

test("real cart: each card counted once (desktop and mobile copies)", () => {
  const { w } = realCart();
  const shipments = w.CMC.parseCart(w.document);
  assert.deepEqual(
    plain(shipments.map((s) => ({ seller: s.seller, total: s.total, articles: s.articles.map(({ el, ...a }) => a) }))),
    [
      { seller: "Seller1", total: 6.24, articles: [{ productId: "891958", name: "Daughter of the Deep", unitPrice: 2.5, qty: 1, foil: false }] },
      { seller: "Seller2", total: 8.55, articles: [{ productId: "753334", name: "Bennie Bracks, Zoologist", unitPrice: 6, qty: 1, foil: false }] },
    ]
  );
});

test("real cart: verdict per seller", async () => {
  const { w } = realCart();
  await w.CMC.run();
  const panels = [...w.document.querySelectorAll(".cmc-panel")];
  assert.equal(panels.length, 2);
  // 6,24 < 1 x 7,00 -> worth it; 8,55 > 1 x 8,00 -> not
  assert.ok(panels[0].classList.contains("cmc-good"), text(panels[0]));
  assert.ok(panels[1].classList.contains("cmc-bad"), text(panels[1]));
});

test("real cart: the overview doesn't rely on colour alone (symbols for colour-blind users)", async () => {
  const { w } = realCart();
  await w.CMC.run();
  const box = w.document.querySelector(".cmc-overview");
  assert.deepEqual([...box.querySelectorAll(".cmc-list li")].map(text), [
    "✅ Seller1: € 6,24 vs € 7,00",
    "❌ Seller2: € 8,55 vs € 8,00",
  ]);
  assert.match(text(box), /✅ 1 worth it · ❌ 1 not · ⚠️ 0 unknown/);
});

// ---------------------------------------------------------------------------
// Seller page (real-offers-list.html): 20 English offers, only 3 at €1 or more,
// all three with a product id in the thumbnail. Rows whose image is
// "not available" have no product id at all (name lookup is the fallback).
// ---------------------------------------------------------------------------

function realOffers() {
  const fetch = fakeScryfall({
    byProductId: { 718747: "realm", 718712: "nazgul", 718682: "moria" },
    prints: {
      realm: [print(2, "LTR Art Series")], // 1,20 vs 2,00 = 40% under -> deal (needs 25%)
      nazgul: [print(2.2, "LTR Art Series")], // 2,00 vs 2,20 = 9% -> no deal
      moria: [print(1.6, "LTR Art Series")], // 1,50 vs 1,60 = 6% -> no deal
    },
  });
  return { w: loadPage(fixture("real-offers-list.html"), OFFER_SCRIPTS, fetch), fetch };
}

test("real seller page: all offers parsed with price and language", () => {
  const { w } = realOffers();
  const offers = w.CMC.parseOffers(w.document);
  assert.equal(offers.length, 20);
  assert.ok(offers.every((o) => o.language === "English"));
  assert.ok(offers.every((o) => typeof o.price === "number"));
  assert.deepEqual(plain(offers.slice(0, 2).map((o) => [o.name, o.price, o.productId])), [
    ["Ajani, the Greathearted", 0.8, "371799"],
    ["Alabaster Host Intercessor", 0.02, "704728"],
  ]);
  assert.equal(offers.filter((o) => o.productId).length, 7);
});

test("real seller page: only the 3 offers from €1 are looked up, one is a deal", async () => {
  const { w, fetch } = realOffers();
  await w.CMC.runOffers();
  const byId = fetch.calls.filter((c) => c.startsWith("/cards/cardmarket/")).sort();
  assert.deepEqual(plain(byId), ["/cards/cardmarket/718682", "/cards/cardmarket/718712", "/cards/cardmarket/718747"]);
  assert.ok(!fetch.calls.some((c) => c.startsWith("/cards/named")), "no name lookups for cheap cards");

  const deals = [...w.document.querySelectorAll(".cmc-deal-row")];
  assert.equal(deals.length, 1);
  assert.match(text(deals[0]), /Realm Seekers/);
  assert.equal(w.document.querySelectorAll(".cmc-note").length, 3);
});
