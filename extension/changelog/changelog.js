// @ts-check
/* "What's new" page: shows extension/CHANGELOG.md, the same file the release notes come from.
 * The file only uses a tiny bit of Markdown ("## " headings, "- " bullets, **bold**, `code`),
 * so it's rendered here by hand instead of pulling in a Markdown library. Everything goes in
 * through textContent, never innerHTML. */
(function (root) {
  "use strict";

  /**
   * Splits the changelog into versions. Sections without entries (like an empty
   * "Unreleased") are left out.
   * @param {string} md
   * @returns {{title: string, items: string[]}[]}
   */
  function parseChangelog(md) {
    /** @type {{title: string, items: string[]}[]} */
    const sections = [];
    for (const raw of md.split(/\r?\n/)) {
      const line = raw.trim();
      const cur = sections[sections.length - 1];
      if (line.startsWith("## ")) sections.push({ title: line.slice(3).trim(), items: [] });
      else if (line.startsWith("- ") && cur) cur.items.push(line.slice(2).trim());
      else if (line && cur && cur.items.length && !line.startsWith("#")) {
        cur.items[cur.items.length - 1] += " " + line; // wrapped bullet continues on the next line
      }
    }
    return sections.filter((s) => s.items.length);
  }

  /**
   * Text with **bold** and `code` as DOM nodes.
   * @param {Document} doc @param {string} text
   * @returns {Node[]}
   */
  function inline(doc, text) {
    return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).filter(Boolean).map((part) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        const b = doc.createElement("strong");
        b.textContent = part.slice(2, -2);
        return b;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        const c = doc.createElement("code");
        c.textContent = part.slice(1, -1);
        return c;
      }
      return doc.createTextNode(part);
    });
  }

  /**
   * @param {Document} doc
   * @param {{title: string, items: string[]}[]} sections
   * @param {string | null} installed version from the manifest
   */
  function render(doc, sections, installed) {
    const log = /** @type {HTMLElement} */ (doc.getElementById("log"));
    log.replaceChildren();
    for (const s of sections) {
      const h = doc.createElement("h2");
      h.textContent = s.title;
      // Titles look like "1.2.1 - 2026-11-21"; mark the one that is installed.
      if (installed && s.title.split(/\s/)[0] === installed) {
        const tag = doc.createElement("span");
        tag.className = "installed";
        tag.textContent = "installed";
        h.append(tag);
      }
      const ul = doc.createElement("ul");
      for (const item of s.items) {
        const li = doc.createElement("li");
        li.append(...inline(doc, item));
        ul.append(li);
      }
      log.append(h, ul);
    }
    if (!sections.length) log.textContent = "No changes listed yet.";
  }

  async function main() {
    const doc = root.document;
    const installed = typeof browser !== "undefined" ? browser.runtime.getManifest().version : null;
    if (installed) /** @type {HTMLElement} */ (doc.getElementById("version")).textContent = `Installed version: ${installed}`;
    try {
      const res = await fetch("../CHANGELOG.md");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      render(doc, parseChangelog(await res.text()), installed);
    } catch (e) {
      console.warn("[CMC] changelog", e);
      /** @type {HTMLElement} */ (doc.getElementById("log")).textContent = "Couldn't load the list of changes.";
    }
  }

  root.CMC_CHANGELOG = { parseChangelog, render };
  if (!root.CMC_NO_AUTORUN) main();
})(typeof globalThis !== "undefined" ? globalThis : window);
