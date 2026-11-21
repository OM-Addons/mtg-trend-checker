---
name: release
description: Set up GitHub Actions (checks + Mozilla signing + auto-updates) for this extension, or ship a new version to friends. Use when asked to release, publish, ship, sign, bump the version, or set up CI.
---

# Releasing the extension

Friends install a **signed `.xpi`** from GitHub Releases of `OM-Addons/mtg-trend-checker`. The add-on is signed by Mozilla as **unlisted** (not visible on addons.mozilla.org). Firefox desktop auto-updates it through `update_url` → `updates.json` on `main`. Android is not supported for now (owner's decision).

Pushing a tag `v<version>` runs `.github/workflows/release.yml`, which: runs `npm run check`; checks the tag matches `manifest.json`/`package.json`, is on `main`, and has a `CHANGELOG.md` section; signs with `web-ext sign --channel unlisted`; creates a GitHub release with `mtg-trend-checker-<version>.xpi`; and commits a new entry (link + sha256) to `updates.json` on `main` as `github-actions[bot]`.

---

## Part A: one-time setup: status

| Step | Status |
|---|---|
| A1. Final add-on ID | **Done**: `mtg-trend-checker@mtg-tools`. **Never change it**: installed copies would stop updating. A test pins it. |
| A2. Public repo | Repo is `OM-Addons/mtg-trend-checker`. **Check it's public** (`gh repo view OM-Addons/mtg-trend-checker --json visibility`); `update_url` and release downloads need it. Making it public is the owner's action. |
| A3. Mozilla API keys **(owner)** | Check with `gh secret list`. See below. |
| A4. `update_url` + `updates.json` | **Done**. A test keeps ID, URL and entries consistent. |
| A5. CI (`ci.yml`) | **Done**. Runs `npm run check` on PRs and pushes to `main`. |
| A6. Release workflow (`release.yml`) | **Done**. Re-check `npx web-ext sign --help` after a major `web-ext` update; flags change between majors. |
| A7. Test the setup | After the first release; see below. |

### A3. Mozilla API keys (owner)
1. Sign in at https://addons.mozilla.org/developers/ with a Mozilla account (a neutral display name is fine); accept the developer agreement; enable two-step authentication if asked.
2. *Tools → Manage API Keys* (https://addons.mozilla.org/developers/addon/api/key/) → *Generate new credentials*: a **JWT issuer** (`user:…`) and a **JWT secret**.
3. GitHub: *repo → Settings → Secrets and variables → Actions → New repository secret*: `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`.

Never ask the owner to paste the keys into the chat or a file. If they leak: revoke them on the same AMO page.

### A7. Test the setup
After the first release, ask the owner to:
- install the `.xpi` from the GitHub release in regular Firefox (open the release asset link, or `about:addons` → gear → *Install Add-on From File*), removing any temporary copy first;
- after a second release, check *about:addons → gear → Check for Updates* to confirm auto-update works.

---

## Part B: ship a version

1. Start from an up-to-date `main` with a clean tree; create branch `release/v<version>`.
2. Pick the version with the owner (semver): fix → patch, new feature → minor.
3. Set the same version in `extension/manifest.json` and `package.json`.
4. In `CHANGELOG.md`, rename "Unreleased" to `## <version> - <YYYY-MM-DD>` and add a new empty "Unreleased" section above it. Write the entries for friends, not developers. The workflow uses this section as release notes and fails if it's empty.
5. `npm run check`; commit `Release v<version>`; with the owner's OK push the branch and open a PR. Merge when CI is green and the owner agrees.
6. Tag the merge commit on `main` and push the tag (owner's go-ahead): `git switch main && git pull && git tag v<version> && git push origin v<version>`.
7. Watch the workflow (`gh run watch`). If signing fails:
   - "version already exists": a version can only be signed once; bump the patch version (new release PR) and retry;
   - missing secrets: the owner still needs to do A3;
   - otherwise show the owner the log.
   If it failed after creating the GitHub release, delete that release and tag before retrying with a new version.
8. Confirm the release has the `.xpi`, and `updates.json` on `main` has the new entry (`git pull`).
9. Tell the owner: friends get the update automatically (Firefox checks about once a day), or immediately via *about:addons → gear → Check for Updates*.
