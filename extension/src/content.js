// @ts-check
/* Orchestrates: parse cart -> look up prices -> annotate the page. */
(function (root) {
  "use strict";
  const { parseCart, lookup, clearCache, getSettings, migrate, offButton, renderOffBox } = root.CMC;

  /** @param {number | null | undefined} n */
  const fmt = (n) => (n == null ? "?" : n.toLocaleString("nl-NL", { style: "currency", currency: "EUR" }));
  const MARK = "data-cmc";

  /** @param {string} tag @param {string | null} [cls] @param {string | null} [text] @returns {HTMLElement} */
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    e.setAttribute(MARK, "1");
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function removeOld() {
    document.querySelectorAll(`[${MARK}]`).forEach((n) => n.remove());
    document.querySelectorAll(".cmc-row-good, .cmc-row-bad").forEach((n) => n.classList.remove("cmc-row-good", "cmc-row-bad"));
  }

  /** Pure evaluation of one shipment, given a map productId -> lookup result. */
  /** @param {Pick<Shipment, "total" | "articles">} shipment @param {Map<string, Pick<TrendInfo, "trend">>} prices @returns {ShipmentResult} */
  function evaluate(shipment, prices) {
    let trendSum = 0;
    let articleSum = 0;
    let missing = 0;
    for (const a of shipment.articles) {
      const p = prices.get(a.productId);
      if (a.unitPrice != null) articleSum += a.unitPrice * a.qty;
      if (p) trendSum += p.trend * a.qty;
      else missing += a.qty;
    }
    const total = shipment.total != null ? shipment.total : null;
    const shipping = total != null ? Math.max(0, total - articleSum) : null;
    const worth = total != null && missing === 0 ? total < trendSum : null;
    return { total, articleSum, shipping, trendSum, missing, worth, diff: total != null && missing === 0 ? trendSum - total : null };
  }

  /** @param {Shipment} shipment @param {Map<string, TrendInfo>} prices @returns {ShipmentResult} */
  function renderShipment(shipment, prices) {
    const r = evaluate(shipment, prices);

    // Per-article annotations
    for (const a of shipment.articles) {
      const p = prices.get(a.productId);
      const nameCell = a.el.querySelector("td.name, .name") || a.el;
      const note = el("div", "cmc-note");
      if (!p) {
        note.textContent = "No English trend price found";
        note.classList.add("cmc-muted");
      } else {
        note.append(`Cheapest EN trend: ${fmt(p.trend)} `);
        const link = /** @type {HTMLAnchorElement} */ (el("a", "cmc-link", `(${p.set}${p.foilOnly ? ", foil" : ""})`));
        link.href = p.url;
        link.target = "_blank";
        link.rel = "noopener";
        note.append(link);
        if (a.unitPrice != null) {
          const good = a.unitPrice <= p.trend;
          a.el.classList.add(good ? "cmc-row-good" : "cmc-row-bad");
        }
      }
      nameCell.appendChild(note);
    }

    // Shipment verdict panel
    const panel = el("div", "cmc-panel");
    const cls = r.worth === true ? "cmc-good" : r.worth === false ? "cmc-bad" : "cmc-unknown";
    panel.classList.add(cls);
    const verdict =
      r.worth === true ? "✅ Worth it" :
      r.worth === false ? "❌ Not worth it" :
      r.total == null ? "⚠️ Couldn't read the seller total" :
      `⚠️ Incomplete: no price for ${r.missing} card(s)`;
    panel.appendChild(el("div", "cmc-verdict", verdict));

    const table = el("table", "cmc-table");
    const rows = [
      ["Cards", fmt(r.articleSum)],
      ["Shipping & fees", fmt(r.shipping)],
      ["Total incl. shipping", fmt(r.total)],
      ["Σ cheapest English trend", fmt(r.trendSum) + (r.missing ? ` (excl. ${r.missing})` : "")],
      [r.diff == null ? "Difference" : r.diff >= 0 ? "You save vs trend" : "You overpay vs trend", r.diff != null ? fmt(Math.abs(r.diff)) : "?"],
    ];
    for (const [k, v] of rows) {
      const tr = el("tr");
      tr.appendChild(el("td", null, k));
      tr.appendChild(el("td", "cmc-num", v));
      table.appendChild(tr);
    }
    panel.appendChild(table);

    const anchor = shipment.summaryEl || shipment.el.firstElementChild;
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(panel, anchor);
    else shipment.el.prepend(panel);
    return r;
  }

  /** @param {{s: Shipment, r: ShipmentResult}[]} results @param {string} [status] */
  function renderOverview(results, status) {
    const box = el("div", "cmc-overview");
    const head = el("div", "cmc-overview-head", "MTG cart check");
    const close = el("button", "cmc-btn", "×");
    close.title = "Hide (this page only)";
    close.onclick = () => box.remove();
    const buttons = el("span", "cmc-head-buttons");
    buttons.append(offButton(restart), close);
    head.appendChild(buttons);
    box.appendChild(head);

    if (status) {
      box.appendChild(el("div", null, status));
    } else {
      const good = results.filter((x) => x.r.worth === true);
      const bad = results.filter((x) => x.r.worth === false);
      const unk = results.length - good.length - bad.length;
      box.appendChild(el("div", null, `${good.length} worth it · ${bad.length} not · ${unk} unknown`));
      const list = el("ul", "cmc-list");
      for (const { s, r } of results) {
        const li = el("li", r.worth === true ? "cmc-good-text" : r.worth === false ? "cmc-bad-text" : "cmc-muted");
        li.textContent = `${s.seller}: ${fmt(r.total)} vs ${fmt(r.trendSum)}`;
        li.style.cursor = "pointer";
        li.onclick = () => s.el.scrollIntoView({ behavior: "smooth", block: "start" });
        list.appendChild(li);
      }
      box.appendChild(list);
    }
    const refresh = el("button", "cmc-btn cmc-refresh", "Refresh prices");
    refresh.onclick = async () => { await clearCache(); run(); };
    box.appendChild(refresh);
    document.body.appendChild(box);
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
      removeOld();
      again = false;
      // Turned off: nothing is parsed or looked up, only the "On" button is shown.
      if (!(await getSettings()).enabled) { renderOffBox(restart); return; }
      const shipments = parseCart(document);
      if (!shipments.length) return;
      renderOverview([], "Looking up trend prices…");

      const prices = new Map();
      const unique = new Map();
      shipments.forEach((s) => s.articles.forEach((a) => unique.set(a.productId, a.name)));
      for (const [pid, name] of unique) {
        if (again) return; // turned off (or on) mid-check: finally{} starts a fresh run
        try {
          const p = await lookup(pid, name);
          if (p) prices.set(pid, p);
        } catch (e) {
          console.warn("[CMC] lookup failed", pid, name, e);
        }
      }

      removeOld();
      const results = shipments.map((s) => ({ s, r: renderShipment(s, prices) }));
      renderOverview(results);
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

  root.CMC = Object.assign(root.CMC, { run, evaluate });
  if (!root.CMC_NO_AUTORUN) {
    run();
    observer.observe(document.body, { childList: true, subtree: true });
    // Switched on/off in another tab: follow along. Other settings don't affect the cart.
    if (typeof browser !== "undefined") browser.storage.onChanged.addListener((c) => {
      if (c.settings && migrate(c.settings.oldValue).enabled !== migrate(c.settings.newValue).enabled) restart();
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
