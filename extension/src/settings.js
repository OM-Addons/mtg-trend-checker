// @ts-check
/* Shared settings with defaults. Used by content scripts and the options page. */
(function (root) {
  "use strict";
  const DEFAULTS = {
    pctLow: 25,   // offer price 1 to <3 EUR
    pctMid: 15,   // offer price 3 to 5 EUR
    pctHigh: 10,  // offer price > 5 EUR
    englishOnly: true,     // only check offers whose card language is English
    desktopNotify: true,   // show a Firefox notification when deals are found
  };
  const MIN_PRICE = 1; // offers below this are ignored without any API call

  const storage = (typeof browser !== "undefined" && browser.storage && browser.storage.local) || null;

  /** @returns {Promise<Settings>} */
  async function getSettings() {
    if (!storage) return Object.assign({}, DEFAULTS);
    const { settings } = await storage.get("settings");
    return Object.assign({}, DEFAULTS, settings || {});
  }

  /** @param {Settings} s */
  async function saveSettings(s) {
    if (storage) await storage.set({ settings: s });
  }

  /** Required discount (%) for a given offer price, or null if the offer is ignored. */
  /** @param {number | null} price @param {Settings} s @returns {number | null} */
  function requiredDiscount(price, s) {
    if (price == null || price < MIN_PRICE) return null;
    if (price < 3) return s.pctLow;
    if (price <= 5) return s.pctMid;
    return s.pctHigh;
  }

  root.CMC = Object.assign(root.CMC || {}, { DEFAULTS, MIN_PRICE, getSettings, saveSettings, requiredDiscount });
})(typeof globalThis !== "undefined" ? globalThis : window);
