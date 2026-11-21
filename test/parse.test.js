const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixture, loadPage, fakeScryfall, CART_SCRIPTS } = require("./helpers");

const w = loadPage("<body></body>", CART_SCRIPTS, fakeScryfall({ prints: {} }));
const { parseEuro, allEuros, cleanName } = w.CMC;

test("parseEuro handles Cardmarket price formats", () => {
  assert.equal(parseEuro("1.234,56 €"), 1234.56);
  assert.equal(parseEuro("0,02 €"), 0.02);
  assert.equal(parseEuro("€ 12.50"), 12.5);
  assert.equal(parseEuro("1,234.56 €"), 1234.56);
  assert.equal(parseEuro("1.050 €"), 1050);
  assert.equal(parseEuro("no price"), null);
  assert.equal(parseEuro(null), null);
});

test("allEuros finds every amount in order", () => {
  assert.deepEqual([...allEuros("Shipping 1,15 € Total 3,85 €")], [1.15, 3.85]);
});

test("cleanName strips version suffixes and whitespace", () => {
  assert.equal(cleanName("  Lightning Bolt (V.2) "), "Lightning Bolt");
  assert.equal(cleanName("Fire // Ice"), "Fire // Ice");
});

test("parseCart reads sellers, totals and articles", () => {
  const page = loadPage(fixture("cart.html"), CART_SCRIPTS, fakeScryfall({ prints: {} }));
  const cart = page.CMC.parseCart(page.document);
  assert.equal(cart.length, 3);
  assert.equal(cart[0].seller, "AliceCards");
  assert.equal(cart[0].total, 3.85);
  assert.equal(cart[0].articles[0].name, "Lightning Bolt");
  assert.equal(cart[0].articles[0].qty, 2);
  assert.equal(cart[0].articles[0].unitPrice, 0.8);
  assert.equal(cart[1].total, 1052.5);
  assert.equal(cart[2].total, 1.25);
});
