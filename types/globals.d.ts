/**
 * Shared types for the extension. The content scripts are plain JS files that
 * share code through the global `CMC` object (no bundler, no modules), so the
 * shape of that object is declared here for the type checker.
 * This file is NOT shipped with the extension.
 */

/** One card row in the shopping cart. */
interface CartArticle {
  el: Element;
  /** Cardmarket product id (cart: data-product-id; wizard: thumbnail URL, null if missing). */
  productId: string | null;
  name: string;
  /** Price per copy in EUR, or null if it couldn't be read. */
  unitPrice: number | null;
  qty: number;
  /** Row has Cardmarket's foil icon. */
  foil: boolean;
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

/** Shopping wizard results page: the seller blocks plus Cardmarket's Results Summary. */
interface WizardResult {
  /** One per seller block; `summaryEl` is the block's <dl> (Articles Value, Shipping Cost, Total). */
  shipments: Shipment[];
  /** The <dl> of the Results Summary, or null if not found. */
  summaryEl: Element | null;
  /** Grand total of all sellers incl. shipping, or null if it couldn't be read. */
  total: number | null;
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
  /** Desktop price box: the lines go right under the price. Null if not found. */
  priceEl: Element | null;
  link: HTMLAnchorElement;
  name: string;
  url: string;
  /** Cardmarket product id from the thumbnail URL, if present. */
  productId: string | null;
  /** Language from the flag icon tooltip, null if unknown. */
  language: string | null;
  price: number | null;
  /** Row has Cardmarket's foil icon. */
  foil: boolean;
}

/** The trend a card is compared with: the cheapest English printing, or the exact printing. */
interface TrendInfo {
  name?: string;
  /** Cardmarket trend price (EUR): the lowest among English paper printings, or the exact printing's. */
  trend: number;
  /** True when `trend` is a foil trend (cheapest-EN: that printing has only a foil trend; printing: a foil offer). */
  foilOnly: boolean;
  set: string;
  setCode: string;
  /** Cardmarket search for the card (built by `lookup`, not cached). */
  url: string;
  printings: number;
  /** Which trend this is (set by `lookup`). */
  source?: TrendSource;
  /** Cheapest EN: printings in skipped sets that were cheaper than `trend` (0 or missing: none). */
  skipped?: number;
  /** Cheapest EN: every priced printing was in a skipped set, so the cheapest of them is used anyway. */
  excludedFallback?: boolean;
}

/** Printings "Cheapest English printing" skips: Scryfall set types and lowercase set codes. */
interface Exclusion {
  types: string[];
  sets: string[];
}

/** A group of printings on the settings page (Memorabilia, Promos, …). */
interface SetCategory {
  id: string;
  label: string;
  /** Short explanation shown after the label ("" for none). */
  hint: string;
  /** Scryfall set_type values in this group. */
  types: string[];
  /** Lowercase Scryfall set codes in this group. */
  sets: string[];
}

/** What `lookup` needs to know about the offer or cart row. */
interface LookupOptions {
  source?: TrendSource;
  /** The row is a foil (only used for source "printing"). */
  foil?: boolean;
  /** Printings to skip (only used for source "cheapestEnglish"). */
  exclude?: Exclusion;
}

/** One printing as cached from Scryfall's /cards/cardmarket/{id}. */
interface PrintingInfo {
  name: string;
  set: string;
  setCode: string;
  /** Scryfall prices.eur / prices.eur_foil as numbers, null when missing. */
  eur: number | null;
  eurFoil: number | null;
  /** False for foil-only printings (Scryfall `finishes` has no "nonfoil"). */
  nonfoil: boolean;
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

/** How seller-page deals are decided: by the user's price ranges, or any offer below trend. */
type DealMode = "ranges" | "anyUnder";

/** Which trend to compare with: the cheapest English printing, or the printing on offer. */
type TrendSource = "cheapestEnglish" | "printing";

interface Settings {
  /** Sorted by `from`, unique, 1 to MAX_BRACKETS entries. Offers below the first `from` are ignored. */
  brackets: Bracket[];
  dealMode: DealMode;
  trendSource: TrendSource;
  englishOnly: boolean;
  /** False after the Off button in the overview box: no checks on any page until turned on. */
  enabled: boolean;
  /** True after the "–" button in the overview box: every page shows the box as one line until restored. */
  minimized: boolean;
  /** SET_CATEGORIES ids whose printings "Cheapest English printing" skips. */
  excludedCategories: string[];
  /** Lowercase Scryfall set codes whose printings "Cheapest English printing" skips. */
  excludedSets: string[];
}

/** Everything the scripts put on the shared global object. */
interface CMCNamespace {
  // parse.js
  parseEuro(text: string | null | undefined): number | null;
  allEuros(text: string | null | undefined): number[];
  cleanName(text: string | null | undefined): string;
  isFoil(row: Element): boolean;
  parseCart(doc: Document): Shipment[];
  // prices.js
  lookup(productId: string | null, fallbackName: string, opts?: LookupOptions): Promise<TrendInfo | null>;
  clearCache(): Promise<void>;
  cleanupCache(now?: number): Promise<number>;
  trendSetText(p: Pick<TrendInfo, "set" | "foilOnly" | "skipped" | "excludedFallback">): string;
  // settings.js
  DEFAULTS: Settings;
  MAX_BRACKETS: number;
  SET_CATEGORIES: SetCategory[];
  defaults(): Settings;
  exclusionOf(s: Pick<Settings, "excludedCategories" | "excludedSets">): Exclusion;
  normalizeSetCodes(list: unknown): string[];
  getSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<void>;
  migrate(stored: any): Settings;
  normalizeBrackets(list: unknown): Bracket[];
  validateBrackets(rows: { from: number; pct: number }[]): { message: string; index: number; field: "from" | "pct" | null } | null;
  requiredDiscount(price: number | null, s: Settings): number | null;
  ignoredBelow(s: Settings): number;
  rangeLabel(from: number, allFroms: number[]): string;
  fmtEuro(n: number | null | undefined): string;
  priceNote(price: number | null, trend: number, opts?: { pct?: string; green?: boolean; labelsFirst?: boolean }): HTMLElement;
  // onoff.js (every page with an overview box)
  setEnabled(enabled: boolean): Promise<void>;
  offButton(after: () => unknown): HTMLButtonElement;
  settingsButton(): HTMLButtonElement;
  renderOffBox(after: () => unknown): void;
  toggleRow<T extends string>(choices: [T, string, string][], current: T, pick: (value: T) => unknown): HTMLElement;
  trendSourceSwitch(current: TrendSource, after: () => unknown): HTMLElement;
  trackMinimized(settings: Pick<Settings, "minimized">): void;
  minimizeButton(): HTMLButtonElement;
  addMiniBar(box: HTMLElement, title: string, summary: string, cls?: string | null): void;
  // verdict.js (cart and wizard pages)
  cmcEl(tag: string, cls?: string | null, text?: string | null): HTMLElement;
  removeMarks(): void;
  priceKey(article: Pick<CartArticle, "productId" | "foil"> & { name?: string }, source: TrendSource): string;
  evaluate(shipment: Pick<Shipment, "total" | "articles">, prices: Map<string, Pick<TrendInfo, "trend">>, source?: TrendSource): ShipmentResult;
  lookupArticles(articles: CartArticle[], source: TrendSource, shouldStop: () => boolean, exclude?: Exclusion): Promise<Map<string, TrendInfo> | null>;
  annotateArticle(a: CartArticle, p: TrendInfo | undefined, source: TrendSource, cell: Element, priceCell?: Element | null): void;
  verdictKind(r: ShipmentResult): "good" | "bad" | "unknown";
  verdictText(r: ShipmentResult, whatTotal?: string): string;
  diffWords(diff: number): string;
  verdictRows(r: ShipmentResult, source: TrendSource, whatTotal?: string): { label: string; value: string; cls: string }[];
  renderOverviewBox(o: {
    title: string; source: TrendSource; restart: () => unknown; run: () => unknown; status?: string;
    results?: { s: Shipment; r: ShipmentResult }[]; overall?: { text: string; kind: "good" | "bad" | "unknown" };
  }): void;
  // content.js (cart page)
  run(): Promise<void>;
  // wizard.js (shopping wizard results)
  runWizard(): Promise<void>;
  parseWizard(doc: Document): WizardResult;
  // offers.js (seller pages)
  runOffers(): Promise<void>;
  parseOffers(doc: Document): Offer[];
  judge(price: number, trend: number, settings: Settings): Judgement | null;
  detectLanguage(row: Element): string | null;
}

declare var CMC: CMCNamespace;
/** Set by tests to stop the content scripts from running on load. */
declare var CMC_NO_AUTORUN: boolean | undefined;

/** One version on the "What's new" page (a "## " section of extension/CHANGELOG.md). */
interface ChangelogSection {
  title: string;
  items: string[];
}

/** changelog.js (the "What's new" page) exposes its helpers for tests. */
declare var CMC_CHANGELOG: {
  parseChangelog(md: string): ChangelogSection[];
  render(doc: Document, sections: ChangelogSection[], installed: string | null): void;
};
