// @ts-check
/* Settings page: reads/writes the Settings object via settings.js. */
(async function () {
  "use strict";
  const { MAX_BRACKETS, defaults, getSettings, saveSettings, normalizeBrackets, validateBrackets, rangeLabel, fmtEuro } = window.CMC;

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
    remove.onclick = () => { tr.remove(); refresh(); };

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
    refresh();
  }

  /** @param {string} text */
  function flash(text) {
    $("error").textContent = "";
    $("saved").textContent = text;
    setTimeout(() => ($("saved").textContent = ""), 2500);
  }

  /** @param {string} text */
  function showError(text) {
    $("saved").textContent = "";
    $("error").textContent = text;
  }

  tbody.addEventListener("input", refresh);
  document.querySelectorAll("input[name=dealMode]").forEach((r) => r.addEventListener("change", refresh));

  addButton.onclick = () => {
    // New range above the current highest one, with the same percentage as that one.
    const rows = normalizeBrackets(readRows());
    const last = rows[rows.length - 1];
    addRow({ from: Math.round((last.from + Math.max(5, last.from)) * 100) / 100, pct: last.pct });
    refresh();
    /** @type {HTMLInputElement} */ (tbody.rows[tbody.rows.length - 1].querySelector(".from")).focus();
  };

  $("save").onclick = async () => {
    tbody.querySelectorAll(".invalid").forEach((e) => e.classList.remove("invalid"));
    const rows = readRows();
    const err = validateBrackets(rows);
    if (err) {
      showError(err.message);
      if (err.field) {
        const input = /** @type {HTMLInputElement} */ (tbody.rows[err.index].querySelector(`.${err.field}`));
        input.classList.add("invalid");
        input.focus();
      }
      return;
    }
    /** @type {Settings} */
    // enabled is switched in the overview box on Cardmarket pages; keep what is stored.
    const s = { brackets: normalizeBrackets(rows), dealMode: readMode(), trendSource: readSource(), englishOnly: $("englishOnly").checked, enabled: (await getSettings()).enabled };
    await saveSettings(s);
    fill(s); // shows the ranges sorted, as they are applied
    flash("Saved ✓");
  };

  $("reset").onclick = async () => {
    await saveSettings(defaults());
    fill(defaults());
    flash("Defaults restored ✓");
  };

  // The settings page is embedded in about:addons; open "What's new" as a normal tab.
  // (tabs.create needs no extra permission; the plain link is the fallback.)
  $("whatsnew").onclick = (e) => {
    if (typeof browser === "undefined" || !browser.tabs) return;
    e.preventDefault();
    browser.tabs.create({ url: browser.runtime.getURL("changelog/changelog.html") });
  };

  fill(await getSettings());
})();
