// @ts-check
/* Settings page: reads/writes the Settings object via settings.js. */
(async function () {
  "use strict";
  const { DEFAULTS, getSettings, saveSettings } = window.CMC;

  /** @type {Array<"pctLow" | "pctMid" | "pctHigh">} */
  const numKeys = ["pctLow", "pctMid", "pctHigh"];
  /** @type {Array<"englishOnly" | "desktopNotify">} */
  const boolKeys = ["englishOnly", "desktopNotify"];

  /**
   * @param {string} id
   * @returns {HTMLInputElement} every element we look up exists in options.html
   */
  const $ = (id) => /** @type {HTMLInputElement} */ (document.getElementById(id));

  /** @param {Settings} s */
  function fill(s) {
    numKeys.forEach((k) => ($(k).value = String(s[k])));
    boolKeys.forEach((k) => ($(k).checked = !!s[k]));
  }

  /** @param {string} text */
  function flash(text) {
    $("saved").textContent = text;
    setTimeout(() => ($("saved").textContent = ""), 2500);
  }

  fill(await getSettings());

  $("save").onclick = async () => {
    /** @type {Settings} */
    const s = Object.assign({}, DEFAULTS);
    for (const k of numKeys) {
      const v = parseFloat($(k).value);
      if (!Number.isFinite(v) || v < 0 || v > 100) {
        $(k).focus();
        flash("Percentages must be between 0 and 100.");
        return;
      }
      s[k] = v;
    }
    boolKeys.forEach((k) => (s[k] = $(k).checked));
    await saveSettings(s);
    flash("Saved ✓");
  };

  $("reset").onclick = async () => {
    await saveSettings(Object.assign({}, DEFAULTS));
    fill(DEFAULTS);
    flash("Defaults restored ✓");
  };
})();
