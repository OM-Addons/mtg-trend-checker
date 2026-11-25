// @ts-check
/* Switches in the overview box, shared by every page that has one (cart, wizard, seller pages).
 * Every overview box has a "Settings" button (settingsButton), also on future pages (owner's wish).
 * On/off: "Off" is saved in the settings (enabled: false), so it sticks on every Cardmarket
 * page: the page then shows only a small "On" button and makes no price lookups.
 * Trend source: "Cheapest EN | This printing", also saved (settings.trendSource).
 * Minimize: "–" shrinks the box to one line, also saved (settings.minimized).
 * priceNote: the lines under Cardmarket's price on every page (cart, wizard, seller pages). */
(function (root) {
  "use strict";
  const { getSettings, saveSettings } = root.CMC;

  /** Euros as Cardmarket shows them: "1.234,56 €" (amount first, no-break space before €). @param {number} n */
  const fmtCardmarket = (n) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

  /**
   * One line under the price: the amount and a short label (arrow / "Trend"). The label hangs to
   * the right of the amount, or comes first (labelsFirst), right in front of the amount.
   * @param {string} amount @param {string} suffix @param {string} cls @param {boolean} labelsFirst
   */
  function priceLine(amount, suffix, cls, labelsFirst) {
    const line = document.createElement("div");
    line.className = `cmc-line ${cls}`.trim();
    const a = document.createElement("span");
    a.className = "cmc-amount";
    a.textContent = amount;
    const s = document.createElement("span");
    s.className = "cmc-suffix";
    s.textContent = suffix;
    if (labelsFirst) line.append(s, " ", a);
    else line.append(a, " ", s);
    return line;
  }

  /**
   * The lines under Cardmarket's price (owner's layout A), in its own format:
   *     10,99 €          ← Cardmarket's price
   *      2,02 € ▼ (16%) 🔥   difference per copy: ▼ under / ▲ over / = equal (+ % and fire for a deal)
   *     13,01 € Trend
   * The amounts end exactly where the price ends; the text after them hangs to the right
   * (styles.css), so they line up. Arrows and words are always there: never colour alone.
   * @param {number | null} price per copy (null: only the trend line)
   * @param {number} trend
   * @param {{pct?: string, green?: boolean, labelsFirst?: boolean}} [opts] pct: seller-page deal
   *   (adds "(N%) 🔥", green); green: price under trend in the cart / wizard; labelsFirst: cart and
   *   wizard (owner's wish): "▼ 2,02 €" / "Trend 13,01 €", label right in front of the amount and
   *   the amount under the price, so nothing hangs out of the table cell
   * @returns {HTMLElement}
   */
  function priceNote(price, trend, opts = {}) {
    const box = document.createElement("div");
    box.setAttribute("data-cmc", "1");
    box.className = opts.labelsFirst ? "cmc-note cmc-price-note cmc-labels-first" : "cmc-note cmc-price-note";
    const first = Boolean(opts.labelsFirst);
    if (price != null) {
      const diff = Math.round(trend * 100) - Math.round(price * 100); // whole cents: no float noise
      const arrow = diff > 0 ? "▼" : diff < 0 ? "▲" : "=";
      const deal = opts.pct != null;
      const cls = deal ? "cmc-diff cmc-deal-note" : opts.green ? "cmc-diff cmc-under" : "cmc-diff";
      box.appendChild(priceLine(fmtCardmarket(Math.abs(diff) / 100), deal ? `${arrow} (${opts.pct}%) 🔥` : arrow, cls, first));
    }
    box.appendChild(priceLine(fmtCardmarket(trend), "Trend", "", first));
    return box;
  }

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
   * "Settings" button for the bottom of every overview box. Content scripts can't open the
   * settings page themselves, so it asks background.js to.
   */
  function settingsButton() {
    const b = document.createElement("button");
    b.setAttribute("data-cmc", "1");
    b.className = "cmc-btn cmc-refresh cmc-settings";
    b.textContent = "Settings";
    b.title = "Open the MTG Trend Checker settings";
    b.onclick = () => browser.runtime.sendMessage({ type: "openOptions" });
    return b;
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

  /*
   * Minimize: the "–" button shrinks the overview box to one line (title + short summary);
   * a click on that line restores it. Saved in the settings (minimized), so every page opens
   * the box the same way. Only the look changes: the check, notes and lookups go on as usual.
   * Each box always contains both the full content and the one-line bar; the class
   * cmc-minimized decides which is visible, so switching needs no re-check of the page.
   */
  let minimized = false;

  /** Pages call this with the settings they just read, before drawing their box. @param {Pick<Settings, "minimized">} s */
  function trackMinimized(s) { minimized = !!s.minimized; }

  /** Shows every overview box on the page minimized or full. @param {boolean} min */
  function applyMinimized(min) {
    minimized = min;
    document.querySelectorAll(".cmc-overview").forEach((b) => b.classList.toggle("cmc-minimized", min));
  }

  /** Switches right away, then saves (other pages follow via storage.onChanged). @param {boolean} min */
  async function setMinimized(min) {
    applyMinimized(min);
    const s = await getSettings();
    if (s.minimized !== min) await saveSettings({ ...s, minimized: min });
  }

  /** "–" button for the overview box header. */
  function minimizeButton() {
    const b = document.createElement("button");
    b.setAttribute("data-cmc", "1");
    b.className = "cmc-btn cmc-minimize";
    b.textContent = "–";
    b.title = "Minimize (stays small on every page until you restore it)";
    b.setAttribute("aria-label", "Minimize");
    b.onclick = () => setMinimized(true);
    return b;
  }

  /**
   * Adds the one-line bar shown while minimized ("Title · summary  □") and sets the box's state.
   * @param {HTMLElement} box the .cmc-overview element
   * @param {string} title @param {string} summary @param {string | null} [cls] extra class for the summary (colour)
   */
  function addMiniBar(box, title, summary, cls) {
    const bar = document.createElement("div");
    bar.setAttribute("data-cmc", "1");
    bar.className = "cmc-mini";
    bar.setAttribute("role", "button");
    bar.tabIndex = 0;
    bar.title = "Restore the overview";
    const t = document.createElement("span");
    t.className = "cmc-mini-title";
    t.textContent = title;
    const s = document.createElement("span");
    s.className = `cmc-mini-summary${cls ? ` ${cls}` : ""}`;
    s.textContent = summary;
    const restore = document.createElement("span");
    restore.className = "cmc-btn cmc-restore";
    restore.textContent = "□";
    restore.setAttribute("aria-hidden", "true");
    bar.append(t, " · ", s, restore);
    bar.onclick = () => setMinimized(false);
    bar.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setMinimized(false); } };
    box.prepend(bar);
    box.classList.toggle("cmc-minimized", minimized);
  }

  // Minimized or restored in another tab: follow along without re-checking the page.
  if (typeof browser !== "undefined" && browser.storage && browser.storage.onChanged) {
    browser.storage.onChanged.addListener((c) => {
      if (c.settings && c.settings.newValue) {
        const min = c.settings.newValue.minimized === true;
        if (min !== minimized) applyMinimized(min);
      }
    });
  }

  root.CMC = Object.assign(root.CMC, {
    priceNote, setEnabled, offButton, renderOffBox, settingsButton, toggleRow, trendSourceSwitch, trackMinimized, minimizeButton, addMiniBar,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
