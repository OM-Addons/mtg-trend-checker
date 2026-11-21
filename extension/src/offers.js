// @ts-check
/* Seller offer pages (/Magic/Users/<seller>/Offers/Singles):
 * flag offers that are sufficiently below the cheapest-English-printing trend. */
(function (root) {
  "use strict";
  const { parseEuro, allEuros, cleanName, lookup, clearCache, getSettings, saveSettings, requiredDiscount, ignoredBelow } = root.CMC;

  const MARK = "data-cmc";
  /** @param {number | null | undefined} n */
  const fmt = (n) => (n == null ? "?" : n.toLocaleString("nl-NL", { style: "currency", currency: "EUR" }));
  const LANGS = ["English", "French", "German", "Spanish", "Italian", "Japanese", "Portuguese", "Russian",
    "Korean", "S-Chinese", "T-Chinese", "Dutch", "Polish", "Czech", "Hungarian", "Indonesian", "Thai"];

  /** @param {string} tag @param {string | null} [cls] @param {string | null} [text] @returns {HTMLElement} */
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    e.setAttribute(MARK, "1");
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /** @param {string | null | undefined} v */
  function stripHtml(v) { return String(v || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }

  /** Card language from the flag icon tooltip; null if it can't be determined. */
  /** @param {Element} node @returns {string[]} */
  function tooltipTexts(node) {
    const texts = [node.getAttribute("aria-label"), node.getAttribute("data-bs-original-title"),
      node.getAttribute("data-original-title"), node.getAttribute("title"), node.getAttribute("alt")];
    const m = (node.getAttribute("onmouseover") || "").match(/showMsgBox\(this,\s*[`'"]([^`'"]+)/);
    if (m) texts.push(m[1]);
    return texts.filter(Boolean).map(stripHtml);
  }

  /** @param {Element} row @returns {string | null} */
  function detectLanguage(row) {
    // 1) Any icon in the row whose tooltip is exactly a language name (the flag icon).
    for (const node of row.querySelectorAll("[aria-label], [title], [data-bs-original-title], [data-original-title], [onmouseover], img[alt]")) {
      for (const t of tooltipTexts(node)) {
        const lang = LANGS.find((l) => t === l);
        if (lang) return lang;
      }
    }
    // 2) Looser match, but only inside the attributes block (avoids set names like "Japanese promos").
    for (const node of row.querySelectorAll(".product-attributes *, .col-product *, .info *")) {
      for (const t of tooltipTexts(node)) {
        const lang = LANGS.find((l) => t.includes(l));
        if (lang) return lang;
      }
    }
    return null;
  }

  /** Cardmarket product id hidden in the thumbnail URL (.../12345/12345.jpg), if present. */
  /** @param {Element} row @returns {string | null} */
  function productIdFromRow(row) {
    const m = row.innerHTML.match(/\/(\d{2,})\/\1\.(?:jpe?g|png|webp)/i);
    return m ? m[1] : null;
  }

  const ROW_SELECTOR = ".article-row, tr, [id^='articleRow']";

  /** @param {Element} row @returns {number | null} */
  function priceOfRow(row) {
    const specific = row.querySelector(".col-offer .price-container .color-primary") ||
      row.querySelector(".mobile-offer-container .color-primary") ||
      row.querySelector(".price-container") ||
      row.querySelector("td.price, [class*='price']");
    if (specific) {
      const v = parseEuro(specific.textContent);
      if (v != null) return v;
    }
    // Generic fallback: the last euro amount in the row (the offer price column).
    const amounts = allEuros(row.textContent);
    return amounts.length ? amounts[amounts.length - 1] : null;
  }

  /**
   * Works on both layouts: the classic div list (.article-row) and the table
   * view (<tr> rows with Name / Info columns). Anchors on the card link and
   * walks up to its row, so it doesn't depend on exact column classes.
   */
  /** @param {Document} doc @returns {Offer[]} */
  function parseOffers(doc) {
    const links = Array.from(doc.querySelectorAll("a[href*='/Products/Singles/']"), (a) => /** @type {HTMLAnchorElement} */ (a));
    const seen = new Set();
    const offers = [];
    for (const link of links) {
      const row = link.closest(ROW_SELECTOR);
      if (!row || seen.has(row)) continue;
      // Skip header/nav links that aren't inside an offer row with a price.
      seen.add(row);
      const price = priceOfRow(row);
      const name = cleanName(link.textContent);
      if (!name) continue;
      offers.push({
        el: row,
        nameCell: link.closest("td, .col-seller, .col-product, div") || row,
        name,
        url: link.href,
        link,
        productId: productIdFromRow(row),
        language: detectLanguage(row),
        price,
      });
    }
    return offers;
  }

  /** Pure check of one offer against its trend. */
  /** @param {number} price @param {number} trend @param {Settings} settings @returns {Judgement | null} */
  function judge(price, trend, settings) {
    const pct = requiredDiscount(price, settings);
    if (pct == null || trend == null || trend <= 0) return null;
    // Round to 0.01% so e.g. 9.00 vs 10.00 counts as exactly 10% (avoids float noise).
    const discount = Math.round((1 - price / trend) * 10000) / 100;
    // "Any under trend" mode: strictly below trend (at trend is not a deal). Ranges: at least pct.
    const deal = settings.dealMode === "anyUnder" ? discount > 0 : discount >= pct;
    return { pct, discount, deal };
  }

  /** Discount for display: whole percent, but "<1" instead of a misleading "0". */
  /** @param {number} d */
  const pctText = (d) => (d > 0 && d < 1 ? "<1" : String(Math.round(d)));

  function removeOld() {
    document.querySelectorAll(`[${MARK}]`).forEach((n) => n.remove());
    document.querySelectorAll(".cmc-deal-row").forEach((n) => n.classList.remove("cmc-deal-row"));
  }

  /** Deals: green row + 🔥 note. Every other checked card: just the trend price.
   */
  /** @param {Offer} offer @param {TrendInfo} p @param {Judgement | null} j */
  function annotate(offer, p, j) {
    // Every checked card gets a hover tooltip on its name (no visual clutter),
    // so you can verify what was compared.
    if (offer.link) {
      offer.link.title = `Price read: ${fmt(offer.price)} · cheapest EN trend: ${fmt(p.trend)} (${p.set}${p.foilOnly ? ", foil" : ""})`;
    }
    if (!j) return;
    const target = offer.nameCell || offer.el;
    const note = el("div", "cmc-note");
    if (j.deal) {
      offer.el.classList.add("cmc-deal-row");
      note.classList.add("cmc-deal-note");
      note.append(`🔥 ${pctText(j.discount)}% under EN trend ${fmt(p.trend)} `);
    } else {
      note.append(`EN trend ${fmt(p.trend)} `);
    }
    const a = /** @type {HTMLAnchorElement} */ (el("a", "cmc-link", `(${p.set}${p.foilOnly ? ", foil" : ""})`));
    a.href = p.url; a.target = "_blank"; a.rel = "noopener";
    note.append(a);
    target.appendChild(note);
  }

  /** @param {{offer: Offer, p: TrendInfo, j: Judgement}[]} deals @param {string | null} [status] @param {{checked: number, cheap: number, cheapBelow: number, lang: number, under: number, above: number, failed: {offer: Offer, reason: string}[]}} [stats] */
  function renderOverview(deals, status, stats) {
    const box = el("div", "cmc-overview");
    const head = el("div", "cmc-overview-head", "Under-trend deals");
    const close = el("button", "cmc-btn", "×");
    close.onclick = () => box.remove();
    head.appendChild(close);
    box.appendChild(head);
    box.appendChild(modeSwitch());
    if (status) box.appendChild(el("div", null, status));
    else {
      box.appendChild(el("div", null, deals.length ? `${deals.length} deal(s) on this page` : "No deals on this page"));
      if (stats) {
        // In "any under trend" mode every under-trend card is a deal, so "under trend" would always be 0.
        const under = currentMode === "anyUnder" ? "" : ` · ${stats.under} under trend`;
        box.appendChild(el("div", "cmc-muted", `Checked ${stats.checked}: ${deals.length} deal${under} · ${stats.above} at/above trend`));
        // cheapBelow is 0 when the first range starts at €0: then nothing is skipped by price.
        const skipped = stats.cheapBelow > 0 ? `Skipped ${stats.cheap} under ${fmt(stats.cheapBelow)} · ` : "Skipped ";
        box.appendChild(el("div", "cmc-muted", `${skipped}${stats.lang} non-English`));
      }
      if (stats && stats.failed.length) {
        const det = el("details", "cmc-muted");
        det.appendChild(el("summary", null, `${stats.failed.length} couldn't be priced`));
        const ul = el("ul", "cmc-list");
        for (const f of stats.failed) {
          const li = el("li", null, `${f.offer.name}: ${f.reason}`);
          li.style.cursor = "pointer";
          li.onclick = () => f.offer.el.scrollIntoView({ behavior: "smooth", block: "center" });
          ul.appendChild(li);
        }
        det.appendChild(ul);
        box.appendChild(det);
      }
      const list = el("ul", "cmc-list");
      for (const d of deals) {
        const li = el("li", "cmc-good-text", `${d.offer.name}: ${fmt(d.offer.price)} vs ${fmt(d.p.trend)} (−${pctText(d.j.discount)}%)`);
        li.style.cursor = "pointer";
        li.onclick = () => d.offer.el.scrollIntoView({ behavior: "smooth", block: "center" });
        list.appendChild(li);
      }
      box.appendChild(list);
    }
    const refresh = el("button", "cmc-btn cmc-refresh", "Refresh prices");
    refresh.onclick = async () => { await clearCache(); run(); };
    const opts = el("button", "cmc-btn cmc-refresh", "Settings");
    opts.onclick = () => browser.runtime.sendMessage({ type: "openOptions" });
    box.append(refresh, " ", opts);
    document.body.appendChild(box);
  }

  /**
   * Switch between "My ranges" and "Any under trend" at the top of the overview box.
   * The choice is saved (it sticks for other pages and sellers) and the page is re-checked.
   */
  function modeSwitch() {
    const wrap = el("div", "cmc-mode");
    /** @type {[DealMode, string, string][]} */
    const modes = [
      ["ranges", "My ranges", "Deal = at least the % you set for the offer's price range"],
      ["anyUnder", "Any under trend", "Deal = any offer below trend, including cheap ones"],
    ];
    for (const [mode, label, tip] of modes) {
      const b = el("button", "cmc-btn cmc-mode-btn", label);
      b.title = tip;
      b.setAttribute("aria-pressed", String(mode === currentMode));
      b.onclick = async () => {
        if (mode === currentMode) return;
        currentMode = mode;
        wrap.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        await saveSettings({ ...(await getSettings()), dealMode: mode });
        restart();
      };
      wrap.appendChild(b);
    }
    return wrap;
  }

  /** Re-check now; if a check is running, it stops early and runs again with the new settings. */
  function restart() {
    if (running) again = true;
    else run();
  }

  /** @type {DealMode} mode of the last check, shown in the switch */
  let currentMode = "ranges";
  let running = false;
  let again = false; // set while running: stop the current check and start over
  let lastSig = "";
  const notified = new Set();
  const sig = () => Array.from(document.querySelectorAll("a[href*='/Products/Singles/']")).map((a) => a.getAttribute("href")).join(",");

  async function run() {
    if (running) return;
    running = true;
    // Record what we're about to process BEFORE awaiting anything, so rows that
    // load while we're busy are detected afterwards (previously they were missed).
    lastSig = sig();
    try {
      removeOld();
      const settings = await getSettings();
      currentMode = settings.dealMode;
      again = false;
      const offers = parseOffers(document);
      if (!offers.length) {
        renderOverview([], "No card offers recognised on this page. Cardmarket's layout may differ: send a copy of the page so the parser can be fixed.");
        return;
      }
      const noPrice = offers.filter((o) => o.price == null).length;
      if (noPrice === offers.length) {
        renderOverview([], `Found ${offers.length} cards but couldn't read any prices. The price column may be hidden or use a different layout.`);
        return;
      }
      renderOverview([], "Looking up trend prices…");

      const stats = { checked: 0, cheap: 0, cheapBelow: ignoredBelow(settings), lang: 0, under: 0, above: 0, failed: /** @type {{offer: Offer, reason: string}[]} */ ([]) };
      const deals = [];
      for (const offer of offers) {
        if (again) return; // settings changed mid-check: finally{} starts a fresh run
        // Filter BEFORE any API call: cheap cards and non-English offers cost nothing.
        const price = offer.price;
        if (price == null) { stats.failed.push({ offer, reason: "price not readable" }); continue; }
        if (requiredDiscount(price, settings) == null) { stats.cheap++; continue; }
        if (settings.englishOnly && offer.language && offer.language !== "English") { stats.lang++; continue; }
        stats.checked++;
        /** @type {TrendInfo | null} */
        let p = null;
        try { p = await lookup(offer.productId, offer.name); } catch (e) {
          console.warn("[CMC] lookup failed", offer.name, e);
          stats.failed.push({ offer, reason: "lookup error, try Refresh" });
          continue;
        }
        if (!p) { stats.failed.push({ offer, reason: "no English trend found" }); continue; }
        const j = judge(price, p.trend, settings);
        annotate(offer, p, j);
        if (j && !j.deal) { if (j.discount > 0) stats.under++; else stats.above++; }
        if (j && j.deal) deals.push({ offer, p, j });
      }

      document.querySelectorAll(".cmc-overview").forEach((n) => n.remove());
      renderOverview(deals, null, stats);

      const fresh = deals.filter((d) => !notified.has(d.offer.url + d.offer.price));
      fresh.forEach((d) => notified.add(d.offer.url + d.offer.price));
      if (settings.desktopNotify && fresh.length && typeof browser !== "undefined") {
        browser.runtime.sendMessage({
          type: "notify",
          title: `${fresh.length} card(s) under trend`,
          message: fresh.slice(0, 5).map((d) => `${d.offer.name}: ${fmt(d.offer.price)} (−${Math.round(d.j.discount)}%)`).join("\n"),
        });
      }
    } finally {
      running = false;
      if (again) { again = false; run(); }
      else if (sig() !== lastSig) setTimeout(run, 300); // page changed while we were busy
    }
  }

  root.CMC = Object.assign(root.CMC, { runOffers: run, parseOffers, judge, detectLanguage });
  if (!root.CMC_NO_AUTORUN) {
    run();
    // Cardmarket loads filter/sort results and pages without a full reload at times.
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    new MutationObserver(() => {
      if (running) return;
      clearTimeout(timer);
      timer = setTimeout(() => { if (sig() !== lastSig) run(); }, 800);
    }).observe(document.body, { childList: true, subtree: true });
    if (typeof browser !== "undefined") browser.storage.onChanged.addListener((c) => { if (c.settings) restart(); });
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
