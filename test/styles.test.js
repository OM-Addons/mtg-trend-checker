// @ts-check
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "extension", "src", "styles.css"), "utf8");

/** Declarations of the rule whose selector is exactly `selector`. @param {string} selector */
function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // The rule starts the file or follows another rule or a comment.
  const m = css.match(new RegExp(`(?:^|\\}|\\*/)\\s*${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `no rule for ${selector}`);
  return m[1];
}

// Buttons get the system colour ButtonText, which is near-white with a dark
// Firefox/OS theme. Our buttons have a light background, so they must set
// their own text colour or the labels become invisible.
test(".cmc-unmasonry fallback turns Masonry's absolute positions off", () => {
  assert.match(rule(".cmc-unmasonry"), /(^|;|\s)height\s*:\s*auto\s*!important/);
  assert.match(rule(".cmc-unmasonry > *"), /position\s*:\s*static\s*!important/);
});

test(".cmc-btn sets its own text colour (readable with a dark Firefox theme)", () => {
  assert.match(rule(".cmc-btn"), /(^|;|\s)color\s*:/);
});

test("minimized overview box: only the one-line bar shows, and the bar only while minimized", () => {
  assert.match(rule(".cmc-overview.cmc-minimized > :not(.cmc-mini)"), /display\s*:\s*none/);
  assert.match(rule(".cmc-overview:not(.cmc-minimized) > .cmc-mini"), /display\s*:\s*none/);
});

// Cardmarket may lay the name cell out as a row (flexbox): then our "(Trend from: …)" line
// would sit next to the name. It must always get a line of its own below the name.
test("the note under the card name always gets its own line, also in a flex cell", () => {
  assert.match(rule(".cmc-name-cell"), /flex-wrap\s*:\s*wrap\s*!important/);
  assert.match(rule(".cmc-name-note"), /flex\s*:\s*0 0 100%/);
  assert.match(rule(".cmc-name-note"), /width\s*:\s*100%/);
});

// Lines under the price (owner's layout A): the amounts end exactly where Cardmarket's price
// ends; the arrow / "Trend" hang to the right of it, outside the layout, so they never push
// the amounts left or make the box wider or taller.
test("price lines: amounts line up under the price, the text after them hangs to the right", () => {
  assert.match(rule(".cmc-price-note"), /text-align\s*:\s*right/);
  assert.match(rule(".cmc-price-note"), /white-space\s*:\s*nowrap/);
  assert.match(rule(".cmc-line"), /position\s*:\s*relative/);
  assert.match(rule(".cmc-suffix"), /position\s*:\s*absolute/);
  assert.match(rule(".cmc-suffix"), /left\s*:\s*100%/);
});

// Cardmarket (users_offers_offers.css, desktop): .price-container is a fixed 4.75rem and
// .col-offer a fixed 260px (280px from 1200px). Padding inside the fixed price box squeezed the
// price out to the left (owner's report), so the room must come on top of those widths.
test("seller pages: room for the hanging text comes on top of Cardmarket's fixed widths", () => {
  const room = rule(".cmc-price-room");
  assert.match(room, /box-sizing\s*:\s*content-box\s*!important/, "padding adds to the 4.75rem, not inside it");
  assert.match(room, /padding-right\s*:\s*4\.75rem\s*!important/);
  assert.match(css, /@media \(min-width: 992px\)\s*\{\s*\.cmc-offer-room\s*\{\s*width\s*:\s*calc\(260px \+ 4\.75rem\)\s*!important/);
  assert.match(css, /@media \(min-width: 1200px\)\s*\{\s*\.cmc-offer-room\s*\{\s*width\s*:\s*calc\(280px \+ 4\.75rem\)\s*!important/);
});

// Cart and wizard: the label sits before the amount inside the price cell (left edge), the
// amount stays at the right edge under the price, so nothing hangs out of the cell.
test("cart/wizard price lines: label left, amount right, nothing hanging out", () => {
  assert.match(rule(".cmc-labels-first .cmc-line"), /display\s*:\s*flex/);
  assert.match(rule(".cmc-labels-first .cmc-line"), /justify-content\s*:\s*space-between/);
  assert.match(rule(".cmc-labels-first .cmc-suffix"), /position\s*:\s*static/);
});
