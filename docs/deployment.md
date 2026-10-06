# Landing page deployment

Use the Node.js version in [.nvmrc](../.nvmrc) and run commands from the repository root:

```sh
npm ci
npm run lp:build
```

Static files are written to `.output/lp`. For local development and preview, see [development.md](development.md#development-setup).

## Deploy to your Cloudflare account

```sh
npx wrangler login
npm run lp:deploy
```

The shared `sites/lp/wrangler.jsonc` contains no account ID or custom domain. The command creates or updates the `loginpilot-lp` Worker in the account you sign in to and deploys to `workers.dev`. Change its `name` if you need a separate Worker. With multiple accounts, you can select one using `CLOUDFLARE_ACCOUNT_ID`.

## Deploy to a custom domain

Copy the example configuration:

```sh
cp sites/lp/wrangler.production.example.jsonc sites/lp/wrangler.production.jsonc
```

Replace `account_id` and `routes[].pattern` with your Cloudflare account ID and domain. Adjust the Worker `name` if needed. The local production configuration is ignored by Git.

For a fork deployed to another domain, update the canonical and social URLs, GitHub and support links in `sites/lp/index.html`, the URLs in `sites/lp/public/robots.txt` and `sitemap.xml`, and domain references in `sites/lp/localize.ts`, `privacy.ts`, and `scripts/generate-lp-social.mjs`. Regenerate social images if needed. Changing the deployment target does not rewrite site metadata.

```sh
npm run lp:build
npx wrangler deploy --dry-run --config sites/lp/wrangler.production.jsonc
npm run lp:deploy:production
```

The dry run checks the build and configuration without publishing. Confirm the account, Worker name, and custom domain before the actual deployment.

## CI authentication

The repository's current workflows do not deploy the landing page. If you add deployment automation, use a Cloudflare API token scoped to the required Worker and domain, store `CLOUDFLARE_API_TOKEN` as a CI secret, and set `CLOUDFLARE_ACCOUNT_ID` as an environment variable. Do not put tokens in configuration files or issues.

See [Cloudflare's environment variable documentation](https://developers.cloudflare.com/workers/wrangler/system-environment-variables/) for authentication options.

## After deployment

Check both language versions and privacy pages, `404.html`, `robots.txt`, `sitemap.xml`, and social images. Confirm the response headers from `sites/lp/public/_headers`, including the Content Security Policy.

The privacy pages are built from `docs/privacy.md` and `docs/privacy.en.md`; keep both disclosures equivalent when changing them.
