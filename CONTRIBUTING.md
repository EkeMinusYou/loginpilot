# Contributing

Report bugs and propose features through [GitHub Issues](https://github.com/EkeMinusYou/loginpilot/issues/new/choose). Use the private reporting channel in [SECURITY.md](SECURITY.md) for vulnerabilities.

## Contribution policy

Bug reports and feature requests are welcome. External pull requests are not accepted; please use Issues to describe problems or proposals instead.

Maintainers use pull requests for their own changes and accept automated dependency update PRs from Dependabot. The development and PR instructions below document that maintenance workflow and support local builds.

## Development setup

Use the Node.js version in [.nvmrc](.nvmrc). With nvm:

```sh
nvm install
nvm use
npm ci
npm run dev
```

Load `.output/chrome-mv3` as an unpacked extension from `chrome://extensions`. After an extension change, reload both the extension and the login page.

For the landing page:

```sh
npm run lp:dev
```

The development server runs at `http://127.0.0.1:4173`. Build with `npm run lp:build` and preview with `npm run lp:preview`. Deployment is covered in [docs/deployment.md](docs/deployment.md).

## Project structure

| Path | Purpose |
| --- | --- |
| `src/entrypoints/` | Background worker, content scripts, and popup |
| `src/shared/` | Form detection, authentication flows, storage, message validation, and extension translations |
| `sites/lp/` | Landing page, localization, privacy page rendering, and Cloudflare configuration |
| `public/` | Extension icons and Chrome locale messages |
| `tests/browser/` and `playwright.config.ts` | Isolated Chromium extension integration tests |
| `tests/fixtures/` and `scripts/browser-fixture.mjs` | Manual browser test fixtures |
| `scripts/verify-package.py` and `scripts/tests/` | Release ZIP validation and validator tests |
| `docs/` | Usage, maintenance, deployment, browser checks, and privacy policies |
| `lp.pen` and `popup-redesign.pen` | Pencil design sources |

Do not commit generated `.wxt`, `.output`, or `.wrangler` directories, credentials, or the local Cloudflare production configuration. See [.gitignore](.gitignore).

## Validate changes

Run the same checks used by CI:

```sh
npx playwright install chromium
npm run check
```

`npm run check` runs the shared release checks and builds the landing page. `npm run check:release` runs the dependency audit, unit and package tests, type checking, ZIP build and verification, and browser tests. CI and Prepare release use these scripts; individual commands remain available for focused checks.

Python 3 is required for package checks. On Linux, use `npx playwright install --with-deps chromium` to install browser system dependencies. Integration tests load the production extension in a temporary profile, use localhost fixtures and virtual WebAuthn, and delete the profile afterward. Failure traces are saved under ignored `test-results/`. They never use your normal browser profile or saved accounts.

Changes to credential handling, form detection, automatic submission, or message validation need regression tests and the relevant checks in [docs/browser-review.md](docs/browser-review.md). State browser behavior that you have not verified in the PR. For documentation-only changes, check links and the accuracy of referenced commands; changes to privacy documents also need the landing page localization tests and build because those documents are published on the website.

Keep `package-lock.json` in sync when changing dependencies. Dependency updates and release packaging are covered in [docs/maintenance.md](docs/maintenance.md).

## Localization and documentation

Developer documentation is maintained in English. Keep [README.md](README.md) and [README.ja.md](README.ja.md) aligned for installation, core behavior, and release availability. Put detailed usage in [docs/usage.md](docs/usage.md) instead of expanding both READMEs.

The Japanese and English privacy policies in `docs/privacy.md` and `docs/privacy.en.md` are also the source for the website's privacy pages. Keep their disclosures equivalent and their filenames stable.

Extension UI strings are in `src/shared/i18n.ts`; Chrome metadata is in `public/_locales/`. Runtime failures carry typed error codes from `src/shared/messages.ts`, and popup feedback stores translation keys so changing languages also updates existing feedback. Translate at the UI boundary rather than sending translated prose between scripts.

Landing page English translations are in `sites/lp/locales/en.ts`, keyed by the stable `data-i18n` attributes in the Japanese template `sites/lp/index.html`. Use `data-i18n-aria-label` for accessible labels. Keep keys when editing Japanese copy, and update the corresponding English copy when its meaning changes. Mark only text elements, preserving links, icons, and line breaks outside them. Missing keys or unmarked Japanese copy fail the English build. The website serves `/ja/` and `/en/`; its root redirects according to the saved preference or browser language. Website and extension language preferences are independent.

### Privacy Markdown format

The privacy renderer intentionally supports a small subset: one `#` title, `##` headings, paragraphs, numbered lists starting at 1 with one line per item, and pipe tables with outer pipes and a `---` separator for each column. Separate blocks with blank lines. Inline code and links to HTTPS URLs or repository files starting with `../` are supported.

Emphasis, unordered or nested lists, code blocks, HTML, images, hard line breaks, Markdown escapes, aligned tables, and pipes inside table cells are unsupported. The build rejects these instead of silently publishing incorrect formatting. If the documents need a wider syntax, replace the limited renderer with a standard parser rather than adding more ad hoc transformations.

## Design assets

Open `lp.pen` or `popup-redesign.pen` in Pencil to review the design sources. [Popup design notes](design/popup-redesign-notes.md) describe the interaction principles; the current implementation determines exact copy and dimensions.

The Pilot brand icon source is `public/icon.svg`. After editing it, regenerate and commit the PNG sizes used by Chrome:

```sh
npm run icons:generate
```

Landing page social images are generated by `node scripts/generate-lp-social.mjs`. The script loads system fonts, so review both language variants after generating them and commit the resulting images.

## Maintainer pull requests

Describe the problem, resulting behavior, and validation actually performed. Use English for code comments, commit messages, and PR descriptions.

Remove real credentials, tokens, private URLs, and screenshots containing personal information from reports and examples. Use dummy accounts when reproducing login behavior.

Original code and designs added to the project must be compatible with its MIT license. When adding third-party material, record its source and license in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and retain any required attribution in distributed files.
