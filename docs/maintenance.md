# Maintenance and releases

Development setup and local validation commands are in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Pull request policy

Issues are open for bug reports and feature requests. Pull requests are used for maintainer changes and automated dependency updates; external pull requests are not accepted. See the [contribution policy](../CONTRIBUTING.md#contribution-policy).

Keep pull requests enabled and set **Settings → General → Features → Pull requests** to **Collaborators only**. This restricts external creation while retaining maintainer PRs. See [GitHub's repository settings documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/disabling-pull-requests). Dependabot can still create PRs with this restriction, as confirmed in [GitHub's feature announcement discussion](https://github.com/orgs/community/discussions/187038).

## CI and dependency updates

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `CI` | Pull requests, pushes to `main`, or manual dispatch | Install the lockfile, audit all vulnerability severities, run unit/package/browser tests and type checking, verify the release ZIP, and build the landing page |
| `Scheduled dependency audit` | Daily at 03:00 Japan time, or manual dispatch | Audit the existing dependency tree for newly disclosed vulnerabilities |
| `Dependabot auto-merge` | Dependabot pull request events | Enable auto-merge for eligible patch/minor updates after verifying metadata and branch protection |
| `Prepare release` | Manual dispatch on `main` | Validate unit/package/browser tests, verify and upload the exact extension ZIP |

Pull requests require **Checks** and **Dependency review**. The latter checks added or updated dependencies against GitHub's vulnerability database.

CI runs `npm run check`, which uses the same `check:release` script as Prepare release and then builds the landing page. Keep the shared validation sequence in `package.json`; the workflows handle environment setup and release artifact upload.

Dependabot checks npm dependencies daily and GitHub Actions weekly. Patch/minor npm updates are grouped separately for routine and security updates; major updates require manual review. Keep Dependabot alerts and security updates enabled.

Auto-merge is limited to non-draft Dependabot PRs from this repository into `main`, with verified signed commits and a highest update classification of patch or minor. A group containing a major update is not eligible. The workflow confirms branch protection and both required check names before enabling GitHub auto-merge.

The privileged `pull_request_target` workflow never checks out or runs PR code. Tests and builds run in the separate CI workflow with read-only permissions. Actions are pinned to commit SHAs and updated through Dependabot.

The daily audit is an alerting workflow, not a required PR check or an auto-merge gate. Its failure does not by itself disable auto-merge. Each PR's **Checks** job also runs `npm audit` and blocks merging when that check fails; an already successful check is not automatically rerun when a new advisory appears. Investigate daily audit failures and pause pending automatic merges when necessary. If no fix is available or a major update is required, assess the impact and document the response.

## Repository settings for forks

Adding workflow files does not configure GitHub repository settings. An administrator should:

1. Enable Dependabot alerts, security updates, and private vulnerability reporting.
2. Enable **Allow auto-merge**.
3. Protect `main`, require pull requests, add **Checks** and **Dependency review** as required checks, and enable **Require branches to be up to date**. This project's unattended dependency updates use zero required approvals; choose a different review policy if your team requires one.
4. Enable **Do not allow bypassing the above settings** if administrator changes must also pass through PR checks; otherwise administrators can bypass protection.
5. Allow Actions with read-only default workflow permissions. Automatic approval of PR reviews is not needed.
6. To retain this project's contribution policy, leave Issues open and restrict pull request creation to **Collaborators only**.

Run CI once to make its check names available in the settings UI. Removing branch protection causes the auto-merge workflow's precondition to fail.

## Manual dependency updates

```sh
npm outdated
npm install --save-dev --save-exact PACKAGE@VERSION
```

Run the [validation commands](../CONTRIBUTING.md#validate-changes) afterward. Read migration instructions for major updates and check affected behavior in a real browser. Do not ignore audit failures or apply overrides without checking compatibility.

Keep `@types/node` on the supported Node major. When changing Node support, update `.nvmrc`, `package.json`'s `engines`, and the Dependabot exclusion together.

### Current dependency workaround

`source-map-js` was updated to patched version `1.2.2` within its parents' declared ranges to address [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

Miniflare pins `sharp@0.35.4`, so `overrides.miniflare.sharp` in `package.json` selects patched version `0.35.5` for [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w). Remove this override when Miniflare adopts a patched version, update the lockfile, and verify the audit, builds, and Wrangler behavior.

## Release an extension version

1. Merge the release changes into `main` and confirm CI succeeds.
2. Update `package.json`'s version and run `npm install --package-lock-only --ignore-scripts`. Submit the version and lockfile change through a PR and CI.
3. Run `npm run zip` followed by `npm run package:verify` to create and check `.output/loginpilot-VERSION-chrome.zip`, or manually run **Prepare release** on `main` and download the **loginpilot-chrome** artifact. The artifact download is a wrapper ZIP; the extension ZIP is inside it.
4. Extract the extension ZIP, load it in a test Chrome profile, and complete the relevant [browser checks](browser-review.md). The automated ZIP validator checks permissions, content-script scopes, both locales, legal notices, and an allowlist that excludes development and credential artifacts. It follows local HTML, JavaScript module, and CSS references to check runtime assets, including split chunks, without assuming a fixed generated filename or asset count. Browser tests run against the build used for that ZIP.
5. Create a GitHub Release draft with a version tag pointing to the tested commit. Attach the extension ZIP and describe changes and known limitations, then review and publish it.
6. Upload to the Chrome Web Store manually. After review and publication, update installation links in both READMEs and the landing page. Update the landing page's release-status translations and social images as needed.

The release workflow validates and packages the extension. It does not publish a GitHub Release, upload to the Chrome Web Store, or deploy the landing page. Landing page deployment is covered in [deployment.md](deployment.md).
