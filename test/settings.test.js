const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { fixture, loadPage, fakeBrowser, fakeScryfall, print, text, OFFER_SCRIPTS } = require("./helpers");

/** settings.js on its own (no page script), for the pure functions. */
const cmc = () => loadPage("<body></body>", ["settings.js"], null).CMC;
/** Plain copy: objects from the jsdom window have another realm's prototypes, which deepEqual rejects. */
const plain = (v) => JSON.parse(JSON.stringify(v));

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------

test("custom brackets: highest start <= price wins, list order doesn't matter", () => {
  const { requiredDiscount } = cmc();
  const s = { brackets: [{ from: 10, pct: 5 }, { from: 2, pct: 30 }, { from: 4.5, pct: 20 }], englishOnly: true };
  assert.equal(requiredDiscount(1.99, s), null);
  assert.equal(requiredDiscount(2, s), 30);
  assert.equal(requiredDiscount(4.49, s), 30);
  assert.equal(requiredDiscount(4.5, s), 20);
  assert.equal(requiredDiscount(9.99, s), 20);
  assert.equal(requiredDiscount(10, s), 5);
  assert.equal(requiredDiscount(2.9999999, { ...s, brackets: [{ from: 3, pct: 1 }] }), 1, "compared in cents");
});

test("a range starting at €0 means nothing is ignored by price", () => {
  const { requiredDiscount, ignoredBelow } = cmc();
  const s = { brackets: [{ from: 0, pct: 40 }, { from: 1, pct: 25 }], englishOnly: true };
  assert.equal(ignoredBelow(s), 0);
  assert.equal(requiredDiscount(0, s), 40);
  assert.equal(requiredDiscount(0.05, s), 40);
  assert.equal(requiredDiscount(null, s), null);
});

test("ignoredBelow is the lowest start price", () => {
  const { ignoredBelow, DEFAULTS } = cmc();
  assert.equal(ignoredBelow(DEFAULTS), 1);
  assert.equal(ignoredBelow({ ...DEFAULTS, brackets: [{ from: 7, pct: 1 }, { from: 2.5, pct: 1 }] }), 2.5);
});

test("normalizeBrackets sorts, rounds to cents, drops bad and duplicate entries", () => {
  const { normalizeBrackets } = cmc();
  assert.deepEqual(plain(normalizeBrackets([
    { from: 5, pct: 10 }, { from: 1.004, pct: 25 }, { from: 5, pct: 99 }, // duplicate start: first one kept
    { from: -1, pct: 10 }, { from: 2, pct: 101 }, { from: "x", pct: 5 }, null, { from: 3, pct: 0 },
  ])), [{ from: 1, pct: 25 }, { from: 3, pct: 0 }, { from: 5, pct: 10 }]);
});

test("normalizeBrackets falls back to the defaults when nothing usable is stored, and caps the count", () => {
  const { normalizeBrackets, DEFAULTS, MAX_BRACKETS } = cmc();
  assert.deepEqual(plain(normalizeBrackets(undefined)), plain(DEFAULTS.brackets));
  assert.deepEqual(plain(normalizeBrackets([])), plain(DEFAULTS.brackets));
  assert.deepEqual(plain(normalizeBrackets([{ from: -5, pct: 10 }])), plain(DEFAULTS.brackets));
  const many = Array.from({ length: 15 }, (_, i) => ({ from: i, pct: 10 }));
  assert.equal(normalizeBrackets(many).length, MAX_BRACKETS);
});

test("validateBrackets reports the first problem and where it is", () => {
  const { validateBrackets, MAX_BRACKETS } = cmc();
  assert.equal(validateBrackets([{ from: 0, pct: 0 }, { from: 3, pct: 100 }]), null);
  assert.equal(validateBrackets([]).message, "Add at least one price range.");
  assert.match(validateBrackets(Array.from({ length: MAX_BRACKETS + 1 }, (_, i) => ({ from: i, pct: 1 }))).message, /At most/);
  assert.deepEqual(plain(validateBrackets([{ from: 1, pct: 5 }, { from: NaN, pct: 5 }])),
    { message: "Start prices must be €0 or more.", index: 1, field: "from" });
  assert.equal(validateBrackets([{ from: -1, pct: 5 }]).field, "from");
  assert.deepEqual(plain(validateBrackets([{ from: 1, pct: 101 }])),
    { message: "Percentages must be between 0 and 100.", index: 0, field: "pct" });
  const dup = validateBrackets([{ from: 3, pct: 5 }, { from: 1, pct: 5 }, { from: 3.001, pct: 9 }]);
  assert.equal(dup.index, 2);
  assert.match(dup.message.replace(/\s/g, " "), /Two ranges start at € 3,00/);
});

test("rangeLabel shows where each range ends", () => {
  const { rangeLabel } = cmc();
  const froms = [5, 1, 3];
  const norm = (s) => s.replace(/\s/g, " ");
  assert.equal(norm(rangeLabel(1, froms)), "€ 1,00 to € 2,99");
  assert.equal(norm(rangeLabel(3, froms)), "€ 3,00 to € 4,99");
  assert.equal(norm(rangeLabel(5, froms)), "€ 5,00 and up");
  assert.equal(norm(rangeLabel(3, [3, NaN])), "€ 3,00 and up", "ignores empty fields");
  // The upper end is one cent below the next start, so ranges don't seem to overlap.
  assert.equal(norm(rangeLabel(2.5, [2.5, 2.75])), "€ 2,50 to € 2,74");
  assert.equal(norm(rangeLabel(0.1, [0.1, 0.3])), "€ 0,10 to € 0,29", "no float noise");
  assert.equal(norm(rangeLabel(1, [1, 1.01])), "€ 1,00 only", "range of a single cent");
});

test("settings from older versions (three fixed percentages) become brackets", () => {
  const { migrate } = cmc();
  assert.deepEqual(plain(migrate({ pctLow: 30, pctMid: 20, pctHigh: 12, englishOnly: false, desktopNotify: true })), {
    brackets: [{ from: 1, pct: 30 }, { from: 3, pct: 20 }, { from: 5, pct: 12 }], dealMode: "ranges", trendSource: "cheapestEnglish", englishOnly: false, enabled: true,
  });
  assert.deepEqual(plain(migrate({ pctMid: 18 }).brackets), [{ from: 1, pct: 25 }, { from: 3, pct: 18 }, { from: 5, pct: 10 }]);
  // New-style settings are kept (old keys are ignored once brackets exist).
  assert.deepEqual(plain(migrate({ brackets: [{ from: 2, pct: 9 }], pctLow: 50 }).brackets), [{ from: 2, pct: 9 }]);
  assert.deepEqual(plain(migrate(undefined)), plain(cmc().DEFAULTS));
});

test("getSettings migrates what is in storage, saveSettings stores sorted brackets", async () => {
  const browser = fakeBrowser({ settings: { pctLow: 30, pctMid: 20, pctHigh: 12, englishOnly: true } });
  const { getSettings, saveSettings } = loadPage("<body></body>", ["settings.js"], null, { browser }).CMC;
  const s = await getSettings();
  assert.deepEqual(plain(s.brackets), [{ from: 1, pct: 30 }, { from: 3, pct: 20 }, { from: 5, pct: 12 }]);
  await saveSettings({ ...s, brackets: [{ from: 4, pct: 1 }, { from: 0.5, pct: 2 }] });
  assert.deepEqual(browser.storage.local.data.settings, {
    brackets: [{ from: 0.5, pct: 2 }, { from: 4, pct: 1 }], dealMode: "ranges", trendSource: "cheapestEnglish", englishOnly: true, enabled: true,
  });
});

test("defaults() returns a copy that can be changed safely", () => {
  const { defaults, DEFAULTS } = cmc();
  const d = defaults();
  d.brackets[0].pct = 99;
  d.brackets.push({ from: 50, pct: 1 });
  assert.equal(DEFAULTS.brackets[0].pct, 25);
  assert.equal(DEFAULTS.brackets.length, 3);
});

// ---------------------------------------------------------------------------
// Seller page with custom brackets
// ---------------------------------------------------------------------------

const trends = { "Low Deal": 2.0, "Low NoDeal": 2.2, "Mid Deal": 4.0, "High Deal": 10.0, "High NoDeal": 10.0, "Boundary Five": 5.8, "German Deal": 10, "Above Trend": 2.5, "Cheap Card": 2 };
/** The list fixture, with these brackets in storage. */
function listPageWith(brackets, extra = {}) {
  const fetch = fakeScryfall({
    byProductId: { 555: "High Deal" },
    byName: Object.fromEntries(Object.keys(trends).map((n) => [n, n])),
    prints: Object.fromEntries(Object.entries(trends).map(([n, t]) => [n, [print(t, "S")]])),
  });
  const browser = fakeBrowser({ settings: { brackets, englishOnly: true, ...extra } });
  return { w: loadPage(fixture("offers-list.html"), OFFER_SCRIPTS, fetch, { browser }), fetch, browser };
}

test("custom first range: no Scryfall calls below it, and the overview names the threshold", async () => {
  const { w, fetch } = listPageWith([{ from: 3, pct: 10 }]);
  await w.CMC.runOffers();
  for (const n of ["Cheap Card", "Low Deal", "Low NoDeal"]) {
    assert.ok(!fetch.calls.some((c) => c.includes(n)), `${n} is under €3: no lookup`);
  }
  assert.ok(fetch.calls.some((c) => c.includes("Above Trend")), "€3.00 offer: the start price is inclusive");
  // 4 = the three above + the German €2.00 offer (the price filter runs before the language filter).
  assert.match(text(w.document.querySelector(".cmc-overview")), /Skipped 4 under € 3,00 · 0 non-English/);
});

test("first range at €0: cheap offers are looked up and the overview doesn't mention a price", async () => {
  const { w, fetch } = listPageWith([{ from: 0, pct: 50 }]);
  await w.CMC.runOffers();
  assert.ok(fetch.calls.some((c) => c.includes("Cheap Card")), "€0.50 offer is checked");
  assert.ok(!fetch.calls.some((c) => c.includes("German Deal")), "language filter still applies");
  const overview = text(w.document.querySelector(".cmc-overview"));
  assert.match(overview, /Skipped 1 non-English/);
  assert.doesNotMatch(overview, /under €/);
});

// ---------------------------------------------------------------------------
// Settings page
// ---------------------------------------------------------------------------

const OPTIONS = path.join(__dirname, "..", "extension", "options");

/** Loads options.html with its scripts and a fake storage; resolves once the page has filled in. */
async function optionsPage(stored) {
  const dom = new JSDOM(fs.readFileSync(path.join(OPTIONS, "options.html"), "utf8"), { runScripts: "outside-only" });
  const w = dom.window;
  w.browser = fakeBrowser(stored ? { settings: stored } : {});
  w.eval(fs.readFileSync(path.join(__dirname, "..", "extension", "src", "settings.js"), "utf8"));
  w.eval(fs.readFileSync(path.join(OPTIONS, "options.js"), "utf8"));
  await new Promise((r) => setTimeout(r, 10));
  const d = w.document;
  const rows = () => [...d.querySelectorAll("#brackets tr")].map((tr) => ({
    from: tr.querySelector(".from").value, pct: tr.querySelector(".pct").value, range: text(tr.querySelector(".range")),
  }));
  /** Type into a field like a user would (fires the input event the page listens to). */
  const type = (input, value) => { input.value = value; input.dispatchEvent(new w.Event("input", { bubbles: true })); };
  const click = async (id) => { d.getElementById(id).click(); await new Promise((r) => setTimeout(r, 10)); };
  return { w, d, rows, type, click, stored: () => w.browser.storage.local.data.settings };
}

test("settings page shows the ranges with labels and explains what is ignored", async () => {
  const { d, rows } = await optionsPage();
  assert.deepEqual(rows(), [
    { from: "1", pct: "25", range: "€ 1,00 to € 2,99" },
    { from: "3", pct: "15", range: "€ 3,00 to € 4,99" },
    { from: "5", pct: "10", range: "€ 5,00 and up" },
  ]);
  assert.equal(text(d.getElementById("ignored")), "Offers under € 1,00 are ignored: they get no note and no price lookup.");
});

test("settings page: labels and ignored text update while typing", async () => {
  const { d, rows, type } = await optionsPage();
  type(d.querySelectorAll(".from")[0], "0");
  assert.equal(text(d.getElementById("ignored")), "No offers are ignored by price: every offer gets a price lookup.");
  assert.equal(rows()[0].range, "€ 0,00 to € 2,99");
  type(d.querySelectorAll(".from")[2], "3");
  assert.equal(rows()[1].range, "same start as another range");
});

test("settings page: add and remove ranges, last one can't be removed", async () => {
  const { d, rows, click } = await optionsPage({ brackets: [{ from: 2, pct: 20 }], englishOnly: true });
  assert.equal(d.querySelector(".remove").disabled, true, "only one range left");
  await click("add");
  assert.deepEqual(rows().map((r) => [r.from, r.pct]), [["2", "20"], ["7", "20"]], "new range above the highest, same %");
  assert.equal(d.querySelector(".remove").disabled, false);
  d.querySelectorAll(".remove")[0].click();
  assert.deepEqual(rows().map((r) => r.from), ["7"]);
  assert.equal(rows()[0].range, "€ 7,00 and up");
});

test("settings page: add is disabled at the maximum number of ranges", async () => {
  const brackets = Array.from({ length: 10 }, (_, i) => ({ from: i + 1, pct: 10 }));
  const { d } = await optionsPage({ brackets, englishOnly: true });
  assert.equal(d.getElementById("add").disabled, true);
});

test("settings page: save stores the ranges sorted and shows them sorted", async () => {
  const { d, rows, type, click, stored } = await optionsPage();
  type(d.querySelectorAll(".from")[0], "8");
  type(d.querySelectorAll(".pct")[0], "7");
  d.getElementById("englishOnly").checked = false;
  await click("save");
  assert.deepEqual(stored(), {
    brackets: [{ from: 3, pct: 15 }, { from: 5, pct: 10 }, { from: 8, pct: 7 }], dealMode: "ranges", trendSource: "cheapestEnglish", englishOnly: false, enabled: true,
  });
  assert.deepEqual(rows().map((r) => r.from), ["3", "5", "8"]);
  assert.equal(text(d.getElementById("saved")), "Saved ✓");
});

test("settings page: invalid input shows an error on the page and saves nothing", async () => {
  const { d, type, click, stored } = await optionsPage();
  type(d.querySelectorAll(".pct")[1], "120");
  await click("save");
  assert.equal(text(d.getElementById("error")), "Percentages must be between 0 and 100.");
  assert.ok(d.querySelectorAll(".pct")[1].classList.contains("invalid"));
  assert.equal(stored(), undefined);

  type(d.querySelectorAll(".pct")[1], "15");
  type(d.querySelectorAll(".from")[2], "1");
  await click("save");
  assert.match(text(d.getElementById("error")), /Two ranges start at € 1,00/);
  assert.ok(d.querySelectorAll(".from")[2].classList.contains("invalid"));
  assert.equal(stored(), undefined);
});

test("settings page: reset restores the three default ranges", async () => {
  const { rows, click, stored } = await optionsPage({ brackets: [{ from: 0, pct: 50 }], englishOnly: false });
  await click("reset");
  assert.deepEqual(rows().map((r) => [r.from, r.pct]), [["1", "25"], ["3", "15"], ["5", "10"]]);
  assert.deepEqual(stored().brackets, [{ from: 1, pct: 25 }, { from: 3, pct: 15 }, { from: 5, pct: 10 }]);
});

// ---------------------------------------------------------------------------
// "Any under trend" mode
// ---------------------------------------------------------------------------

const DEFAULT_BRACKETS = [{ from: 1, pct: 25 }, { from: 3, pct: 15 }, { from: 5, pct: 10 }];
const flaggedNames = (w) => [...w.document.querySelectorAll(".cmc-deal-row")].map((r) => r.querySelector("a").textContent);
/** Waits until the overview shows a finished check (not "Looking up…"). */
async function done(w) {
  for (let i = 0; i < 400; i++) {
    const o = w.document.querySelector(".cmc-overview");
    if (o && /Checked \d+/.test(o.textContent)) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("check didn't finish");
}

test("any-under mode: every priced offer is checked and strictly below trend is a deal", () => {
  const { requiredDiscount, ignoredBelow, migrate } = cmc();
  const s = migrate({ dealMode: "anyUnder" });
  assert.equal(s.dealMode, "anyUnder");
  assert.equal(requiredDiscount(0.01, s), 0, "no price minimum");
  assert.equal(requiredDiscount(null, s), null);
  assert.equal(ignoredBelow(s), 0);

  const { judge } = loadPage("<body></body>", OFFER_SCRIPTS, fakeScryfall({ prints: {} })).CMC;
  assert.equal(judge(10, 10, s).deal, false, "at trend is not under trend");
  assert.equal(judge(10.5, 10, s).deal, false);
  assert.equal(judge(9.99, 10, s).deal, true, "0.1% under counts");
  assert.equal(judge(9.99, 10, { ...s, dealMode: "ranges" }).deal, false, "ranges mode still wants 10%");
});

test("dealMode: anything unknown falls back to ranges", () => {
  const { migrate } = cmc();
  assert.equal(migrate({}).dealMode, "ranges");
  assert.equal(migrate({ dealMode: "everything" }).dealMode, "ranges");
});

test("seller page in any-under mode: cheap offers are looked up, every under-trend card is flagged", async () => {
  const { w, fetch } = listPageWith(DEFAULT_BRACKETS, { dealMode: "anyUnder" });
  await w.CMC.runOffers();
  assert.ok(fetch.calls.some((c) => c.includes("Cheap Card")), "€0.50 offer is checked in this mode");
  assert.ok(!fetch.calls.some((c) => c.includes("German Deal")), "English-only still skips without a call");
  assert.deepEqual(flaggedNames(w), ["Cheap Card", "Low Deal", "Low NoDeal", "Mid Deal", "High Deal", "High NoDeal", "Boundary Five (V.2)"]);
  const overview = text(w.document.querySelector(".cmc-overview"));
  assert.match(overview, /7 deal\(s\) on this page/);
  assert.match(overview, /Checked 8: 7 deal · 1 at\/above trend/, "no 'under trend' count: those are all deals here");
  assert.match(overview, /Skipped 1 non-English/);
  assert.equal(w.document.querySelector(".cmc-mode-btn[aria-pressed=true]").textContent, "Any under trend");
});

test("overview switch: changes mode, saves it and re-checks the page", async () => {
  const { w, fetch, browser } = listPageWith(DEFAULT_BRACKETS);
  await w.CMC.runOffers();
  assert.deepEqual(flaggedNames(w), ["Low Deal", "Mid Deal", "High Deal", "Boundary Five (V.2)"]);
  assert.equal(w.document.querySelector(".cmc-mode-btn[aria-pressed=true]").textContent, "My ranges");
  assert.ok(!fetch.calls.some((c) => c.includes("Cheap Card")));

  const [, any] = w.document.querySelectorAll(".cmc-mode-btn");
  any.click();
  await new Promise((r) => setTimeout(r, 20));
  await done(w);
  assert.equal(browser.storage.local.data.settings.dealMode, "anyUnder", "the choice is remembered");
  assert.equal(flaggedNames(w).length, 7);
  assert.ok(fetch.calls.some((c) => c.includes("Cheap Card")));
  assert.equal(w.document.querySelectorAll(".cmc-note").length, 8, "old notes are replaced, not doubled");

  w.document.querySelectorAll(".cmc-mode-btn")[0].click();
  await new Promise((r) => setTimeout(r, 20));
  await done(w);
  assert.equal(browser.storage.local.data.settings.dealMode, "ranges");
  assert.deepEqual(flaggedNames(w), ["Low Deal", "Mid Deal", "High Deal", "Boundary Five (V.2)"]);
});

test("overview switch while a check is still running: the page ends up in the new mode", async () => {
  const { w } = listPageWith(DEFAULT_BRACKETS);
  const first = w.CMC.runOffers(); // not awaited: the "Looking up…" box is showing
  await new Promise((r) => setTimeout(r, 5));
  w.document.querySelectorAll(".cmc-mode-btn")[1].click();
  await first;
  await new Promise((r) => setTimeout(r, 20));
  await done(w);
  assert.equal(flaggedNames(w).length, 7);
  assert.equal(w.document.querySelectorAll(".cmc-overview").length, 1);
});

test("discounts under 1% show as <1%, not 0%", async () => {
  const fetch = fakeScryfall({ byName: { "Low Deal": "x" }, prints: { x: [print(1.51, "S")] } });
  const browser = fakeBrowser({ settings: { brackets: DEFAULT_BRACKETS, dealMode: "anyUnder", englishOnly: true } });
  const w = loadPage(fixture("offers-list.html"), OFFER_SCRIPTS, fetch, { browser });
  await w.CMC.runOffers();
  const note = [...w.document.querySelectorAll(".cmc-deal-note")].map(text);
  assert.deepEqual(note, ["🔥 <1% (€ 0,01) under trend € 1,51 (S)"]);
});

test("settings page: mode radios load, save, and change the ignored text", async () => {
  const { d, click, stored } = await optionsPage({ brackets: DEFAULT_BRACKETS, dealMode: "anyUnder", englishOnly: true });
  assert.equal(d.querySelector("input[name=dealMode]:checked").value, "anyUnder");
  assert.match(text(d.getElementById("ignored")), /every offer is checked and the ranges aren't used/);
  const ranges = d.querySelector("input[value=ranges]");
  ranges.checked = true;
  ranges.dispatchEvent(new d.defaultView.Event("change"));
  assert.match(text(d.getElementById("ignored")), /Offers under € 1,00 are ignored/);
  await click("save");
  assert.equal(stored().dealMode, "ranges");
});

test("trendSource: defaults to cheapest English, anything unknown falls back to it", () => {
  const { migrate } = cmc();
  assert.equal(migrate({}).trendSource, "cheapestEnglish");
  assert.equal(migrate({ trendSource: "printing" }).trendSource, "printing");
  assert.equal(migrate({ trendSource: "other" }).trendSource, "cheapestEnglish");
});

test("settings page: 'Compare with' radios load and save", async () => {
  const { d, click, stored } = await optionsPage({ brackets: DEFAULT_BRACKETS, trendSource: "printing" });
  assert.equal(d.querySelector("input[name=trendSource]:checked").value, "printing");
  d.querySelector("input[name=trendSource][value=cheapestEnglish]").checked = true;
  await click("save");
  assert.equal(stored().trendSource, "cheapestEnglish");
  assert.equal(stored().dealMode, "ranges", "other settings are kept");
});

// ---------------------------------------------------------------------------
// No desktop notifications (removed in 1.4 at the owner's request)
// ---------------------------------------------------------------------------

test("no desktop notification for deals, even if an old setting had it on", async () => {
  const { w, browser } = listPageWith(DEFAULT_BRACKETS, { desktopNotify: true });
  await w.CMC.runOffers();
  assert.ok(w.document.querySelectorAll(".cmc-deal-row").length > 0, "the page has deals");
  assert.deepEqual(browser.runtime.messages.filter((m) => m.type === "notify"), []);
});

test("the old desktopNotify setting is dropped", () => {
  const { migrate, DEFAULTS } = cmc();
  assert.ok(!("desktopNotify" in DEFAULTS));
  assert.ok(!("desktopNotify" in migrate({ englishOnly: true, desktopNotify: true })));
});

test("no notification option on the settings page and no notifications permission", async () => {
  const { d } = await optionsPage();
  assert.equal(d.getElementById("desktopNotify"), null);
  assert.doesNotMatch(d.body.textContent, /notification/i);
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "extension", "manifest.json"), "utf8"));
  assert.ok(!manifest.permissions.includes("notifications"));
});
