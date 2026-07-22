# loginpilot

Googleパスワードマネージャーによるログインフォームの自動入力を検知し、登録済みサイトでログインフォームを自動送信するChrome拡張機能です。

## 使用技術

- WXT 0.20
- TypeScript
- Chrome Extensions Manifest V3
- Tailwind CSS 4
- Vite

## 開発

```sh
npm install
npm run dev
```

生成された`.output/chrome-mv3`をChromeの「パッケージ化されていない拡張機能を読み込む」から読み込んでください。

## 検証

```sh
npm test
npm run typecheck
npm run build
```

## 動作仕様

- IDやパスワードは拡張機能へ保存・送信しません。
- 登録済みoriginでのみ自動送信します。
- 未登録サイトでは自動送信せず、Chrome通知と拡張機能ポップアップから登録を確認します。登録後は現在のページで再評価し、次回以降も自動ログインします。
- Chromeには入力元を完全に識別する公開APIがないため、自動入力状態の検知はフォームの値、入力イベント、autofill擬似クラスを組み合わせて行います。
