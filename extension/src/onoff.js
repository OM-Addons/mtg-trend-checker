// @ts-check
/* On/off switch for the overview box, shared by the cart and seller pages.
 * "Off" is saved in the settings (enabled: false), so it sticks on every Cardmarket page:
 * the page then shows only a small "On" button and makes no price lookups. */
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

  root.CMC = Object.assign(root.CMC, { setEnabled, offButton, renderOffBox });
})(typeof globalThis !== "undefined" ? globalThis : window);
