// @ts-check
/* Shared settings with defaults. Used by content scripts and the options page. */
(function (root) {
  "use strict";

  /*
   * Price brackets are stored as a list of starting prices. Each bracket runs from its own
   * `from` (inclusive) up to the next bracket's `from`; the last one has no upper limit.
   * This shape can't express gaps or overlaps, so there is nothing to validate there.
   * Offers below the lowest `from` are ignored without any API call.
   */
  /** @type {Settings} */
  const DEFAULTS = {
    brackets: [
      { from: 1, pct: 25 },
      { from: 3, pct: 15 },
      { from: 5, pct: 10 },
    ],
    // "ranges": deal = at least the range's % under trend. "anyUnder": every offer is checked
    // (no price minimum) and anything strictly below trend is a deal. Toggled on seller pages.
    dealMode: "ranges",
    englishOnly: true,     // only check offers whose card language is English
  };
  const MAX_BRACKETS = 10;

  const storage = (typeof browser !== "undefined" && browser.storage && browser.storage.local) || null;

  /** Fresh copy of the defaults (brackets is an array, so a shallow copy would share it). */
  /** @returns {Settings} */
  function defaults() {
    return { ...DEFAULTS, brackets: DEFAULTS.brackets.map((b) => ({ ...b })) };
  }

  /** Euro amounts are compared in whole cents to avoid float noise (2.9999 vs 3). */
  /** @param {number} n */
  const cents = (n) => Math.round(n * 100);

  /** @param {number | null | undefined} n */
  const fmtEuro = (n) => (n == null ? "?" : n.toLocaleString("nl-NL", { style: "currency", currency: "EUR" }));

  /**
   * Strict check for what the user typed on the settings page.
   * @param {{from: number, pct: number}[]} rows
   * @returns {{message: string, index: number, field: "from" | "pct" | null} | null} null when valid
   */
  function validateBrackets(rows) {
    if (!rows.length) return { message: "Add at least one price range.", index: -1, field: null };
    if (rows.length > MAX_BRACKETS) return { message: `At most ${MAX_BRACKETS} price ranges.`, index: -1, field: null };
    /** @type {Map<number, number>} */
    const seen = new Map();
    for (let i = 0; i < rows.length; i++) {
      const { from, pct } = rows[i];
      if (!Number.isFinite(from) || from < 0) return { message: "Start prices must be €0 or more.", index: i, field: "from" };
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) return { message: "Percentages must be between 0 and 100.", index: i, field: "pct" };
      const c = cents(from);
      if (seen.has(c)) return { message: `Two ranges start at ${fmtEuro(from)}.`, index: i, field: "from" };
      seen.set(c, i);
    }
    return null;
  }

  /**
   * Lenient cleanup for whatever is in storage: drops invalid or duplicate entries, rounds
   * prices to cents, sorts by price. Falls back to the defaults if nothing usable is left,
   * so a broken stored value can never stop the page script.
   * @param {unknown} list
   * @returns {Bracket[]}
   */
  function normalizeBrackets(list) {
    /** @type {Map<number, Bracket>} */
    const byCents = new Map();
    if (Array.isArray(list)) {
      for (const b of list) {
        // Only real numbers count: Number(null) would quietly turn a missing value into 0.
        const from = b && typeof b.from === "number" ? b.from : NaN;
        const pct = b && typeof b.pct === "number" ? b.pct : NaN;
        if (!Number.isFinite(from) || from < 0 || !Number.isFinite(pct) || pct < 0 || pct > 100) continue;
        if (!byCents.has(cents(from))) byCents.set(cents(from), { from: cents(from) / 100, pct });
      }
    }
    const out = [...byCents.values()].sort((a, b) => a.from - b.from).slice(0, MAX_BRACKETS);
    return out.length ? out : defaults().brackets;
  }

  /**
   * Turns stored settings into the current shape. Versions up to 1.2 stored three fixed
   * percentages (pctLow/pctMid/pctHigh for €1 / €3 / €5); those become brackets.
   * @param {any} stored
   * @returns {Settings}
   */
  function migrate(stored) {
    const s = Object.assign(defaults(), stored || {});
    if (stored && !Array.isArray(stored.brackets) && ("pctLow" in stored || "pctMid" in stored || "pctHigh" in stored)) {
      const d = DEFAULTS.brackets;
      s.brackets = [
        { from: 1, pct: stored.pctLow ?? d[0].pct },
        { from: 3, pct: stored.pctMid ?? d[1].pct },
        { from: 5, pct: stored.pctHigh ?? d[2].pct },
      ];
    }
    s.brackets = normalizeBrackets(s.brackets);
    /** @type {DealMode} */
    const dealMode = s.dealMode === "anyUnder" ? "anyUnder" : "ranges";
    // Only known keys are returned, so old ones (pctLow…, desktopNotify before 1.4) drop out on the next save.
    return { brackets: s.brackets, dealMode, englishOnly: !!s.englishOnly };
  }

  /** @returns {Promise<Settings>} */
  async function getSettings() {
    if (!storage) return defaults();
    const { settings } = await storage.get("settings");
    return migrate(settings);
  }

  /** @param {Settings} s */
  async function saveSettings(s) {
    if (storage) await storage.set({ settings: { ...s, brackets: normalizeBrackets(s.brackets) } });
  }

  /** Offers below this price are ignored (no API calls). 0 means nothing is ignored by price. */
  /** @param {Settings} s @returns {number} */
  function ignoredBelow(s) {
    if (s.dealMode === "anyUnder") return 0;
    return Math.min(...s.brackets.map((b) => b.from));
  }

  /**
   * Required discount (%) for a given offer price, or null if the offer is ignored.
   * In "anyUnder" mode every priced offer is checked: 0 (judge() then wants strictly > 0).
   * @param {number | null} price @param {Settings} s @returns {number | null}
   */
  function requiredDiscount(price, s) {
    if (price == null) return null;
    if (s.dealMode === "anyUnder") return 0;
    // The bracket with the highest start that is <= price. Doesn't rely on the list being sorted.
    /** @type {Bracket | null} */
    let best = null;
    for (const b of s.brackets) {
      if (cents(b.from) <= cents(price) && (!best || b.from > best.from)) best = b;
    }
    return best ? best.pct : null;
  }

  /**
   * Human-readable range for a bracket starting at `from`, given all start prices.
   * @param {number} from @param {number[]} allFroms
   * @returns {string} e.g. "€ 1,00 to under € 3,00" or "€ 5,00 and up"
   */
  function rangeLabel(from, allFroms) {
    const higher = allFroms.filter((f) => Number.isFinite(f) && cents(f) > cents(from));
    if (!higher.length) return `${fmtEuro(from)} and up`;
    return `${fmtEuro(from)} to under ${fmtEuro(Math.min(...higher))}`;
  }

  root.CMC = Object.assign(root.CMC || {}, {
    DEFAULTS, MAX_BRACKETS, defaults, getSettings, saveSettings, migrate,
    normalizeBrackets, validateBrackets, requiredDiscount, ignoredBelow, rangeLabel, fmtEuro,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
