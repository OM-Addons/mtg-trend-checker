// @ts-check
/* Settings page: reads/writes the Settings object via settings.js.
 * Every change is saved right away (no Save button). Price ranges are checked first: while
 * they're invalid they are marked red and the stored ranges stay, but other changes still save. */
(async function () {
  "use strict";
  const {
    MAX_BRACKETS, SET_CATEGORIES, defaults, getSettings, saveSettings, normalizeBrackets, validateBrackets,
    normalizeSetCodes, exclusionOf, rangeLabel, fmtEuro,
  } = window.CMC;

  /** @type {Array<"englishOnly">} */
  const boolKeys = ["englishOnly"];

  /**
   * @param {string} id
   * @returns {HTMLInputElement} every element we look up exists in options.html
   */
  const $ = (id) => /** @type {HTMLInputElement} */ (document.getElementById(id));
  const tbody = /** @type {HTMLTableSectionElement} */ (document.getElementById("brackets"));
  const addButton = /** @type {HTMLButtonElement} */ (document.getElementById("add"));

  /** @param {string} tag @param {Record<string, string>} [attrs] */
  function el(tag, attrs = {}) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }

  /** One editable row: start price, percentage, live range label, remove button. */
  /** @param {Bracket} b */
  function addRow(b) {
    const tr = el("tr");
    const from = /** @type {HTMLInputElement} */ (el("input", { type: "number", class: "from", min: "0", step: "0.01", "aria-label": "From (€)" }));
    const pct = /** @type {HTMLInputElement} */ (el("input", { type: "number", class: "pct", min: "0", max: "100", step: "1", "aria-label": "Deal at (%)" }));
    from.value = String(b.from);
    pct.value = String(b.pct);
    const remove = el("button", { class: "remove", title: "Remove this range" });
    remove.textContent = "✕";
    remove.onclick = () => { tr.remove(); refresh(); autoSave(); };

    const tdFrom = el("td"); tdFrom.append("€ ", from);
    const tdPct = el("td"); tdPct.append(pct, " %");
    const tdRange = el("td", { class: "range" });
    const tdRemove = el("td"); tdRemove.append(remove);
    tr.append(tdFrom, tdPct, tdRange, tdRemove);
    tbody.append(tr);
  }

  /** What the user has typed, in table order (NaN for empty or invalid fields). */
  /** @returns {{from: number, pct: number}[]} */
  function readRows() {
    return [...tbody.rows].map((tr) => ({
      from: parseFloat(/** @type {HTMLInputElement} */ (tr.querySelector(".from")).value),
      pct: parseFloat(/** @type {HTMLInputElement} */ (tr.querySelector(".pct")).value),
    }));
  }

  /** @returns {DealMode} */
  function readMode() {
    const r = /** @type {HTMLInputElement | null} */ (document.querySelector("input[name=dealMode]:checked"));
    return r && r.value === "anyUnder" ? "anyUnder" : "ranges";
  }

  /** @returns {TrendSource} */
  function readSource() {
    const r = /** @type {HTMLInputElement | null} */ (document.querySelector("input[name=trendSource]:checked"));
    return r && r.value === "printing" ? "printing" : "cheapestEnglish";
  }

  /** Updates the range labels, the "ignored" text and the add/remove buttons as the user types. */
  function refresh() {
    const rows = readRows();
    const froms = rows.map((r) => r.from);
    [...tbody.rows].forEach((tr, i) => {
      const f = rows[i].from;
      const dup = Number.isFinite(f) && froms.filter((x) => Math.round(x * 100) === Math.round(f * 100)).length > 1;
      /** @type {HTMLElement} */ (tr.querySelector(".range")).textContent =
        !Number.isFinite(f) ? "" : dup ? "same start as another range" : rangeLabel(f, froms);
      /** @type {HTMLButtonElement} */ (tr.querySelector(".remove")).disabled = rows.length <= 1;
    });
    addButton.disabled = rows.length >= MAX_BRACKETS;

    const valid = froms.filter((f) => Number.isFinite(f) && f >= 0);
    const lowest = valid.length ? Math.min(...valid) : null;
    $("ignored").textContent =
      readMode() === "anyUnder" ? "\"Any card under trend\" is on: every offer is checked and the ranges aren't used." :
      lowest == null ? "" :
      lowest > 0 ? `Offers under ${fmtEuro(lowest)} are ignored: they get no note and no price lookup.` :
      "No offers are ignored by price: every offer gets a price lookup.";
  }

  // --- skipped printings: categories + a searchable set list --------------------
  const SETS_KEY = "cmc:sets"; // "cmc:" so it expires and is cleaned up like the price cache
  const DAY_MS = 24 * 60 * 60 * 1000;
  const MAX_SHOWN = 50; // search results shown at once; more letters narrow it down
  const categoriesBox = /** @type {HTMLElement} */ (document.getElementById("categories"));
  const chips = /** @type {HTMLElement} */ (document.getElementById("chips"));
  const setList = /** @type {HTMLElement} */ (document.getElementById("setList"));
  /** @type {{code: string, name: string}[]} all paper sets, newest first (empty until loaded) */
  let allSets = [];
  /** @type {Set<string>} ticked set codes */
  const picked = new Set();
  /** @type {string} shown under the search box while the list is loading or failed */
  let setsProblem = "Loading the set list…";

  for (const c of SET_CATEGORIES) {
    const label = el("label");
    const box = /** @type {HTMLInputElement} */ (el("input", { type: "checkbox", "data-category": c.id }));
    label.append(box, ` ${c.label}`);
    if (c.hint) {
      const hint = el("span", { class: "hint" });
      hint.textContent = ` (${c.hint})`;
      label.append(hint);
    }
    categoriesBox.append(label);
  }
  const categoryBoxes = () => /** @type {HTMLInputElement[]} */ ([...categoriesBox.querySelectorAll("input[data-category]")]);

  /** @param {string} code */
  const setLabel = (code) => {
    const s = allSets.find((x) => x.code === code);
    return s ? `${s.name} (${code.toUpperCase()})` : code.toUpperCase();
  };

  /**
   * The paper sets from Scryfall's /sets (one request, cached for a day). Digital-only sets
   * and token sets are left out: they have no English paper printings to skip.
   * @returns {Promise<{code: string, name: string}[]>}
   */
  async function loadSets() {
    const storage = typeof browser !== "undefined" && browser.storage ? browser.storage.local : null;
    if (storage) {
      const { [SETS_KEY]: hit } = await storage.get(SETS_KEY);
      if (hit && Date.now() - hit.t < DAY_MS && Array.isArray(hit.v)) return hit.v;
    }
    const res = await fetch("https://api.scryfall.com/sets", { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Scryfall ${res.status}`);
    const data = await res.json();
    const v = (data.data || [])
      .filter((/** @type {any} */ s) => !s.digital && s.set_type !== "token")
      .map((/** @type {any} */ s) => ({ code: String(s.code).toLowerCase(), name: String(s.name) }));
    if (storage) await storage.set({ [SETS_KEY]: { t: Date.now(), v } });
    return v;
  }

  /** The ticked sets as "Name (CODE) ✕" buttons; a click unticks the set. */
  function renderChips() {
    chips.replaceChildren();
    for (const code of picked) {
      const b = el("button", { type: "button", "aria-label": `Stop skipping ${setLabel(code)}` });
      b.textContent = `${setLabel(code)} ✕`;
      b.onclick = () => { picked.delete(code); renderChips(); renderList(); autoSave(); };
      chips.append(b);
    }
  }

  /** Search results: sets whose name contains the text or whose code starts with it. */
  function renderList() {
    setList.replaceChildren();
    const q = $("setSearch").value.trim().toLowerCase();
    if (!allSets.length) { $("setStatus").textContent = setsProblem; return; }
    if (!q) { $("setStatus").textContent = `Type to search ${allSets.length} sets.`; return; }
    const matches = allSets.filter((s) => s.name.toLowerCase().includes(q) || s.code.startsWith(q));
    $("setStatus").textContent =
      !matches.length ? "No set matches." :
      matches.length > MAX_SHOWN ? `Showing ${MAX_SHOWN} of ${matches.length} sets: type more to narrow it down.` : "";
    for (const s of matches.slice(0, MAX_SHOWN)) {
      const label = el("label");
      const box = /** @type {HTMLInputElement} */ (el("input", { type: "checkbox", "data-set": s.code }));
      box.checked = picked.has(s.code);
      box.onchange = () => { if (box.checked) picked.add(s.code); else picked.delete(s.code); renderChips(); };
      label.append(box, ` ${s.name} (${s.code.toUpperCase()})`);
      setList.append(label);
    }
  }

  $("setSearch").addEventListener("input", renderList);

  /** @param {Settings} s */
  function fill(s) {
    tbody.replaceChildren();
    s.brackets.forEach(addRow);
    document.querySelectorAll("input[name=dealMode]").forEach((r) => {
      /** @type {HTMLInputElement} */ (r).checked = /** @type {HTMLInputElement} */ (r).value === s.dealMode;
    });
    document.querySelectorAll("input[name=trendSource]").forEach((r) => {
      /** @type {HTMLInputElement} */ (r).checked = /** @type {HTMLInputElement} */ (r).value === s.trendSource;
    });
    boolKeys.forEach((k) => ($(k).checked = !!s[k]));
    categoryBoxes().forEach((b) => (b.checked = s.excludedCategories.includes(b.dataset.category || "")));
    picked.clear();
    s.excludedSets.forEach((code) => picked.add(code));
    renderChips();
    renderList();
    refresh();
  }

  /** Short "Saved ✓" toast in the corner. @param {string} text */
  let flashTimer = 0;
  function flash(text) {
    $("saved").textContent = text;
    clearTimeout(flashTimer);
    flashTimer = /** @type {any} */ (setTimeout(() => ($("saved").textContent = ""), 2500));
  }

  /** @param {string} text */
  function showError(text) { $("error").textContent = text; }

  /** Puts the table rows in price order (as they're applied), keeping focus where it was. */
  function sortRows() {
    const trs = [...tbody.rows];
    const from = (/** @type {HTMLTableRowElement} */ tr) => parseFloat(/** @type {HTMLInputElement} */ (tr.querySelector(".from")).value);
    const sorted = [...trs].sort((a, b) => from(a) - from(b));
    if (sorted.every((tr, i) => tr === trs[i])) return;
    const focused = document.activeElement;
    sorted.forEach((tr) => tbody.append(tr));
    if (focused instanceof HTMLElement && tbody.contains(focused)) focused.focus();
    refresh();
  }

  /**
   * Reads the page and saves it. Invalid ranges: marked red, the stored ranges are kept.
   * `enabled` and `minimized` are switched in the overview box: the stored values are kept.
   */
  async function save() {
    tbody.querySelectorAll(".invalid").forEach((e) => e.classList.remove("invalid"));
    const rows = readRows();
    const err = validateBrackets(rows);
    if (err) {
      showError(`${err.message} Your ranges aren't saved until this is fixed.`);
      if (err.field) /** @type {HTMLInputElement} */ (tbody.rows[err.index].querySelector(`.${err.field}`)).classList.add("invalid");
    } else showError("");
    const before = await getSettings();
    /** @type {Settings} */
    const s = {
      brackets: err ? before.brackets : normalizeBrackets(rows), dealMode: readMode(), trendSource: readSource(),
      englishOnly: $("englishOnly").checked, enabled: before.enabled, minimized: before.minimized,
      excludedCategories: categoryBoxes().filter((b) => b.checked).map((b) => b.dataset.category || ""),
      excludedSets: normalizeSetCodes([...picked]),
    };
    if (JSON.stringify(s) === JSON.stringify(before)) return;
    await saveSettings(s);
    if (!err) sortRows();
    // Other skipped printings = other trends: open pages fetch their cards again.
    const changed = JSON.stringify(exclusionOf(before)) !== JSON.stringify(exclusionOf(s));
    flash(changed ? "Saved ✓ Prices will be fetched again." : "Saved ✓");
  }

  /** Saves one change after the other (so two quick clicks can't overwrite each other). */
  let queue = Promise.resolve();
  function autoSave() {
    queue = queue.then(save).catch((e) => { console.warn("[CMC] save failed", e); showError("Couldn't save. Please try again."); });
    return queue;
  }

  tbody.addEventListener("input", refresh);
  document.querySelectorAll("input[name=dealMode]").forEach((r) => r.addEventListener("change", refresh));
  // Radios, checkboxes, ticked sets and finished range fields (change fires when you leave the field).
  document.addEventListener("change", (e) => { if (e.target !== $("setSearch")) autoSave(); });

  addButton.onclick = () => {
    // New range above the current highest one, with the same percentage as that one.
    const rows = normalizeBrackets(readRows());
    const last = rows[rows.length - 1];
    addRow({ from: Math.round((last.from + Math.max(5, last.from)) * 100) / 100, pct: last.pct });
    refresh();
    /** @type {HTMLInputElement} */ (tbody.rows[tbody.rows.length - 1].querySelector(".from")).focus();
    autoSave();
  };

  $("reset").onclick = async () => {
    if (!window.confirm("Reset all settings to their defaults?")) return;
    const before = await getSettings();
    const s = { ...defaults(), enabled: before.enabled, minimized: before.minimized };
    await saveSettings(s);
    fill(s);
    showError("");
    flash("Defaults restored ✓");
  };

  // The settings page is embedded in about:addons; open "What's new" as a normal tab.
  // (tabs.create needs no extra permission; the plain link is the fallback.)
  $("whatsnew").onclick = (e) => {
    if (typeof browser === "undefined" || !browser.tabs) return;
    e.preventDefault();
    browser.tabs.create({ url: browser.runtime.getURL("changelog/changelog.html") });
  };

  // Version in the header (from the manifest, so it never gets out of date).
  if (typeof browser !== "undefined" && browser.runtime && browser.runtime.getManifest) {
    $("version").textContent = browser.runtime.getManifest().version;
  }

  fill(await getSettings());
  loadSets()
    .then((sets) => { allSets = sets; })
    .catch((e) => {
      console.warn("[CMC] set list", e);
      setsProblem = "Couldn't load the set list from Scryfall. Sets you already skip are kept; reopen the settings later to change them.";
    })
    .then(() => { renderChips(); renderList(); });
})();
