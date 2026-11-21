// @ts-check
/* Price lookup via Scryfall.
 * Scryfall's prices.eur is Cardmarket's price trend for that printing (non-foil),
 * prices.eur_foil the foil trend. We find every English paper printing of the
 * card and take the lowest trend. */
(function (root) {
  "use strict";

  const API = "https://api.scryfall.com";
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // Scryfall refreshes prices daily and asks for >= 24h caching
  const DELAY_MS = 110; // Scryfall asks for 50-100 ms between requests

  const storage = (typeof browser !== "undefined" && browser.storage && browser.storage.local) || null;
  const memCache = new Map();

  // --- polite sequential request queue -------------------------------------
  let chain = Promise.resolve();
  /** @param {string} url @returns {Promise<any>} parsed JSON, or null on 404 */
  function queuedFetchJson(url) {
    const p = chain.then(async () => {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      await new Promise((r) => setTimeout(r, DELAY_MS));
      if (res.status === 404) return null;
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 1500));
        const retry = await fetch(url, { headers: { Accept: "application/json" } });
        if (!retry.ok) throw new Error(`Scryfall ${retry.status}`);
        return retry.json();
      }
      if (!res.ok) throw new Error(`Scryfall ${res.status}`);
      return res.json();
    });
    chain = p.catch(() => {});
    return p;
  }

  // --- cache -----------------------------------------------------------------
  /** @param {string} key @returns {Promise<any>} undefined on miss/expired */
  async function cacheGet(key) {
    if (memCache.has(key)) return memCache.get(key);
    if (!storage) return undefined;
    const obj = await storage.get(key);
    const hit = obj[key];
    if (hit && Date.now() - hit.t < CACHE_TTL_MS) {
      memCache.set(key, hit.v);
      return hit.v;
    }
    return undefined;
  }
  /** @param {string} key @param {any} v */
  async function cacheSet(key, v) {
    memCache.set(key, v);
    if (storage) await storage.set({ [key]: { t: Date.now(), v } });
  }

  async function clearCache() {
    memCache.clear();
    if (!storage) return;
    const all = await storage.get(null);
    const keys = Object.keys(all).filter((k) => k.startsWith("cmc:"));
    if (keys.length) await storage.remove(keys);
  }

  // --- lookups ---------------------------------------------------------------
  /** @param {any} card Scryfall card object @returns {string | null} */
  function oracleIdOf(card) {
    return card.oracle_id || (card.card_faces && card.card_faces[0] && card.card_faces[0].oracle_id) || null;
  }

  /** @param {string | null} productId @param {string} fallbackName @returns {Promise<{oracleId: string | null, name: string} | null>} */
  async function cardForProduct(productId, fallbackName) {
    const key = productId ? `cmc:pid:${productId}` : `cmc:name:${String(fallbackName).toLowerCase()}`;
    const cached = await cacheGet(key);
    if (cached !== undefined) return cached;

    let card = productId
      ? await queuedFetchJson(`${API}/cards/cardmarket/${encodeURIComponent(productId)}`)
      : null;
    if (!card && fallbackName) {
      card = await queuedFetchJson(`${API}/cards/named?exact=${encodeURIComponent(fallbackName)}`);
      // Cardmarket names sometimes differ slightly from Scryfall's (punctuation, accents, extra text).
      if (!card) card = await queuedFetchJson(`${API}/cards/named?fuzzy=${encodeURIComponent(fallbackName)}`);
    }
    const v = card ? { oracleId: oracleIdOf(card), name: card.name } : null;
    await cacheSet(key, v);
    return v;
  }

  /** @param {string} oracleId @returns {Promise<Omit<TrendInfo, "url"> | null>} */
  async function cheapestEnglishTrend(oracleId) {
    const key = `cmc:oracle:${oracleId}`;
    const cached = await cacheGet(key);
    if (cached !== undefined) return cached;

    const q = `oracleid:${oracleId} lang:en game:paper`;
    let url = `${API}/cards/search?q=${encodeURIComponent(q)}&unique=prints&order=released&dir=asc`;
    const prints = [];
    for (let page = 0; url && page < 10; page++) {
      const data = await queuedFetchJson(url);
      if (!data) break;
      prints.push(...(data.data || []));
      url = data.has_more ? data.next_page : null;
    }

    /** @type {Omit<TrendInfo, "printings" | "url"> | null} */
    let best = null;
    for (const p of prints) {
      const prices = p.prices || {};
      const eur = prices.eur != null ? parseFloat(prices.eur) : null;
      const foil = prices.eur_foil != null ? parseFloat(prices.eur_foil) : null;
      // Prefer the non-foil trend; only use foil if a printing has no non-foil version.
      const value = Number.isFinite(eur) ? eur : Number.isFinite(foil) ? foil : null;
      if (value == null) continue;
      if (!best || value < best.trend) {
        best = {
          trend: value,
          foilOnly: !Number.isFinite(eur),
          set: p.set_name,
          setCode: (p.set || "").toUpperCase(),
        };
      }
    }
    const v = best ? Object.assign(best, { printings: prints.length }) : null;
    await cacheSet(key, v);
    return v;
  }

  /**
   * Link for the set name next to the trend: a normal Cardmarket search for the card.
   * Not Scryfall's purchase link (Products?idProduct=…&referrer=scryfall): one click on
   * that got the owner's IP rate-limited by Cardmarket's Cloudflare (error 1015).
   * Uses the site language of the current page (/en/, /de/, …) and only the front face
   * of double-faced cards ("A // B"), which finds the card under either naming.
   * @param {string} name Scryfall card name
   */
  function cardmarketSearchUrl(name) {
    const m = ((root.location && root.location.pathname) || "").match(/^\/([a-z]{2})\//);
    const lang = m ? m[1] : "en";
    const front = String(name).split(" // ")[0];
    return `https://www.cardmarket.com/${lang}/Magic/Products/Search?searchString=${encodeURIComponent(front)}`;
  }

  /** Main entry: Cardmarket product id -> cheapest English printing trend. */
  /** @param {string | null} productId @param {string} fallbackName @returns {Promise<TrendInfo | null>} */
  async function lookup(productId, fallbackName) {
    const card = await cardForProduct(productId, fallbackName);
    if (!card || !card.oracleId) return null;
    const best = await cheapestEnglishTrend(card.oracleId);
    // The link is built here, not cached, so prices cached before this change get the new link too.
    return best ? Object.assign({ name: card.name }, best, { url: cardmarketSearchUrl(card.name) }) : null;
  }

  root.CMC = Object.assign(root.CMC || {}, { lookup, clearCache });
})(typeof globalThis !== "undefined" ? globalThis : window);
