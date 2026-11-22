// @ts-check
/* Switches in the overview box, shared by the cart and seller pages.
 * On/off: "Off" is saved in the settings (enabled: false), so it sticks on every Cardmarket
 * page: the page then shows only a small "On" button and makes no price lookups.
 * Trend source: "Cheapest EN | This printing", also saved (settings.trendSource). */
(function (root) {
  "use strict";
  const { getSettings, saveSettings } = root.CMC;

  /** @param {boolean} enabled */
  async function setEnabled(enabled) {
    await saveSettings({ ...(await getSettings()), enabled });
  }

  /** @param {string} cls @param {string} label @param {string} tip @param {boolean} turnOn @param {() => unknown} after re-checks the page */
  function powerButton(cls, label, tip, turnOn, after) {
    const b = document.createElement("button");
    b.setAttribute("data-cmc", "1");
    b.className = `cmc-btn cmc-power ${cls}`;
    b.textContent = label;
    b.title = tip;
    b.onclick = async () => { await setEnabled(turnOn); after(); };
    return b;
  }

  /** "Off" button for the overview box header. @param {() => unknown} after */
  const offButton = (after) =>
    powerButton("", "⏻ Off", "Turn off: no price checks on Cardmarket pages until you turn it on again", false, after);

  /** While off: the minimized box, which is only an "On" button. @param {() => unknown} after */
  function renderOffBox(after) {
    document.body.appendChild(powerButton("cmc-off-box", "⏻ On", "MTG Trend Checker is off. Click to turn it on.", true, after));
  }

  /**
   * A row of buttons where exactly one is pressed (like "My ranges | Any under trend").
   * Clicking another one marks it pressed right away and calls `pick` with its value.
   * @template {string} T
   * @param {[T, string, string][]} choices value, label, tooltip
   * @param {T} current @param {(value: T) => unknown} pick
   */
  function toggleRow(choices, current, pick) {
    const wrap = document.createElement("div");
    wrap.setAttribute("data-cmc", "1");
    wrap.className = "cmc-mode";
    let selected = current;
    for (const [value, label, tip] of choices) {
      const b = document.createElement("button");
      b.setAttribute("data-cmc", "1");
      b.className = "cmc-btn cmc-mode-btn";
      b.textContent = label;
      b.title = tip;
      b.setAttribute("aria-pressed", String(value === current));
      b.onclick = () => {
        if (value === selected) return;
        selected = value;
        wrap.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        pick(value);
      };
      wrap.appendChild(b);
    }
    return wrap;
  }

  /**
   * "Cheapest EN | This printing": which trend to compare with. Saved, then the page re-checks.
   * @param {TrendSource} current @param {() => unknown} after re-checks the page
   */
  function trendSourceSwitch(current, after) {
    /** @type {[TrendSource, string, string][]} */
    const choices = [
      ["cheapestEnglish", "Cheapest EN", "Compare with the trend of the cheapest English printing of the card"],
      ["printing", "This printing", "Compare with the trend of this exact printing (foil trend for foils)"],
    ];
    const row = toggleRow(choices, current, async (trendSource) => {
      await saveSettings({ ...(await getSettings()), trendSource });
      after();
    });
    row.classList.add("cmc-source");
    return row;
  }

  root.CMC = Object.assign(root.CMC, { setEnabled, offButton, renderOffBox, toggleRow, trendSourceSwitch });
})(typeof globalThis !== "undefined" ? globalThis : window);
