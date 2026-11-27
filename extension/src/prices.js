// @ts-check
/* Price lookup via Scryfall.
 * Scryfall's prices.eur is Cardmarket's price trend for that printing (non-foil),
 * prices.eur_foil the foil trend. Two ways to pick the trend (settings.trendSource):
 *  - "cheapestEnglish": find every English paper printing of the card, take the lowest trend;
 *  - "printing": the trend of the exact printing (Cardmarket product id), foil trend for foils. */
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

  /** @param {unknown} v @returns {number | null} */
  function num(v) {
    const n = v != null ? parseFloat(String(v)) : NaN;
    return Number.isFinite(n) ? n : null;
  }

  /** The parts of a Scryfall card we keep for "this printing" mode. @param {any} card @returns {PrintingInfo} */
  function printingInfo(card) {
    const prices = card.prices || {};
    return {
      name: card.name,
      set: card.set_name,
      setCode: (card.set || "").toUpperCase(),
      setType: card.set_type || "",
      eur: num(prices.eur),
      eurFoil: num(prices.eur_foil),
      nonfoil: !Array.isArray(card.finishes) || card.finishes.includes("nonfoil"),
    };
  }

  /**
   * Scryfall card for a Cardmarket product id. One request answers both modes, so both
   * cache entries are written: cmc:pid: (which card) and cmc:print: (this printing's prices).
   * @param {string} productId @returns {Promise<any>}
   */
  async function fetchByProductId(productId) {
    const card = await queuedFetchJson(`${API}/cards/cardmarket/${encodeURIComponent(productId)}`);
    await cacheSet(`cmc:print:${productId}`, card ? printingInfo(card) : null);
    return card;
  }

  /**
   * Entries cached before the filtered-set warning have no `setType`: those are fetched again
   * (once), otherwise a printing from a skipped category couldn't be recognised for a day.
   * @param {string} productId @returns {Promise<PrintingInfo | null>}
   */
  async function printingForProduct(productId) {
    const cached = await cacheGet(`cmc:print:${productId}`);
    if (cached !== undefined && (cached === null || typeof cached.setType === "string")) return cached;
    const card = await fetchByProductId(productId);
    if (card) await cacheSet(`cmc:pid:${productId}`, { oracleId: oracleIdOf(card), name: card.name });
    return card ? printingInfo(card) : null;
  }

  /** @param {string | null} productId @param {string} fallbackName @returns {Promise<{oracleId: string | null, name: string} | null>} */
  async function cardForProduct(productId, fallbackName) {
    const key = productId ? `cmc:pid:${productId}` : `cmc:name:${String(fallbackName).toLowerCase()}`;
    const cached = await cacheGet(key);
    if (cached !== undefined) return cached;

    let card = productId ? await fetchByProductId(productId) : null;
    if (!card && fallbackName) {
      card = await queuedFetchJson(`${API}/cards/named?exact=${encodeURIComponent(fallbackName)}`);
      // Cardmarket names sometimes differ slightly from Scryfall's (punctuation, accents, extra text).
      if (!card) card = await queuedFetchJson(`${API}/cards/named?fuzzy=${encodeURIComponent(fallbackName)}`);
    }
    const v = card ? { oracleId: oracleIdOf(card), name: card.name } : null;
    await cacheSet(key, v);
    return v;
  }

  /**
   * Is a printing (Scryfall set_type and set code) in the skipped sets?
   * @param {unknown} setType @param {unknown} setCode @param {Exclusion | undefined} ex
   */
  function isSkipped(setType, setCode, ex) {
    if (!ex) return false;
    return ex.types.includes(String(setType || "")) || ex.sets.includes(String(setCode || "").toLowerCase());
  }

  /** Same skipped sets -> same text, whatever order they were ticked in. @param {Exclusion | undefined} ex */
  function exclusionKey(ex) {
    return ex ? `${[...ex.types].sort().join(",")}|${[...ex.sets].sort().join(",")}` : "|";
  }

  /**
   * Cheapest English paper printing, skipping the printings in `exclude`. The cache entry
   * remembers which sets were skipped (`sig`): after the user changes the selection it no
   * longer matches, so the card is fetched again (prices are only cached for 24 h anyway).
   * Entries from before this feature have no `sig` and are refetched too.
   * @param {string} oracleId @param {Exclusion} [exclude]
   * @returns {Promise<Omit<TrendInfo, "url"> | null>}
   */
  async function cheapestEnglishTrend(oracleId, exclude) {
    const key = `cmc:oracle:${oracleId}`;
    const sig = exclusionKey(exclude);
    const cached = await cacheGet(key);
    if (cached && cached.sig === sig) return cached.v;

    const q = `oracleid:${oracleId} lang:en game:paper`;
    let url = `${API}/cards/search?q=${encodeURIComponent(q)}&unique=prints&order=released&dir=asc`;
    const prints = [];
    for (let page = 0; url && page < 10; page++) {
      const data = await queuedFetchJson(url);
      if (!data) break;
      prints.push(...(data.data || []));
      url = data.has_more ? data.next_page : null;
    }

    /** @param {any} p */
    const isExcluded = (p) => isSkipped(p.set_type, p.set, exclude);

    /** @type {Omit<TrendInfo, "printings" | "url"> | null} */
    let best = null;     // cheapest printing that isn't skipped
    /** @type {Omit<TrendInfo, "printings" | "url"> | null} */
    let bestAll = null;  // cheapest of all, for when every printing is skipped
    /** @type {number[]} */
    const skippedTrends = [];
    for (const p of prints) {
      const prices = p.prices || {};
      const eur = prices.eur != null ? parseFloat(prices.eur) : null;
      const foil = prices.eur_foil != null ? parseFloat(prices.eur_foil) : null;
      // Prefer the non-foil trend; only use foil if a printing has no non-foil version.
      const value = Number.isFinite(eur) ? eur : Number.isFinite(foil) ? foil : null;
      if (value == null) continue;
      const info = { trend: value, foilOnly: !Number.isFinite(eur), set: p.set_name, setCode: (p.set || "").toUpperCase() };
      if (!bestAll || value < bestAll.trend) bestAll = info;
      if (isExcluded(p)) skippedTrends.push(value);
      else if (!best || value < best.trend) best = info;
    }
    /** @type {Omit<TrendInfo, "url"> | null} */
    let v = null;
    if (best) {
      // Only skipped printings that were cheaper count: those are the ones that changed the trend.
      const bestTrend = best.trend;
      v = Object.assign(best, { printings: prints.length, skipped: skippedTrends.filter((t) => t < bestTrend).length });
    } else if (bestAll) {
      // Every priced printing is in a skipped set: use the cheapest anyway, and say so in the note.
      v = Object.assign(bestAll, { printings: prints.length, skipped: 0, excludedFallback: true });
    }
    await cacheSet(key, { sig, v });
    return v;
  }

  /**
   * The set part of a note, e.g. "M10", "M10, foil", "M10, 2 cheaper filtered" or
   * "WC97, excluded set" (every printing was in a skipped set).
   * @param {Pick<TrendInfo, "set" | "foilOnly" | "skipped" | "excludedFallback">} p
   */
  function trendSetText(p) {
    let t = p.set + (p.foilOnly ? ", foil" : "");
    if (p.excludedFallback) t += ", excluded set";
    else if (p.skipped) t += `, ${p.skipped} cheaper filtered`;
    return t;
  }

  // --- cleanup ---------------------------------------------------------------
  const CLEANUP_KEY = "cacheCleanedAt"; // not "cmc:", so "Refresh prices" doesn't reset it
  /** @type {Promise<number> | null} */
  let cleanupOnce = null;

  /**
   * Deletes expired cache entries, at most once a day. Without this, entries for cards that
   * are never looked up again would stay in storage forever.
   * @param {number} [now] @returns {Promise<number>} how many entries were removed
   */
  async function cleanupCache(now = Date.now()) {
    if (!storage) return 0;
    const { [CLEANUP_KEY]: last } = await storage.get(CLEANUP_KEY);
    if (typeof last === "number" && now - last >= 0 && now - last < CACHE_TTL_MS) return 0;
    await storage.set({ [CLEANUP_KEY]: now });
    const all = await storage.get(null);
    const expired = Object.keys(all).filter((k) => {
      const e = all[k];
      return k.startsWith("cmc:") && !(e && typeof e.t === "number" && now - e.t < CACHE_TTL_MS);
    });
    if (expired.length) await storage.remove(expired);
    return expired.length;
  }

  /** Runs the cleanup once per page, before the first lookup (so it can't remove a fresh entry). */
  function cleanupBeforeFirstLookup() {
    if (!cleanupOnce) {
      cleanupOnce = cleanupCache().catch((e) => {
        console.warn("[CMC] cache cleanup failed", e);
        return 0;
      });
    }
    return cleanupOnce;
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

  /**
   * Trend of the exact printing: the foil trend for a foil offer (or a foil-only printing),
   * otherwise the normal one. null if the printing has no trend for that finish: there is
   * deliberately no fallback to another printing (owner's choice).
   * @param {PrintingInfo} info @param {boolean} foil @returns {Omit<TrendInfo, "url"> | null}
   */
  function printingTrend(info, foil) {
    const useFoil = foil || !info.nonfoil;
    const trend = useFoil ? info.eurFoil : info.eur;
    if (trend == null) return null;
    return { name: info.name, trend, foilOnly: useFoil, set: info.set, setCode: info.setCode, printings: 1 };
  }

  /**
   * Main entry: the trend to compare a card with.
   * "cheapestEnglish" (default): product id (or name) -> card -> cheapest English printing.
   * "printing": product id -> that printing. Without a product id the printing is unknown,
   * so there is no trend (and no API call).
   * @param {string | null} productId @param {string} fallbackName @param {LookupOptions} [opts]
   * @returns {Promise<TrendInfo | null>}
   */
  async function lookup(productId, fallbackName, opts = {}) {
    /** @type {TrendSource} */
    const source = opts.source === "printing" ? "printing" : "cheapestEnglish";
    await cleanupBeforeFirstLookup();
    /** @type {Omit<TrendInfo, "url"> | null} */
    let found = null;
    if (source === "printing") {
      const info = productId ? await printingForProduct(productId) : null;
      found = info ? printingTrend(info, !!opts.foil) : null;
    } else {
      const card = await cardForProduct(productId, fallbackName);
      const best = card && card.oracleId ? await cheapestEnglishTrend(card.oracleId, opts.exclude) : null;
      found = best ? Object.assign({ name: card ? card.name : fallbackName }, best) : null;
      // The card itself is a printing from a skipped set (e.g. a gold-bordered WC97 card): it's
      // still compared with the normal trend, but gets a warning, as it's often far below it.
      // Its printing was fetched (and cached) together with the card above, so no extra call
      // (except once for entries cached before this, see printingForProduct). Not when every
      // printing is skipped: the note already says "excluded set" then.
      const ex = opts.exclude;
      if (found && productId && ex && (ex.types.length || ex.sets.length) && !found.excludedFallback) {
        const info = await printingForProduct(productId);
        if (info && isSkipped(info.setType, info.setCode, ex)) found.filteredSet = info.set;
      }
    }
    if (!found) return null;
    // The link is built here, not cached, so prices cached before this change get the new link too.
    return Object.assign({}, found, { source, url: cardmarketSearchUrl(found.name || fallbackName) });
  }

  root.CMC = Object.assign(root.CMC || {}, { lookup, clearCache, cleanupCache, trendSetText });
})(typeof globalThis !== "undefined" ? globalThis : window);
