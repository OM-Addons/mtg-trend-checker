// @ts-check
/*
 * Turns a page saved from Cardmarket (Ctrl+S → "Web Page, HTML only") into a
 * test fixture without personal data.
 *
 *   node scripts/clean-page.js cart   incoming-pages/<saved>.htm test/fixtures/<name>.html
 *   node scripts/clean-page.js offers incoming-pages/<saved>.htm test/fixtures/<name>.html
 *   node scripts/clean-page.js wizard incoming-pages/<saved>.htm test/fixtures/<name>.html
 *   options: --forbid "text1,text2"   extra strings that must not appear in the output
 *            --debug                  on failure, show where leaks are (leaked text masked)
 *
 * Allowlist approach: only the parts the parsers read are kept (the cart's
 * .shipment-block sections, the seller page's offer table, or the shopping wizard's
 * Results Summary and seller blocks). Scripts, forms,
 * inputs and tokens are removed, usernames become Seller1, Seller2, …, and
 * numeric IDs that identify the account (wants lists, shipments, sellers) are
 * dropped. Finally the output is checked against strings taken from the
 * original page (account name, shipping address, tokens, usernames) plus
 * --forbid; if any is found, nothing is written.
 *
 * Always look at the result before committing it.
 */
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

/** @param {string} msg @returns {never} */
function fail(msg) {
  console.error(`clean-page: ${msg}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const debugIdx = args.indexOf("--debug");
const debug = debugIdx >= 0;
if (debug) args.splice(debugIdx, 1);
const forbidIdx = args.indexOf("--forbid");
const extraForbidden = forbidIdx >= 0 ? (args.splice(forbidIdx, 2)[1] || "").split(",").map((s) => s.trim()).filter(Boolean) : [];
const [kind, input, output] = args;
if (!["cart", "offers", "wizard"].includes(kind) || !input || !output) {
  fail("usage: node scripts/clean-page.js <cart|offers|wizard> <saved page> <fixture> [--forbid \"a,b\"]");
}

const original = fs.readFileSync(input, "utf8");
const doc = new JSDOM(original).window.document;

// ---- 1. Collect what must never appear in the output -----------------------
/** @type {Set<string>} */
const forbidden = new Set(extraForbidden);
const credit = doc.getElementById("totalCreditMainNav");
const accountName = credit && credit.previousElementSibling ? (credit.previousElementSibling.textContent || "").trim() : "";
if (accountName) forbidden.add(accountName);
/** Shipping address lines (name, street, city, country): replaced wherever they occur. */
const addressLines = [...doc.querySelectorAll("#ShippingAddress *")]
  .map((el) => (el.textContent || "").trim())
  .filter((t) => t.length >= 3);
for (const t of addressLines) forbidden.add(t);
for (const m of original.matchAll(/[0-9a-f]{40,}/g)) forbidden.add(m[0]); // __cmtkn / csrf tokens
// Shopping wizard: the calculation id (also in the page URL) identifies the user's wants list run.
for (const m of original.matchAll(/name="idCalculation" value="([^"]+)"|ShoppingWizard\/Results\/([\w-]+)/g)) forbidden.add(m[1] || m[2]);
// The user's own country, from tooltips like "delivery time from Spain to <country>" and
// "tracked shipping to <country>". Replaced by "[country]" everywhere (also where it is a seller's).
/** @type {Set<string>} */
const ownCountries = new Set();
for (const m of original.matchAll(/(?:delivery time from [A-Za-z ]+? to |shipping(?:<\/strong>|&lt;\/strong&gt;)? to )([A-Z][A-Za-z ]*?[a-z])\s*[.:]/g)) ownCountries.add(m[1]);
for (const c of ownCountries) forbidden.add(c);

// Usernames from links (/Users/<name>, ?username=<name>, /Messages/<name>).
/** @type {Map<string, string>} */
const aliases = new Map();
const USER_RE = /\/Users\/([^/?#"'&]+)|[?&]username=([^&#"']+)|\/Messages\/([^/?#"'&]+)/g;
for (const m of original.matchAll(USER_RE)) {
  const name = decodeURIComponent(m[1] || m[2] || m[3]);
  if (name === accountName) continue;
  if (!aliases.has(name)) aliases.set(name, `Seller${aliases.size + 1}`);
}
for (const name of aliases.keys()) forbidden.add(name);

// Account-specific numeric IDs: sellers in this cart, shipments, wants lists. Replaced by 0.
/** @type {Set<string>} */
const accountIds = new Set();
const ID_RE = /\bid="?seller(\d+)|name="idSeller" value="(\d+)|idShipment(?:=|" value=")(\d+)|name="idShipment" value="(\d+)|idWantslist=(\d+)/g;
for (const m of original.matchAll(ID_RE)) {
  const id = m.slice(1).find(Boolean);
  if (id) accountIds.add(id);
}
const ID_SWEEP = accountIds.size ? new RegExp(`(?<!\\d)(?:${[...accountIds].join("|")})(?!\\d)`, "g") : null;

// ---- 2. Keep only what the parsers read -----------------------------------
/** @type {Element[]} */
let keep;
if (kind === "cart") {
  keep = [...doc.querySelectorAll(".shipment-block")];
  if (!keep.length) fail("no .shipment-block found: is this a cart page?");
} else if (kind === "wizard") {
  const summary = doc.getElementById("ShoppingWizardResult")?.closest("section");
  const firstBlock = doc.querySelector(".detailed-result-card");
  if (!summary || !firstBlock) fail("no #ShoppingWizardResult / .detailed-result-card found: is this a shopping wizard results page?");
  // The seller blocks sit in one .row of columns; keep that row so the layout stays as on the site.
  keep = [summary, /** @type {Element} */ (firstBlock.closest(".row") || firstBlock.parentElement)];
} else {
  const table = doc.querySelector(".article-row")?.closest(".table, table, section");
  if (!table) fail("no offer rows (.article-row) found: is this a seller offers page?");
  keep = [table];
}

const out = new JSDOM("<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>").window.document;
const main = out.createElement("main");
out.body.appendChild(main);
for (const el of keep) main.appendChild(out.importNode(el, true));

// Remove active/sensitive elements.
for (const el of main.querySelectorAll("script, style, link, meta, noscript, iframe, object, embed, template")) el.remove();
for (const el of main.querySelectorAll("input, select, textarea, button")) el.remove();
for (const form of main.querySelectorAll("form")) form.replaceWith(...form.childNodes);
// Links to messages / order history of a user aren't needed.
for (const a of main.querySelectorAll("a[href*='/Messages/'], a[href*='username=']")) a.remove();

// Longest first, so "Name Surname" is replaced before "Name".
const usersLongestFirst = [...aliases].sort((a, b) => b[0].length - a[0].length);
const addressLongestFirst = [...addressLines].sort((a, b) => b.length - a.length);

/** Replace usernames, address lines and account-specific URL parts in text or an attribute value. @param {string} s */
function scrub(s) {
  s = s
    .replace(/\/Users\/([^/?#"'&]+)/g, (all, n) => `/Users/${aliases.get(decodeURIComponent(n)) || "SellerX"}`)
    .replace(/[?&]idWantslist=\d+/g, "");
  for (const [name, alias] of usersLongestFirst) s = s.split(name).join(alias);
  for (const line of addressLongestFirst) s = s.split(line).join("[removed]");
  for (const c of ownCountries) s = s.split(c).join("[country]");
  if (ID_SWEEP) s = s.replace(ID_SWEEP, "0");
  return s;
}

for (const el of main.querySelectorAll("*")) {
  for (const attr of [...el.attributes]) {
    const n = attr.name;
    if (n.startsWith("on") || n === "nonce" || n === "integrity") { el.removeAttribute(n); continue; }
    // HTML stored in attributes (mobile headers, modals) with account links isn't needed by the parsers.
    if (/\/Messages\/|username=|\/Account\/|idShipment=/.test(attr.value)) { el.removeAttribute(n); continue; }
    // Account-specific numeric IDs (seller/shipment/form ids); product and article ids stay.
    if ((n === "id" || n === "name" || n === "for") && /^(seller|shipment|shippingMethodForm|use-trustee|idArticle)\D*\d+/i.test(attr.value)) {
      el.removeAttribute(n);
      continue;
    }
    // Attributes can hold HTML (tooltips), so usernames/addresses can hide there too.
    const v = scrub(attr.value);
    if (v !== attr.value) el.setAttribute(n, v);
  }
}
const walker = out.createTreeWalker(main, 4 /* NodeFilter.SHOW_TEXT */);
for (let node = walker.nextNode(); node; node = walker.nextNode()) {
  const t = node.textContent || "";
  const v = scrub(t);
  if (v !== t) node.textContent = v;
}

// ---- 3. Verify and write ---------------------------------------------------
const source = path.basename(input).replace(/[^\w .-]/g, "");
const header = `<!-- REAL Cardmarket page (${kind}), saved ${new Date().toISOString().slice(0, 10)} from "${source}", ` +
  `reduced to what the parsers read and anonymised by scripts/clean-page.js. -->\n`;
const html = header + "<!doctype html>\n" + out.documentElement.outerHTML + "\n";

const leaks = [...forbidden].filter((s) => s && html.includes(s));
if (ID_SWEEP && new RegExp(ID_SWEEP.source).test(html)) leaks.push("<account id>");
if (/\/Messages\/|username=|\/Account\/|idShipment=|__cmtkn/.test(html)) leaks.push("<account link or token>");
if (leaks.length) {
  if (debug) {
    // Show where each leak is, with the leaked text itself masked.
    for (const s of leaks) {
      const i = html.indexOf(s);
      const ctx = html.slice(Math.max(0, i - 120), i + s.length + 60).split(s).join(`<<${s.length} chars>>`);
      console.error(`--- leak:\n${ctx}`);
    }
  }
  fail(`${leaks.length} forbidden string(s) still in the output (not shown); nothing written. Extend the cleaning first.`);
}
fs.writeFileSync(output, html);
console.log(`clean-page: wrote ${output} (${html.length} bytes; ${aliases.size} username(s) replaced, ${forbidden.size} strings checked)`);
