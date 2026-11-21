// @ts-check
/* Parsing helpers for the Cardmarket shopping cart page.
 * Exposed on globalThis.CMC so the other content scripts (and tests) can use them. */
(function (root) {
  "use strict";

  /**
   * Parse a money string as Cardmarket shows it, e.g. "1.234,56 €", "0,02 €", "€ 12.50".
   * Returns a Number or null.
   */
  /** @param {string | null | undefined} text @returns {number | null} */
  function parseEuro(text) {
    if (text == null) return null;
    let s = String(text).replace(/[^\d.,-]/g, "");
    if (!/\d/.test(s)) return null;
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > -1 && lastDot > -1) {
      // Whichever separator comes last is the decimal separator.
      if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
      else s = s.replace(/,/g, "");
    } else if (lastComma > -1) {
      s = s.replace(/\.(?=\d{3})/g, "").replace(",", ".");
    } else if (lastDot > -1) {
      // Prices always have 2 decimals, so "1.234" or "1.234.567" means thousands separators.
      const parts = s.split(".");
      if (parts.length > 2 || parts[1].length === 3) s = s.replace(/\./g, "");
    }
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }

  /** All money amounts found in a piece of text, in order. */
  /** @param {string | null | undefined} text @returns {number[]} */
  function allEuros(text) {
    const matches = String(text || "").match(/\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?\s*€|€\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?/g) || [];
    return matches.map(parseEuro).filter((n) => n != null);
  }

  /** @param {string | null | undefined} text @returns {string} */
  function cleanName(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .replace(/\(V\.\s*\d+\)/gi, "")
      .trim();
  }

  /** @param {Element} el */
  function isVisible(el) {
    // offsetParent is null for display:none elements (and always null in jsdom).
    return /** @type {HTMLElement} */ (el).offsetParent !== null;
  }

  /**
   * Parse the cart into shipments:
   * [{ el, seller, total, articles: [{ el, productId, name, unitPrice, qty }] }]
   */
  /** @param {Document} doc @returns {Shipment[]} */
  function parseCart(doc) {
    const blocks = Array.from(doc.querySelectorAll(".shipment-block"));
    return blocks.map((block, idx) => {
      let rows = Array.from(block.querySelectorAll("[data-product-id]"));
      // Cardmarket renders some rows twice (desktop/mobile); prefer the visible ones when layout exists.
      const visible = rows.filter(isVisible);
      if (visible.length) rows = visible;

      /** @type {CartArticle[]} */
      const articles = [];
      for (const row of rows) {
        const productId = row.getAttribute("data-product-id");
        if (!productId) continue;
        const nameCell = row.querySelector("td.name, .name");
        const priceCell = row.querySelector("td.price, .price");
        const amountCell = row.querySelector("td.amount, .amount");
        const qtyMatch = amountCell ? amountCell.textContent.match(/\d+/) : null;
        articles.push({
          el: row,
          productId,
          name: cleanName(nameCell ? nameCell.textContent : ""),
          unitPrice: priceCell ? parseEuro(priceCell.textContent) : null,
          qty: qtyMatch ? parseInt(qtyMatch[0], 10) : 1,
        });
      }

      const summary = block.querySelector(".summary");
      let total = null;
      if (summary) {
        const totalEl = summary.querySelector(".total.strong") || summary.querySelector(".total");
        if (totalEl) {
          const amounts = allEuros(totalEl.textContent);
          total = amounts.length ? amounts[amounts.length - 1] : parseEuro(totalEl.textContent);
        }
        if (total == null) {
          // Fallback: the total is the largest amount in the summary box.
          const amounts = allEuros(summary.textContent);
          if (amounts.length) total = Math.max(...amounts);
        }
      }

      const sellerEl = block.querySelector(".seller-name a, a[href*='/Users/']");
      const seller = sellerEl ? sellerEl.textContent.trim() : `Seller ${idx + 1}`;

      return { el: block, summaryEl: summary, seller, total, articles };
    });
  }

  root.CMC = Object.assign(root.CMC || {}, { parseEuro, allEuros, cleanName, parseCart });
})(typeof globalThis !== "undefined" ? globalThis : window);
