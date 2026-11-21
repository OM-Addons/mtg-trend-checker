/**
 * Shared types for the extension. The content scripts are plain JS files that
 * share code through the global `CMC` object (no bundler, no modules), so the
 * shape of that object is declared here for the type checker.
 * This file is NOT shipped with the extension.
 */

/** One card row in the shopping cart. */
interface CartArticle {
  el: Element;
  /** Cardmarket product id (data-product-id). */
  productId: string;
  name: string;
  /** Price per copy in EUR, or null if it couldn't be read. */
  unitPrice: number | null;
  qty: number;
}

/** One seller block ("shipment") in the shopping cart. */
interface Shipment {
  el: Element;
  summaryEl: Element | null;
  seller: string;
  /** Seller total incl. shipping and fees, or null if it couldn't be read. */
  total: number | null;
  articles: CartArticle[];
}

/** Result of evaluating one shipment against trend prices. */
interface ShipmentResult {
  total: number | null;
  articleSum: number;
  shipping: number | null;
  trendSum: number;
  /** Number of copies without a trend price. */
  missing: number;
  /** true = worth it, false = not, null = unknown (missing data). */
  worth: boolean | null;
  /** trendSum - total (positive = you save), null if unknown. */
  diff: number | null;
}

/** One offer row on a seller's offers page. */
interface Offer {
  el: Element;
  /** Cell the notes are appended to. */
  nameCell: Element;
  link: HTMLAnchorElement;
  name: string;
  url: string;
  /** Cardmarket product id from the thumbnail URL, if present. */
  productId: string | null;
  /** Language from the flag icon tooltip, null if unknown. */
  language: string | null;
  price: number | null;
}

/** Cheapest English printing found for a card. */
interface TrendInfo {
  name?: string;
  /** Lowest Cardmarket trend price (EUR) among English paper printings. */
  trend: number;
  /** True when the cheapest printing only has a foil trend. */
  foilOnly: boolean;
  set: string;
  setCode: string;
  url: string;
  printings: number;
}

/** Outcome of comparing one offer with its trend. */
interface Judgement {
  /** Required discount (%) for this price bracket. */
  pct: number;
  /** Actual discount vs trend in % (negative = above trend). */
  discount: number;
  deal: boolean;
}

/** One price range on seller pages. Runs from `from` (inclusive) to the next bracket's `from`. */
interface Bracket {
  /** Start price in EUR (inclusive), 0 or more. */
  from: number;
  /** Required discount (%) for offers in this range, 0–100. */
  pct: number;
}

interface Settings {
  /** Sorted by `from`, unique, 1 to MAX_BRACKETS entries. Offers below the first `from` are ignored. */
  brackets: Bracket[];
  englishOnly: boolean;
  desktopNotify: boolean;
}

/** Everything the scripts put on the shared global object. */
interface CMCNamespace {
  // parse.js
  parseEuro(text: string | null | undefined): number | null;
  allEuros(text: string | null | undefined): number[];
  cleanName(text: string | null | undefined): string;
  parseCart(doc: Document): Shipment[];
  // prices.js
  lookup(productId: string | null, fallbackName: string): Promise<TrendInfo | null>;
  clearCache(): Promise<void>;
  // settings.js
  DEFAULTS: Settings;
  MAX_BRACKETS: number;
  defaults(): Settings;
  getSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<void>;
  migrate(stored: any): Settings;
  normalizeBrackets(list: unknown): Bracket[];
  validateBrackets(rows: { from: number; pct: number }[]): { message: string; index: number; field: "from" | "pct" | null } | null;
  requiredDiscount(price: number | null, s: Settings): number | null;
  ignoredBelow(s: Settings): number;
  rangeLabel(from: number, allFroms: number[]): string;
  fmtEuro(n: number | null | undefined): string;
  // content.js (cart page)
  run(): Promise<void>;
  evaluate(shipment: Pick<Shipment, "total" | "articles">, prices: Map<string, Pick<TrendInfo, "trend">>): ShipmentResult;
  // offers.js (seller pages)
  runOffers(): Promise<void>;
  parseOffers(doc: Document): Offer[];
  judge(price: number, trend: number, settings: Settings): Judgement | null;
  detectLanguage(row: Element): string | null;
}

declare var CMC: CMCNamespace;
/** Set by tests to stop the content scripts from running on load. */
declare var CMC_NO_AUTORUN: boolean | undefined;
