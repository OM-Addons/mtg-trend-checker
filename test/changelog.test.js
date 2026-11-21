const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { fakeBrowser, text } = require("./helpers");

const EXT = path.join(__dirname, "..", "extension");
const CHANGELOG = fs.readFileSync(path.join(EXT, "CHANGELOG.md"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, "manifest.json"), "utf8"));

/** Opens changelog.html like Firefox would, serving `md` as ../CHANGELOG.md. */
async function changelogPage(md = CHANGELOG, { ok = true } = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(EXT, "changelog", "changelog.html"), "utf8"), { runScripts: "outside-only" });
  const w = dom.window;
  w.browser = fakeBrowser();
  w.fetch = async (url) => {
    assert.equal(url, "../CHANGELOG.md");
    return { ok, status: ok ? 200 : 404, text: async () => md };
  };
  w.eval(fs.readFileSync(path.join(EXT, "changelog", "changelog.js"), "utf8"));
  await new Promise((r) => setTimeout(r, 10));
  return w.document;
}

const plain = (v) => JSON.parse(JSON.stringify(v));

test("parseChangelog: versions with their entries, empty sections left out, wrapped lines joined", () => {
  const dom = new JSDOM("", { runScripts: "outside-only" });
  dom.window.CMC_NO_AUTORUN = true;
  dom.window.eval(fs.readFileSync(path.join(EXT, "changelog", "changelog.js"), "utf8"));
  const md = "# Changelog\n\n## Unreleased\n\n## 1.1.0 - 2026-01-02\n- One\n- Two that\n  wraps\r\n\n## 1.0.0 - 2026-01-01\n- First\n";
  assert.deepEqual(plain(dom.window.CMC_CHANGELOG.parseChangelog(md)), [
    { title: "1.1.0 - 2026-01-02", items: ["One", "Two that wraps"] },
    { title: "1.0.0 - 2026-01-01", items: ["First"] },
  ]);
});

test("the real changelog is shown, with the installed version marked", async () => {
  const d = await changelogPage();
  const titles = [...d.querySelectorAll("h2")].map((h) => h.firstChild.textContent);
  assert.ok(titles.length >= 1);
  assert.equal(text(d.getElementById("version")), `Installed version: ${manifest.version}`);
  const marked = [...d.querySelectorAll(".installed")].map((t) => t.parentElement.firstChild.textContent);
  assert.deepEqual(marked, [titles.find((t) => t.startsWith(manifest.version + " "))]);
  assert.ok(!text(d.getElementById("log")).includes("**"), "Markdown bold is rendered, not shown raw");
});

test("the installed version has its own section in the changelog", () => {
  // Release notes come from this section too; the release workflow fails without it.
  assert.ok(CHANGELOG.split("\n").some((l) => l.startsWith(`## ${manifest.version} `)));
});

test("bold and code become elements; HTML in the file is shown as text", async () => {
  const d = await changelogPage("## 2.0.0 - x\n- **Big** change in `settings` <img src=x onerror=alert(1)>\n");
  const li = d.querySelector("li");
  assert.equal(li.querySelector("strong").textContent, "Big");
  assert.equal(li.querySelector("code").textContent, "settings");
  assert.equal(li.querySelector("img"), null);
  assert.match(li.textContent, /<img src=x/);
});

test("a changelog that can't be loaded shows a message instead of 'Loading…'", async () => {
  const d = await changelogPage("", { ok: false });
  assert.equal(text(d.getElementById("log")), "Couldn't load the list of changes.");
});

test("an empty changelog says so", async () => {
  const d = await changelogPage("# Changelog\n\n## Unreleased\n");
  assert.equal(text(d.getElementById("log")), "No changes listed yet.");
});

test("settings page links to What's new and opens it in a tab", async () => {
  const OPTIONS = path.join(EXT, "options");
  const dom = new JSDOM(fs.readFileSync(path.join(OPTIONS, "options.html"), "utf8"), { runScripts: "outside-only" });
  const w = dom.window;
  w.browser = fakeBrowser();
  w.eval(fs.readFileSync(path.join(EXT, "src", "settings.js"), "utf8"));
  w.eval(fs.readFileSync(path.join(OPTIONS, "options.js"), "utf8"));
  await new Promise((r) => setTimeout(r, 10));
  const link = w.document.getElementById("whatsnew");
  assert.equal(link.textContent, "What's new");
  link.click();
  assert.deepEqual(w.browser.tabs.opened, ["moz-extension://test/changelog/changelog.html"]);
});
