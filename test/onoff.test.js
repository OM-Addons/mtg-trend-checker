// On/off switch in the overview box (cart and seller pages). Off is saved in settings,
// so every Cardmarket page shows only an "On" button and makes no Scryfall calls.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { fixture, loadPage, fakeBrowser, fakeScryfall, print, text, CART_SCRIPTS, OFFER_SCRIPTS, WIZARD_SCRIPTS } = require("./helpers");

/** Waits until `fn()` is truthy (the click handlers save and re-check asynchronously). */
async function until(fn, ms = 10000) {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error("timed out waiting for the page");
    await new Promise((r) => setTimeout(r, 20));
  }
}

function sellerPage(settings) {
  const trends = { "Low Deal": 2.0, "Mid Deal": 4.0, "High Deal": 10.0 };
  const fetch = fakeScryfall({
    byName: Object.fromEntries(Object.keys(trends).map((n) => [n, n])),
    prints: Object.fromEntries(Object.entries(trends).map(([n, t]) => [n, [print(t, "S")]])),
  });
  const browser = fakeBrowser(settings ? { settings } : {});
  return { w: loadPage(fixture("offers-list.html"), OFFER_SCRIPTS, fetch, { browser }), fetch, browser };
}

function cartPage(settings) {
  const fetch = fakeScryfall({ byProductId: { 100: "bolt" }, prints: { bolt: [print(1.8, "M10")] } });
  const browser = fakeBrowser(settings ? { settings } : {});
  return { w: loadPage(fixture("cart.html"), CART_SCRIPTS, fetch, { browser }), fetch, browser };
}

const button = (w, label) => [...w.document.querySelectorAll(".cmc-power")].find((b) => text(b).includes(label));

test("seller page while off: no Scryfall calls, no notes, only an On button", async () => {
  const { w, fetch } = sellerPage({ enabled: false });
  await w.CMC.runOffers();
  assert.deepEqual(fetch.calls, []);
  assert.equal(w.document.querySelectorAll(".cmc-note, .cmc-deal-row, .cmc-overview").length, 0);
  const on = w.document.querySelectorAll("[data-cmc]");
  assert.equal(on.length, 1, "only the On button is on the page");
  assert.match(text(on[0]), /On/);
});

test("cart while off: no Scryfall calls, no panels, only an On button", async () => {
  const { w, fetch } = cartPage({ enabled: false });
  await w.CMC.run();
  assert.deepEqual(fetch.calls, []);
  assert.equal(w.document.querySelectorAll(".cmc-panel, .cmc-note, .cmc-overview").length, 0);
  assert.ok(button(w, "On"));
});

test("seller page: Off removes everything and is saved, On checks the page again", async () => {
  const { w, browser } = sellerPage();
  await w.CMC.runOffers();
  assert.ok(w.document.querySelectorAll(".cmc-note").length > 0);

  button(w, "Off").click();
  await until(() => button(w, "On"));
  assert.equal(browser.storage.local.data.settings.enabled, false);
  assert.equal(w.document.querySelectorAll(".cmc-note, .cmc-deal-row, .cmc-overview").length, 0);

  button(w, "On").click();
  await until(() => w.document.querySelector(".cmc-overview") && !/Looking up/.test(text(w.document.querySelector(".cmc-overview"))));
  assert.equal(browser.storage.local.data.settings.enabled, true);
  assert.ok(w.document.querySelectorAll(".cmc-note").length > 0, "notes are back");
  assert.ok(!button(w, "On"), "the On button is gone");
});

test("cart: Off and On work there too", async () => {
  const { w, browser } = cartPage();
  await w.CMC.run();
  assert.ok(w.document.querySelector(".cmc-panel"));
  button(w, "Off").click();
  await until(() => button(w, "On"));
  assert.equal(browser.storage.local.data.settings.enabled, false);
  assert.equal(w.document.querySelectorAll(".cmc-panel").length, 0);
  button(w, "On").click();
  await until(() => w.document.querySelector(".cmc-panel"));
  assert.equal(browser.storage.local.data.settings.enabled, true);
});

test("turning off mid-check stops the remaining lookups", async () => {
  const { w, fetch } = sellerPage();
  const done = w.CMC.runOffers();
  await until(() => fetch.calls.length > 0);
  button(w, "Off").click();
  await done;
  await until(() => button(w, "On"));
  const calls = fetch.calls.length;
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(fetch.calls.length, calls, "no more calls after turning off");
  assert.equal(w.document.querySelectorAll(".cmc-note").length, 0);
});

test("enabled setting: on by default, off is kept", () => {
  const { migrate, DEFAULTS } = loadPage("<body></body>", ["settings.js"], null).CMC;
  assert.equal(DEFAULTS.enabled, true);
  assert.equal(migrate({}).enabled, true, "older settings without the key: on");
  assert.equal(migrate({ enabled: false }).enabled, false);
});

test("saving the settings page keeps the add-on off", async () => {
  const OPTIONS = path.join(__dirname, "..", "extension", "options");
  const dom = new JSDOM(fs.readFileSync(path.join(OPTIONS, "options.html"), "utf8"), { runScripts: "outside-only" });
  const w = dom.window;
  w.browser = fakeBrowser({ settings: { enabled: false } });
  w.eval(fs.readFileSync(path.join(__dirname, "..", "extension", "src", "settings.js"), "utf8"));
  w.eval(fs.readFileSync(path.join(OPTIONS, "options.js"), "utf8"));
  await new Promise((r) => setTimeout(r, 10));
  w.document.getElementById("save").click();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(w.browser.storage.local.data.settings.enabled, false);
});

test("test script lists mirror the manifest's content scripts", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "extension", "manifest.json"), "utf8"));
  const lists = manifest.content_scripts.map((c) => c.js.map((f) => f.replace(/^src\//, "")));
  assert.deepEqual(lists, [CART_SCRIPTS, OFFER_SCRIPTS, WIZARD_SCRIPTS]);
});

// Every overview box has a Settings button (owner's wish, also for pages added later).
for (const [page, open] of [
  ["seller page", async () => { const p = sellerPage(); await p.w.CMC.runOffers(); return p; }],
  ["cart", async () => { const p = cartPage(); await p.w.CMC.run(); return p; }],
  ["wizard", async () => {
    // Every card priced (one shared printing), so the check doesn't walk all the fallbacks.
    const parsed = loadPage(fixture("real-wizard.html"), WIZARD_SCRIPTS, null);
    const ids = parsed.CMC.parseWizard(parsed.document).shipments
      .flatMap((s) => s.articles.map((a) => a.productId));
    const fetch = fakeScryfall({ byProductId: Object.fromEntries(ids.map((id) => [id, "x"])), prints: { x: [print(1, "S")] } });
    const browser = fakeBrowser();
    const w = loadPage(fixture("real-wizard.html"), WIZARD_SCRIPTS, fetch, { browser });
    await w.CMC.runWizard();
    return { w, browser };
  }],
]) {
  test(`${page}: the overview box has a Settings button that opens the settings page`, async () => {
    const { w, browser } = await open();
    const settings = [...w.document.querySelectorAll(".cmc-overview button")].filter((b) => text(b) === "Settings");
    assert.equal(settings.length, 1);
    settings[0].click();
    assert.deepEqual(JSON.parse(JSON.stringify(browser.runtime.messages)), [{ type: "openOptions" }]);
  });
}
