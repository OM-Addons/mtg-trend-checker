// @ts-check
/* Shopping wizard results (/Magic/Wants/ShoppingWizard/Results/…): the cart's "worth it"
 * check for every seller block and for the whole result. Uses the same rules, notes and
 * overview box as the cart (verdict.js).
 * The verdict always covers the whole result, like Cardmarket's own Total: the checkboxes
 * next to the cards are ignored (owner's decision). */
(function (root) {
  "use strict";
  const {
    parseEuro, allEuros, cleanName, isFoil, getSettings, migrate, renderOffBox, fmtEuro: fmt,
    cmcEl: el, removeMarks, priceKey, evaluate, lookupArticles, annotateArticle, verdictKind, verdictText, renderOverviewBox,
  } = root.CMC;

  /** Cardmarket product id hidden in the thumbnail tooltip (.../786368/786368.jpg), if present. */
  /** @param {Element} row @returns {string | null} */
  function productIdOf(row) {
    const m = row.innerHTML.match(/\/(\d{2,})\/\1\.(?:jpe?g|png|webp)/i);
    return m ? m[1] : null;
  }

  /**
   * Card rows of one seller block. The block holds each card twice: a desktop table and a
   * mobile copy (.d-md-none). The desktop rows are used; the mobile ones only if there is no table.
   * @param {Element} block @returns {CartArticle[]}
   */
  function blockArticles(block) {
    /** @type {CartArticle[]} */
    const articles = [];
    const desktop = [...block.querySelectorAll("table tbody tr")].filter((r) => !r.closest(".d-md-none"));
    for (const row of desktop) {
      const nameCell = row.querySelector("td.card-name");
      if (!nameCell) continue;
      const qtyText = nameCell.previousElementSibling ? nameCell.previousElementSibling.textContent || "" : "";
      const qty = /^\s*\d+\s*$/.test(qtyText) ? parseInt(qtyText, 10) : 1;
      const cells = row.querySelectorAll("td");
      articles.push({
        el: row, productId: productIdOf(row), name: cleanName(nameCell.textContent),
        unitPrice: parseEuro(cells[cells.length - 1].textContent), qty, foil: isFoil(row),
      });
    }
    if (articles.length) return articles;
    for (const row of block.querySelectorAll("[name^='articleRowMobile']")) {
      const first = row.firstElementChild || row;
      const spans = first.querySelectorAll(":scope > span");
      const nameEl = first.querySelector(".text-truncate");
      if (!nameEl) continue;
      const qtyMatch = (spans[0] ? spans[0].textContent || "" : "").match(/(\d+)\s*x/);
      const amounts = allEuros(first.textContent);
      articles.push({
        el: row, productId: productIdOf(row), name: cleanName(nameEl.textContent),
        unitPrice: amounts.length ? amounts[amounts.length - 1] : null, qty: qtyMatch ? parseInt(qtyMatch[1], 10) : 1, foil: isFoil(row),
      });
    }
    return articles;
  }

  /**
   * The price column could be per copy or per line; every result seen so far has quantity 1.
   * If cards with quantity > 1 are there, take whichever reading matches Cardmarket's
   * "Articles Value" (the first amount in the block's list).
   * @param {CartArticle[]} articles @param {number | null} articlesValue
   */
  function fixLinePrices(articles, articlesValue) {
    if (articlesValue == null || !articles.some((a) => a.qty > 1 && a.unitPrice != null)) return;
    const perCopy = articles.reduce((s, a) => s + (a.unitPrice || 0) * a.qty, 0);
    const perLine = articles.reduce((s, a) => s + (a.unitPrice || 0), 0);
    if (Math.abs(perLine - articlesValue) < Math.abs(perCopy - articlesValue)) {
      for (const a of articles) if (a.unitPrice != null && a.qty > 1) a.unitPrice = Math.round((a.unitPrice / a.qty) * 100) / 100;
    }
  }

  /**
   * Total of a Cardmarket <dl> (Articles Value, Shipping Cost, Total, …): the largest amount,
   * because Total = articles + shipping. Doesn't depend on the site language.
   * @param {Element | null} dl @returns {number | null}
   */
  function totalOf(dl) {
    const amounts = dl ? allEuros(dl.textContent) : [];
    return amounts.length ? Math.max(...amounts) : null;
  }

  /** @param {Document} doc @returns {WizardResult} */
  function parseWizard(doc) {
    const shipments = [...doc.querySelectorAll(".detailed-result-card")].map((block, idx) => {
      const dl = block.querySelector("dl");
      const articles = blockArticles(block);
      const amounts = dl ? allEuros(dl.textContent) : [];
      fixLinePrices(articles, amounts.length ? amounts[0] : null);
      const sellerEl = block.querySelector(".seller-name a[href*='/Users/'], a[href*='/Users/']");
      return {
        el: block, summaryEl: dl, articles, total: totalOf(dl),
        seller: sellerEl ? (sellerEl.textContent || "").trim() : `Seller ${idx + 1}`,
      };
    });
    const summaryEl = doc.querySelector("#ShoppingWizardResult dl");
    return { shipments, summaryEl, total: totalOf(summaryEl) };
  }

  /**
   * Two rows in one of Cardmarket's lists: "Σ trend" and the verdict, styled like its own rows.
   * @param {Element} dl @param {ShipmentResult} r @param {TrendSource} source @param {string} whatTotal
   */
  function addRows(dl, r, source, whatTotal) {
    const dtClass = (dl.querySelector("dt") || { className: "" }).className.replace(/\bselected-articles-label\b/, "");
    const ddClass = (dl.querySelector("dd") || { className: "" }).className.replace(/\bselected-articles-value\b/, "");
    const before = dl.querySelector(".selected-articles-label"); // keep Cardmarket's selection row last
    /** @param {string} label @param {string} value @param {string} [extra] */
    const row = (label, value, extra = "") => {
      const dt = el("dt", `${dtClass} ${extra}`, label);
      const dd = el("dd", `${ddClass} ${extra}`, value);
      dl.insertBefore(dt, before);
      dl.insertBefore(dd, before);
    };
    const sum = source === "printing" ? "Σ trend of these printings" : "Σ trend (cheapest EN)";
    row(sum, fmt(r.trendSum) + (r.missing ? ` (excl. ${r.missing})` : ""), "cmc-wiz-row");
    const cls = `cmc-wiz-row cmc-wiz-verdict ${r.worth === true ? "cmc-good-text" : r.worth === false ? "cmc-bad-text" : "cmc-unknown-text"}`;
    if (r.diff != null) row(`${verdictText(r)}: ${diffWords(r.diff)}`, fmt(Math.abs(r.diff)), cls);
    else row(verdictText(r, whatTotal), "", cls);
  }

  /** "you save" / "over by" / "equal to trend" (equal is not worth it). @param {number} diff Σ trend - total */
  const diffWords = (diff) => (Math.round(diff * 100) > 0 ? "you save" : Math.round(diff * 100) < 0 ? "over by" : "equal to trend");

  /** @param {ShipmentResult} r */
  function overallText(r) {
    if (r.diff == null) return `Overall: ${verdictText(r, "total")}`;
    return `Overall: ${verdictText(r)}, ${diffWords(r.diff)} ${fmt(Math.abs(r.diff))}`;
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
    try {
      removeMarks();
      again = false;
      // Turned off: nothing is parsed or looked up, only the "On" button is shown.
      const settings = await getSettings();
      if (!settings.enabled) { renderOffBox(restart); return; }
      const source = settings.trendSource;
      const wizard = parseWizard(document);
      if (!wizard.shipments.length) return;
      renderOverviewBox({ title: "MTG wizard check", source, status: "Looking up trend prices…", restart, run });

      const all = wizard.shipments.flatMap((s) => s.articles);
      const prices = await lookupArticles(all, source, () => again);
      if (!prices) return;

      removeMarks();
      const results = wizard.shipments.map((s) => {
        const r = evaluate(s, prices, source);
        for (const a of s.articles) annotateArticle(a, prices.get(priceKey(a, source)), source, a.el.querySelector("td.card-name, .text-truncate") || a.el);
        s.el.classList.add(`cmc-block-${verdictKind(r)}`);
        if (s.summaryEl) addRows(s.summaryEl, r, source, "seller total");
        return { s, r };
      });
      // The whole result: Cardmarket's grand total (all sellers, incl. shipping) vs Σ trend of all cards.
      const overall = evaluate({ total: wizard.total, articles: all }, prices, source);
      if (wizard.summaryEl) addRows(wizard.summaryEl, overall, source, "total");
      renderOverviewBox({
        title: "MTG wizard check", source, results, restart, run,
        overall: { text: overallText(overall), kind: verdictKind(overall) },
      });
    } finally {
      running = false;
      if (again) { again = false; run(); }
    }
  }

  root.CMC = Object.assign(root.CMC, { runWizard: run, parseWizard });
  if (!root.CMC_NO_AUTORUN) {
    run();
    // Switched on/off or to another trend source in another tab: follow along.
    if (typeof browser !== "undefined") browser.storage.onChanged.addListener((c) => {
      if (!c.settings) return;
      const before = migrate(c.settings.oldValue), after = migrate(c.settings.newValue);
      if (before.enabled !== after.enabled || before.trendSource !== after.trendSource) restart();
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
