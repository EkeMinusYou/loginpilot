# Contributing

不具合・機能提案は[Issue](https://github.com/EkeMinusYou/loginpilot/issues/new/choose)から受け付けます。脆弱性は[SECURITY.md](SECURITY.md)の非公開窓口を使ってください。

## 開発環境

Node.jsは`.nvmrc`のバージョンを使用します。`npm ci`でlockfileどおりにインストールし、`npm run dev`で拡張機能、`npm run lp:dev`でLPを開発します。WXTが生成する`.wxt`・`.output`と、Cloudflareの認証・本番設定はコミットしません。

## 変更の確認

```sh
npm test
npm run typecheck
npm run build
npm run lp:build
npm run audit
```

認証情報・フォーム検出・自動送信・メッセージ検証を変更する場合は、回帰を防ぐテストを追加し、[ブラウザ確認手順](docs/browser-review.md)の該当ケースを確認してください。実ブラウザで未確認の挙動はPRに明記してください。

PRは変更の目的、利用者に見える挙動、実施した検証を記載します。コードコメント、コミットメッセージ、PR説明は英語で書いてください。実際のID・パスワード、個人情報を含む画面キャプチャ、トークンを添付しないでください。依存関係の更新で`package.json`を変更した場合は、`package-lock.json`も更新します。

投稿する独自コード・デザインは本プロジェクトのMITライセンスで公開できるものにしてください。第三者の素材を追加する場合は出典とライセンスを[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)に追記し、必要な著作権表示を配布物にも含めてください。
