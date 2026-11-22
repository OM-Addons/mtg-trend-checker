// @ts-check
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "extension", "src", "styles.css"), "utf8");

/** Declarations of the rule whose selector is exactly `selector`. @param {string} selector */
function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = css.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`));
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
