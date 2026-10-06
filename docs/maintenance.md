# 依存関係の更新とリリース

## 自動検証・自動マージ

Dependabotはnpm依存関係を毎日、GitHub Actionsを毎週確認します。Dependabot alertsとsecurity updatesも有効にし、既知の脆弱性に修正版がある場合は更新PRを作成します。通常更新とセキュリティ更新のpatch/minorはそれぞれグループ化し、major更新は手動で確認します。

`@types/node`は実行環境のNode 24に合わせて24系を維持します。Nodeの対応バージョンを変更するときに、`.nvmrc`、`package.json`の`engines`、Dependabotの除外設定もまとめて更新してください。

PRでは、以下の必須チェックを実行します。

- `Checks`: `npm ci`、全severityの`npm audit`、単体テスト、型チェック、拡張機能とLPのビルド。
- `Dependency review`: PRに追加された依存関係に既知の脆弱性がないかをGitHubのデータベースで確認。

自動マージ対象は、同じリポジトリから`main`へ向けたDependabot作成PRで、署名済みコミットの検証とpatch/minor分類を通過したものです。major更新・他の作成者のPRは自動マージしません。グループにmajor更新が含まれる場合も自動マージしません。`main`の保護設定と必須チェックを確認したうえで、GitHubのauto-mergeを有効にします。

`pull_request_target`を使う自動マージワークフローでは、PRのコードをcheckout・実行しません。テストとビルドは、書き込み権限を持たない別のCIワークフローで実行します。

日次の`Scheduled dependency audit`も日本時間03:00に実行します。新しい脆弱性が見つかると監査が失敗し、自動マージも止まります。修正版が未公開の場合やmajor更新が必要な場合は、保守者が影響と対応方針を確認してください。

## fork・別リポジトリでの設定

ワークフローの追加だけではGitHubの設定は有効になりません。管理者権限で以下を設定してください。

1. Dependabot alerts、Dependabot security updates、private vulnerability reportingを有効にする。
2. リポジトリ設定の「Allow auto-merge」を有効にする。
3. `main`のbranch protectionで、PRからの変更を求め、必須チェックに`Checks`と`Dependency review`を設定し、「Require branches to be up to date」を有効にする。自動マージ用に必須レビュー数は0とする。
4. Actionsを許可する。ワークフローの既定権限はreadのままでよく、自動承認を許可する設定は不要。

必須チェックは一度CIを実行すると設定画面で選べます。branch protectionを解除すると、自動マージワークフローの事前確認が失敗します。

## 手動更新

```sh
npm outdated
npm install --save-dev --save-exact PACKAGE@VERSION
npm run audit
npm test
npm run typecheck
npm run build
npm run lp:build
```

major更新は移行手順を読み、実ブラウザでも影響を確認します。監査の失敗を無視したり、ライブラリの互換性を調べずにoverrideすることは避けてください。Actionsの参照はコミットSHAに固定し、Dependabotで更新します。

`source-map-js`は、依存元のバージョン範囲内で修正版`1.2.2`へ更新しています（[GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)）。Miniflareが`sharp@0.35.4`を固定しているため、`package.json`の`overrides.miniflare.sharp`で修正版`0.35.5`を指定しています（[GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)）。Miniflare側が修正版を採用したらoverrideを削除し、lockfileを更新して監査・ビルド・Wranglerの確認を行ってください。

## リリース

1. リリース対象の変更を`main`へマージし、CIの成功を確認する。
2. `package.json`のversionを更新し、`npm install --package-lock-only --ignore-scripts`でlockfileにも反映する。バージョン変更もPRとCIを通す。
3. `npm run zip`で`.output/loginpilot-VERSION-chrome.zip`を作る。またはActionsの`Prepare release`を`main`で手動実行し、`loginpilot-chrome` artifactから拡張機能ZIPを取得する。artifact自体のZIPと、その中の拡張機能ZIPを取り違えないこと。
4. ZIPを展開してテスト用Chromeへ読み込み、[ブラウザ確認](browser-review.md)を行う。
5. GitHub Releaseの下書きを作成し、バージョンに対応するタグ、変更内容、既知の制限、拡張機能ZIPを添付して確認後に公開する。
6. Chromeウェブストアへの配布は保守者が手動で行う。審査・公開後にLPとREADMEの導入リンクを更新する。

リリースワークフローは検証とZIPの作成だけを行い、GitHub ReleaseやChromeウェブストアへの公開、LPのデプロイは行いません。
