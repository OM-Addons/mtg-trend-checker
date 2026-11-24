// @ts-check
/* Shopping cart: parse cart -> look up prices -> annotate the page.
 * The evaluation, card notes and overview box are shared with the wizard page (verdict.js). */
(function (root) {
  "use strict";
  const {
    parseCart, getSettings, migrate, exclusionOf, renderOffBox, trackMinimized,
    cmcEl: el, removeMarks, priceKey, evaluate, lookupArticles, annotateArticle, verdictKind, verdictRows, renderOverviewBox,
  } = root.CMC;

  /** @param {Shipment} shipment @param {Map<string, TrendInfo>} prices @param {TrendSource} source @returns {ShipmentResult} */
  function renderShipment(shipment, prices, source) {
    const r = evaluate(shipment, prices, source);
    for (const a of shipment.articles) {
      annotateArticle(a, prices.get(priceKey(a, source)), source, a.el.querySelector("td.name, .name") || a.el);
    }

    // Like the wizard: a coloured edge on the seller block, and two rows under Cardmarket's
    // own Total (Σ trend + verdict). Cards, shipping and total are already on the page.
    shipment.el.classList.add(`cmc-block-${verdictKind(r)}`);
    if (shipment.summaryEl) addRows(shipment.summaryEl, r, source);
    else {
      // No summary found: show the rows at the top of the block so the verdict isn't lost.
      const box = el("div", "cmc-summary");
      addRows(box, r, source);
      shipment.el.prepend(box);
    }
    return r;
  }

  /**
   * Rows at the end of Cardmarket's summary box, copying the look of its own rows
   * (`<div class="d-flex"><span class="flex-grow-1">label</span><span>value</span></div>`).
   * @param {Element} summary @param {ShipmentResult} r @param {TrendSource} source
   */
  function addRows(summary, r, source) {
    const last = summary.lastElementChild;
    const rowClass = last && last.classList.contains("d-flex") ? "d-flex" : "";
    for (const { label, value, cls } of verdictRows(r, source)) {
      const row = el("div", `${rowClass} cmc-cart-row ${cls}`.trim());
      row.appendChild(el("span", "flex-grow-1", label + " "));
      row.appendChild(el("span", null, value));
      summary.appendChild(row);
    }
  }

  /** @param {TrendSource} source @param {{s: Shipment, r: ShipmentResult}[]} results @param {string} [status] */
  function renderOverview(source, results, status) {
    renderOverviewBox({ title: "MTG cart check", source, results, status, restart, run });
  }

  let running = false;
  let again = false; // set while running: stop the current check and start over

  /** Re-check now; if a check is running, it stops early and runs again. */
  function restart() {
    if (running) again = true;
    else run();
  }

  async function run() {
    if (running) return;
    running = true;
    lastSignature = signature(); // snapshot before awaiting, so later changes trigger a re-run
    try {
      removeMarks();
      again = false;
      // Turned off: nothing is parsed or looked up, only the "On" button is shown.
      const settings = await getSettings();
      trackMinimized(settings);
      if (!settings.enabled) { renderOffBox(restart); return; }
      const source = settings.trendSource;
      const shipments = parseCart(document);
      if (!shipments.length) return;
      renderOverview(source, [], "Looking up trend prices…");

      // Turned off (or on, or switched) mid-check: stop, finally{} starts a fresh run.
      const prices = await lookupArticles(shipments.flatMap((s) => s.articles), source, () => again, exclusionOf(settings));
      if (!prices) return;

      removeMarks();
      const results = shipments.map((s) => ({ s, r: renderShipment(s, prices, source) }));
      renderOverview(source, results);
    } finally {
      running = false;
      if (again) { again = false; run(); }
      else if (signature() !== lastSignature) setTimeout(run, 300);
    }
  }

  // Re-run when articles/sellers are removed (the cart updates via AJAX).
  let lastSignature = "";
  function signature() {
    return Array.from(document.querySelectorAll(".shipment-block [data-product-id]"))
      .map((r) => r.getAttribute("data-product-id")).join(",");
  }
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  const observer = new MutationObserver(() => {
    if (running) return;
    clearTimeout(timer);
    timer = setTimeout(() => { if (signature() !== lastSignature) run(); }, 800);
  });

  root.CMC = Object.assign(root.CMC, { run });
  if (!root.CMC_NO_AUTORUN) {
    run();
    observer.observe(document.body, { childList: true, subtree: true });
    // Switched on/off or to another trend source in another tab: follow along. The other
    // settings (price ranges, deal mode, languages) don't affect the cart.
    if (typeof browser !== "undefined") browser.storage.onChanged.addListener((c) => {
      if (!c.settings) return;
      const before = migrate(c.settings.oldValue), after = migrate(c.settings.newValue);
      if (before.enabled !== after.enabled || before.trendSource !== after.trendSource) restart();
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : window);

