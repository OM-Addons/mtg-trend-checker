---
name: release
description: Set up GitHub Actions (checks + Mozilla signing + auto-updates) for this extension, or ship a new version to friends. Use when asked to release, publish, ship, sign, bump the version, or set up CI.
---

# Releasing the extension

Friends install a **signed `.xpi`** from GitHub Releases. The add-on is signed by Mozilla as **unlisted** (not visible on addons.mozilla.org). Firefox auto-updates it through `update_url` → `updates.json` in this repo.

First check whether the one-time setup has been done: does `.github/workflows/release.yml` exist? If not, do **Part A** first, then Part B.

---

## Part A: one-time setup

Do these in order and confirm each step that needs the owner with them. Steps marked **(owner)** can't be done by Claude.

### A1. Decide the final add-on ID
`extension/manifest.json` → `browser_specific_settings.gecko.id` is currently `cm-cart-checker@local`. It can **never change after the first signed release**. Propose something unique like `cardmarket-mtg-trend-checker@<github-username>` and let the owner confirm before changing it.

### A2. Check the repo is public
`update_url` must be reachable without logging in. Ask the owner: is the GitHub repo public?
- **Public:** use `https://raw.githubusercontent.com/<owner>/<repo>/main/updates.json`.
- **Private:** raw URLs need a login, so auto-update won't work. Options: make the repo public; host `updates.json` and the `.xpi` elsewhere; or skip auto-update and have friends install each release by hand. Let the owner choose.

### A3. Mozilla API keys **(owner)**
1. Log in at https://addons.mozilla.org and open *Tools → Manage API Keys* (https://addons.mozilla.org/developers/addon/api/key/).
2. Generate credentials: a **JWT issuer** and a **JWT secret**.
3. In GitHub: *repo → Settings → Secrets and variables → Actions → New repository secret*. Add `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`.

Never ask the owner to paste the secret into the chat or a file.

### A4. Add `update_url` and `updates.json`
In `extension/manifest.json`, under `browser_specific_settings.gecko`, add `"update_url": "<URL from A2>"`.

Create `updates.json` in the repo root:
```json
{
  "addons": {
    "<add-on id from A1>": {
      "updates": []
    }
  }
}
```

### A5. CI workflow: `.github/workflows/ci.yml`
Already added (runs on pull requests and pushes to `main`); just check it's still there and green. It does: checkout, `actions/setup-node` (Node 22, npm cache), `npm ci`, `npm run check`. Commit `package-lock.json` (it's required for `npm ci`).

### A6. Release workflow: `.github/workflows/release.yml`
Trigger: push of a tag matching `v*`. Permissions: `contents: write`. Steps:
1. Checkout `main` with full history; setup Node 22; `npm ci`; `npm run check`.
2. Fail if the tag (without `v`) ≠ `version` in `extension/manifest.json` or `package.json`.
3. Sign:
   ```bash
   npx web-ext sign --source-dir extension --artifacts-dir dist --channel unlisted \
     --api-key "$AMO_JWT_ISSUER" --api-secret "$AMO_JWT_SECRET" --approval-timeout 900000
   ```
   using the two secrets as env vars. Signing unlisted add-ons is automatic but can take a few minutes.
4. Create a GitHub release for the tag with the signed `.xpi` from `dist/` attached (`gh release create "$TAG" dist/*.xpi --notes-file <section from CHANGELOG.md>`, with `GH_TOKEN: ${{ github.token }}`).
5. Add an entry to `updates.json`: `{ "version": "<version>", "update_link": "https://github.com/<owner>/<repo>/releases/download/<tag>/<xpi file name>" }`. Commit it to `main` as `github-actions[bot]` and push.

Use `web-ext` from devDependencies via `npx`. Check the current `web-ext sign` options with `npx web-ext sign --help` before writing the step; they change between major versions.

### A7. Test the setup
Do a first release with Part B (e.g. `1.2.0` → tag `v1.2.0`). Ask the owner to:
- install the `.xpi` from the GitHub release in regular Firefox (`about:addons` → gear → *Install Add-on From File*), and remove the temporary version first;
- later, after a second release, check *about:addons → gear → Check for Updates* to confirm auto-update works.

Then update `README.md`'s "Install" section with the release link for friends.

---

## Part B: ship a version

1. Make sure the working tree is clean and on `main`, and that `npm run check` passes.
2. Pick the version with the owner (semver): fix → patch, new feature → minor.
3. Set the same version in `extension/manifest.json` and `package.json`.
4. In `CHANGELOG.md`, rename "Unreleased" to `## <version> - <YYYY-MM-DD>` and add a new empty "Unreleased" section. Write the entries for friends, not developers.
5. Commit `Release v<version>`, tag `v<version>`, and push the commit and the tag (`git push && git push origin v<version>`). Pushing needs the owner's go-ahead.
6. Watch the workflow (`gh run watch`). If signing fails:
   - "version already exists" means a version can only be signed once: bump the patch version and retry;
   - otherwise show the owner the log.
7. Confirm the GitHub release has the `.xpi` and `updates.json` on `main` has the new entry.
8. Tell the owner: friends get the update automatically (Firefox checks about once a day), or immediately via *about:addons → gear → Check for Updates*.
