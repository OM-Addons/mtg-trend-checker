// @ts-check
// Guards the self-hosted update setup: if these drift apart, installed
// copies silently stop updating.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
/** @param {string} file */
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));

const manifest = readJson("extension/manifest.json");
const pkg = readJson("package.json");
const updates = readJson("updates.json");
const gecko = manifest.browser_specific_settings.gecko;

test("add-on ID is the final one (never change it after the first signed release)", () => {
  assert.equal(gecko.id, "mtg-trend-checker@mtg-tools");
});

test("update_url points to updates.json on main of the public repo", () => {
  assert.equal(
    gecko.update_url,
    "https://raw.githubusercontent.com/OM-Addons/mtg-trend-checker/main/updates.json"
  );
});

test("updates.json lists exactly the manifest's add-on ID with valid entries", () => {
  assert.deepEqual(Object.keys(updates.addons), [gecko.id]);
  for (const entry of updates.addons[gecko.id].updates) {
    assert.match(entry.version, /^\d+\.\d+\.\d+$/);
    assert.ok(
      entry.update_link.startsWith(
        `https://github.com/OM-Addons/mtg-trend-checker/releases/download/v${entry.version}/`
      ),
      `bad update_link for ${entry.version}`
    );
    assert.match(entry.update_hash, /^sha256:[0-9a-f]{64}$/);
  }
});

test("manifest and package.json have the same version", () => {
  assert.equal(manifest.version, pkg.version);
});
