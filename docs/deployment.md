# LPのデプロイ

Node.jsは`.nvmrc`のバージョンを使い、`npm ci`と`npm run lp:build`を実行します。静的ファイルは`.output/lp`に出力されます。

## 自分のCloudflareアカウントへ配備

```sh
npx wrangler login
npm run lp:deploy
```

共有の`sites/lp/wrangler.jsonc`はアカウントIDや独自ドメインを含まない設定です。このコマンドは、ログインしたアカウントの`loginpilot-lp` Workerを作成・更新し、`workers.dev`へ配備します。既存Workerと区別したい場合は設定の`name`を変更してください。複数アカウントを利用する場合は`CLOUDFLARE_ACCOUNT_ID`を環境変数で指定できます。

## 独自ドメインの本番配備

```sh
cp sites/lp/wrangler.production.example.jsonc sites/lp/wrangler.production.jsonc
```

コピーしたファイルの`account_id`と`routes[].pattern`を自分のCloudflareアカウントID・ドメインへ置き換えます。このファイルはGitの管理対象外です。必要に応じてWorkerの`name`も変更してください。

forkして独自ドメインで公開する場合は、`sites/lp/index.html`のcanonical・OGP URL・GitHubリンクと、`sites/lp/public/robots.txt`・`sitemap.xml`のURLも更新します。デプロイ先を変更するだけでは、これらのURLは自動で書き換わりません。

```sh
npm run lp:build
npx wrangler deploy --dry-run --config sites/lp/wrangler.production.jsonc
npm run lp:deploy:production
```

`--dry-run`はビルド・設定を確認し、公開しません。実際のデプロイ前にアカウント、Worker名、独自ドメインを確認してください。

CIで配備する場合は、必要なWorker・ドメインだけを変更できるCloudflare APIトークンを用意し、`CLOUDFLARE_API_TOKEN`をCIのsecret、`CLOUDFLARE_ACCOUNT_ID`を環境変数に設定します。トークンを設定ファイルやIssueへ書き込まないでください。認証方式と権限の詳細は[Cloudflare公式ドキュメント](https://developers.cloudflare.com/workers/wrangler/system-environment-variables/)を参照してください。

LPは`public/_headers`のCSPなどを配信します。公開後はページ、`404.html`、`robots.txt`、`sitemap.xml`、OGP画像、レスポンスヘッダーを確認してください。
