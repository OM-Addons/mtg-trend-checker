// @ts-check
/* "Worth it" checks shared by the shopping cart and the shopping wizard results:
 * per-seller evaluation, price lookups for a list of cards, the note under each card,
 * the verdict texts and the overview box (bottom-right). */
(function (root) {
  "use strict";
  const { lookup, clearCache, fmtEuro: fmt, offButton, trendSourceSwitch } = root.CMC;
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
  const ADDED_CLASSES = ["cmc-row-good", "cmc-row-bad", "cmc-block-good", "cmc-block-bad", "cmc-block-unknown", "cmc-unmasonry"];

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
   * @returns {Promise<Map<string, TrendInfo> | null>}
   */
  async function lookupArticles(articles, source, shouldStop) {
    /** @type {Map<string, TrendInfo>} */
    const prices = new Map();
    /** @type {Map<string, CartArticle>} */
    const unique = new Map();
    for (const a of articles) unique.set(priceKey(a, source), a);
    for (const [key, a] of unique) {
      if (shouldStop()) return null;
      try {
        const p = await lookup(a.productId, a.name, { source, foil: a.foil });
        if (p) prices.set(key, p);
      } catch (e) {
        console.warn("[CMC] lookup failed", a.productId, a.name, e);
      }
    }
    return prices;
  }

  /**
   * Note under a card (its trend and set, linking to a Cardmarket search) and the green/red
   * bar on its price: green when that copy is at or below trend.
   * @param {CartArticle} a @param {TrendInfo | undefined} p @param {TrendSource} source @param {Element} cell where the note goes
   */
  function annotateArticle(a, p, source, cell) {
    const byPrinting = source === "printing";
    const note = cmcEl("div", "cmc-note");
    if (!p) {
      note.textContent = !byPrinting ? "No English trend price found" : a.foil ? "No foil trend for this printing" : "No trend for this printing";
      note.classList.add("cmc-muted");
    } else {
      note.append(`${byPrinting ? "Trend of this printing" : "Cheapest EN trend"}: ${fmt(p.trend)} `);
      const link = /** @type {HTMLAnchorElement} */ (cmcEl("a", "cmc-link", `(${p.set}${p.foilOnly ? ", foil" : ""})`));
      link.href = p.url;
      link.target = "_blank";
      link.rel = "noopener";
      note.append(link);
      if (a.unitPrice != null) a.el.classList.add(a.unitPrice <= p.trend ? "cmc-row-good" : "cmc-row-bad");
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
    const close = cmcEl("button", "cmc-btn", "×");
    close.title = "Hide (this page only)";
    close.onclick = () => box.remove();
    const buttons = cmcEl("span", "cmc-head-buttons");
    buttons.append(offButton(o.restart), close);
    head.appendChild(buttons);
    box.appendChild(head);
    box.appendChild(trendSourceSwitch(o.source, o.restart));

    if (o.status) {
      box.appendChild(cmcEl("div", null, o.status));
    } else {
      const results = o.results || [];
      if (o.overall) box.appendChild(cmcEl("div", `cmc-overall ${textClass(o.overall.kind)}`, o.overall.text));
      const good = results.filter((x) => x.r.worth === true);
      const bad = results.filter((x) => x.r.worth === false);
      const unk = results.length - good.length - bad.length;
      box.appendChild(cmcEl("div", null, `${SYMBOL.good} ${good.length} worth it · ${SYMBOL.bad} ${bad.length} not · ${SYMBOL.unknown} ${unk} unknown`));
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
    box.appendChild(refresh);
    document.body.appendChild(box);
  }

  /** @param {"good" | "bad" | "unknown"} kind */
  const textClass = (kind) => (kind === "good" ? "cmc-good-text" : kind === "bad" ? "cmc-bad-text" : "cmc-muted");

  root.CMC = Object.assign(root.CMC, {
    cmcEl, removeMarks, priceKey, evaluate, lookupArticles, annotateArticle, verdictKind, verdictText, renderOverviewBox,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
