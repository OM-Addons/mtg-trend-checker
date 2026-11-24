// @ts-check
/* "Worth it" checks shared by the shopping cart and the shopping wizard results:
 * per-seller evaluation, price lookups for a list of cards, the note under each card,
 * the verdict texts and the overview box (bottom-right). */
(function (root) {
  "use strict";
  const { lookup, clearCache, trendSetText, fmtEuro: fmt, trendDiffText, offButton, settingsButton, trendSourceSwitch, minimizeButton, addMiniBar } = root.CMC;
  const MARK = "data-cmc";

  /**
   * New element marked with data-cmc, so a re-run can remove it.
   * @param {string} tag @param {string | null} [cls] @param {string | null} [text] @returns {HTMLElement}
   */
  function cmcEl(tag, cls, text) {
    const e = document.createElement(tag);
    e.setAttribute(MARK, "1");
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /** Classes this script (and the wizard page) put on Cardmarket's own elements. */
  const ADDED_CLASSES = ["cmc-block-good", "cmc-block-bad", "cmc-block-unknown", "cmc-unmasonry"];

  /** Removes everything a previous run added. */
  function removeMarks() {
    document.querySelectorAll(`[${MARK}]`).forEach((n) => n.remove());
    document.querySelectorAll(ADDED_CLASSES.map((c) => `.${c}`).join(", ")).forEach((n) => n.classList.remove(...ADDED_CLASSES));
  }

  /**
   * Key of a card in the price map. With "this printing" the same product can be there as
   * foil and non-foil, with different trends, so foils get their own key. Rows without a
   * product id (possible on the wizard page) are keyed by name.
   * @param {Pick<CartArticle, "productId" | "foil"> & {name?: string}} a @param {TrendSource} source
   */
  function priceKey(a, source) {
    const id = a.productId || `name:${String(a.name || "").toLowerCase()}`;
    return source === "printing" && a.foil ? `${id}:foil` : id;
  }

  /**
   * Pure evaluation of one seller (or the whole wizard result), given a map priceKey -> lookup result.
   * Worth it ⇔ total incl. shipping < Σ (quantity × trend). Strictly lower; a card without a
   * trend makes it unknown (null), never worth it.
   * @param {Pick<Shipment, "total" | "articles">} shipment @param {Map<string, Pick<TrendInfo, "trend">>} prices
   * @param {TrendSource} [source] @returns {ShipmentResult}
   */
  function evaluate(shipment, prices, source = "cheapestEnglish") {
    let trendSum = 0;
    let articleSum = 0;
    let missing = 0;
    for (const a of shipment.articles) {
      const p = prices.get(priceKey(a, source));
      if (a.unitPrice != null) articleSum += a.unitPrice * a.qty;
      if (p) trendSum += p.trend * a.qty;
      else missing += a.qty;
    }
    const total = shipment.total != null ? shipment.total : null;
    const shipping = total != null ? Math.max(0, total - articleSum) : null;
    const worth = total != null && missing === 0 ? total < trendSum : null;
    return { total, articleSum, shipping, trendSum, missing, worth, diff: total != null && missing === 0 ? trendSum - total : null };
  }

  /**
   * Looks up every distinct card once (through the rate-limited, cached queue in prices.js).
   * Returns null when `shouldStop()` turns true in between (the page then starts over).
   * @param {CartArticle[]} articles @param {TrendSource} source @param {() => boolean} shouldStop
   * @param {Exclusion} [exclude] printings "Cheapest English printing" skips
   * @returns {Promise<Map<string, TrendInfo> | null>}
   */
  async function lookupArticles(articles, source, shouldStop, exclude) {
    /** @type {Map<string, TrendInfo>} */
    const prices = new Map();
    /** @type {Map<string, CartArticle>} */
    const unique = new Map();
    for (const a of articles) unique.set(priceKey(a, source), a);
    for (const [key, a] of unique) {
      if (shouldStop()) return null;
      try {
        const p = await lookup(a.productId, a.name, { source, foil: a.foil, exclude });
        if (p) prices.set(key, p);
      } catch (e) {
        console.warn("[CMC] lookup failed", a.productId, a.name, e);
      }
    }
    return prices;
  }

  /**
   * Notes for one card. With a price cell: the trend and the difference go right under
   * Cardmarket's price (easy to compare), and only the set link under the name. Without
   * one (layout not recognised): the full note under the name, as before.
   * @param {CartArticle} a @param {TrendInfo | undefined} p @param {TrendSource} source
   * @param {Element} cell name cell @param {Element | null} [priceCell]
   */
  function annotateArticle(a, p, source, cell, priceCell) {
    const byPrinting = source === "printing";
    const note = cmcEl("div", "cmc-note");
    if (!p) {
      note.textContent = !byPrinting ? "No English trend price found" : a.foil ? "No foil trend for this printing" : "No trend for this printing";
      note.classList.add("cmc-muted");
      if (priceCell) priceCell.appendChild(cmcEl("div", "cmc-note cmc-price-note cmc-muted", "no trend"));
    } else {
      if (priceCell) {
        const at = cmcEl("div", "cmc-note cmc-price-note");
        at.appendChild(cmcEl("div", null, `trend ${fmt(p.trend)}`));
        if (a.unitPrice != null) {
          // Under trend: green like a seller-page deal (owner's wish), the ▼ and "under" keep it readable without colour.
          const under = Math.round(a.unitPrice * 100) < Math.round(p.trend * 100);
          at.appendChild(cmcEl("div", under ? "cmc-diff cmc-under" : "cmc-diff", trendDiffText(a.unitPrice, p.trend)));
        }
        priceCell.appendChild(at);
      } else {
        note.append(`${byPrinting ? "Trend of this printing" : "Cheapest EN trend"}: ${fmt(p.trend)} `);
      }
      const link = /** @type {HTMLAnchorElement} */ (cmcEl("a", "cmc-link", `(${trendSetText(p)})`));
      link.href = p.url;
      link.target = "_blank";
      link.rel = "noopener";
      note.append(link);
    }
    cell.appendChild(note);
  }

  /**
   * Symbol per verdict, shown next to the colour: green/red alone is unreadable for
   * colour-blind users (owner's request). Same symbols as in verdictText().
   */
  const SYMBOL = { good: "✅", bad: "❌", unknown: "⚠️" };

  /** "good" | "bad" | "unknown" for CSS classes. @param {ShipmentResult} r */
  const verdictKind = (r) => (r.worth === true ? "good" : r.worth === false ? "bad" : "unknown");

  /** Short verdict, e.g. "✅ Worth it". @param {ShipmentResult} r @param {string} [whatTotal] */
  function verdictText(r, whatTotal = "seller total") {
    return r.worth === true ? "✅ Worth it" :
      r.worth === false ? "❌ Not worth it" :
      r.total == null ? `⚠️ Couldn't read the ${whatTotal}` :
      `⚠️ Incomplete: no price for ${r.missing} card(s)`;
  }

  /** "you save" / "over by" / "equal to trend" (equal is not worth it). @param {number} diff Σ trend - total */
  const diffWords = (diff) => (Math.round(diff * 100) > 0 ? "you save" : Math.round(diff * 100) < 0 ? "over by" : "equal to trend");

  /**
   * The two rows added under Cardmarket's own Total (cart summary, wizard lists): the summed
   * trend, and the verdict with how much you save or overpay. Cardmarket already shows the
   * cards, shipping and total, so those aren't repeated (owner's wish).
   * @param {ShipmentResult} r @param {TrendSource} source @param {string} [whatTotal]
   * @returns {{label: string, value: string, cls: string}[]}
   */
  function verdictRows(r, source, whatTotal) {
    const sum = source === "printing" ? "Σ trend of these printings" : "Σ trend (cheapest EN)";
    const cls = `cmc-verdict-row ${r.worth === true ? "cmc-good-text" : r.worth === false ? "cmc-bad-text" : "cmc-unknown-text"}`;
    return [
      { label: sum, value: fmt(r.trendSum) + (r.missing ? ` (excl. ${r.missing})` : ""), cls: "" },
      r.diff != null
        ? { label: `${verdictText(r)}: ${diffWords(r.diff)}`, value: fmt(Math.abs(r.diff)), cls }
        : { label: verdictText(r, whatTotal), value: "", cls },
    ];
  }

  /**
   * Overview box (bottom-right) for the cart and the wizard results.
   * @param {object} o
   * @param {string} o.title
   * @param {TrendSource} o.source
   * @param {() => unknown} o.restart re-checks the page (after a switch)
   * @param {() => unknown} o.run re-checks after "Refresh prices"
   * @param {string} [o.status] shown instead of the results (e.g. "Looking up…")
   * @param {{s: Shipment, r: ShipmentResult}[]} [o.results]
   * @param {{text: string, kind: "good" | "bad" | "unknown"}} [o.overall] line above the counts
   */
  function renderOverviewBox(o) {
    const box = cmcEl("div", "cmc-overview");
    const head = cmcEl("div", "cmc-overview-head", o.title);
    const buttons = cmcEl("span", "cmc-head-buttons");
    buttons.append(minimizeButton(), offButton(o.restart));
    head.appendChild(buttons);
    box.appendChild(head);
    box.appendChild(trendSourceSwitch(o.source, o.restart));

    if (o.status) {
      box.appendChild(cmcEl("div", null, o.status));
      addMiniBar(box, o.title, "Checking…");
    } else {
      const results = o.results || [];
      if (o.overall) box.appendChild(cmcEl("div", `cmc-overall ${textClass(o.overall.kind)}`, o.overall.text));
      const good = results.filter((x) => x.r.worth === true);
      const bad = results.filter((x) => x.r.worth === false);
      const unk = results.length - good.length - bad.length;
      box.appendChild(cmcEl("div", null, `${SYMBOL.good} ${good.length} worth it · ${SYMBOL.bad} ${bad.length} not · ${SYMBOL.unknown} ${unk} unknown`));
      // Minimized: the counts only; on the wizard coloured like the overall verdict.
      addMiniBar(box, o.title, `${SYMBOL.good} ${good.length} · ${SYMBOL.bad} ${bad.length} · ${SYMBOL.unknown} ${unk}`, o.overall ? textClass(o.overall.kind) : null);
      const list = cmcEl("ul", "cmc-list");
      for (const { s, r } of results) {
        const kind = verdictKind(r);
        const li = cmcEl("li", textClass(kind), `${SYMBOL[kind]} ${s.seller}: ${fmt(r.total)} vs ${fmt(r.trendSum)}`);
        li.style.cursor = "pointer";
        li.onclick = () => s.el.scrollIntoView({ behavior: "smooth", block: "start" });
        list.appendChild(li);
      }
      box.appendChild(list);
    }
    const refresh = cmcEl("button", "cmc-btn cmc-refresh", "Refresh prices");
    refresh.onclick = async () => { await clearCache(); o.run(); };
    box.append(refresh, " ", settingsButton());
    document.body.appendChild(box);
  }

  /** @param {"good" | "bad" | "unknown"} kind */
  const textClass = (kind) => (kind === "good" ? "cmc-good-text" : kind === "bad" ? "cmc-bad-text" : "cmc-muted");

  root.CMC = Object.assign(root.CMC, {
    cmcEl, removeMarks, priceKey, evaluate, lookupArticles, annotateArticle, verdictKind, verdictText, diffWords, verdictRows, renderOverviewBox,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
