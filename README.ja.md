# Login Pilot

[English](README.md) · [紹介サイト](https://loginpilot.ekeminusyou.com/ja/) · [ユーザーガイド（英語）](docs/usage.md)

Googleパスワードマネージャーによる自動入力後のフォーム送信と、パスキーのログインボタンの押下を、登録済みサイトで自動化するChrome拡張機能です。

- 自動ログインするサイトを自分で確認して登録できます。
- 次回からは、登録したパスワード・パスキーのログイン処理を自動で開始します。
- パスキーの本人確認とアカウント選択はChromeやOSで行います。
- ポップアップと通知は日本語・英語に対応しています。

Chromeウェブストアでの公開は準備中です。現在はソースからビルドして利用できます。

## ソースからインストール

[.nvmrc](.nvmrc)に指定したNode.jsとnpmを使用します。nvmを利用している場合は、clone後に`nvm install && nvm use`を実行してください。

```sh
git clone https://github.com/EkeMinusYou/loginpilot.git
cd loginpilot
npm ci
npm run build
```

Chromeで`chrome://extensions`を開き、「デベロッパーモード」を有効にします。「パッケージ化されていない拡張機能を読み込む」から`.output/chrome-mv3`を選びます。

## 使い方

1. Googleパスワードマネージャーにログイン情報を保存したサイト、またはパスキーのログインボタンがあるページを開きます。
2. Login Pilotのポップアップで登録候補のサイトとログイン方式を確認し、「登録して自動ログイン」を押します。
3. Chromeの確認が表示されたら承認します。次回からは登録した方式のログイン処理を自動で開始します。

候補が表示されない場合も、ポップアップから現在のサイトを手動で登録できます。自動ログインを停止する場合は、登録済みサイトの一覧から「解除」を押してください。方式を変更する場合は、解除して登録し直します。

ポップアップ下部の言語メニューで、自動（Chromeの表示言語）・日本語・英語を選べます。操作の詳細やトラブルの確認方法は[ユーザーガイド（英語）](docs/usage.md)にまとめています。

## プライバシーと制限

ID・パスワードはページ内で入力・送信のために一時的に扱います。拡張機能のストレージやバックグラウンド、開発者のサーバーには保存・送信しません。サイトの登録情報と表示言語は`chrome.storage.local`に保存します。詳しくは[プライバシー説明](docs/privacy.md)をご覧ください。

パスワードは通常のユーザー名・パスワードを持つフォーム、パスキーは明示的なログインボタンが1つある画面が対象です。二段階認証・CAPTCHAなどの追加操作と、パスキーの本人確認は利用者が行います。ログインを試みたことは成功を保証しません。[対応条件と制限（英語）](docs/usage.md#supported-conditions-and-limitations)も確認してください。

## 開発

WXT、TypeScript、Manifest V3、Vite、Tailwind CSSを使用しています。

```sh
npm ci
npm run dev
```

生成された拡張機能を、上記と同じ手順でChromeに読み込みます。検証コマンド、構成、多言語対応、デザイン素材については[開発ガイド（英語）](docs/development.md)を参照してください。開発者向けドキュメントは英語で管理しています。

## ドキュメントと問い合わせ

| 内容 | ドキュメント |
| --- | --- |
| 操作・トラブルの確認 | [ユーザーガイド](docs/usage.md) |
| 開発・検証・デザイン素材 | [Development](docs/development.md) |
| 依存更新・CI・リリース | [Maintenance](docs/maintenance.md) |
| ブラウザでの動作確認 | [Browser review](docs/browser-review.md) |
| LPのデプロイ | [Deployment](docs/deployment.md) |
| 脆弱性の報告 | [Security policy](SECURITY.md) |

開発を支援いただける場合は、[Buy Me a Coffee](https://buymeacoffee.com/euonymuslke)をご利用ください。

## プロジェクトの方針

不具合・機能提案は[GitHub Issues](https://github.com/EkeMinusYou/loginpilot/issues/new/choose)から受け付けます。外部からのPRは受け付けません。保守者自身の変更と依存関係の自動更新にはPRを使用します。脆弱性は[Security policy](SECURITY.md)の非公開窓口へ報告してください。

## ライセンス

独自のコード、Pilotのブランドアイコン、デザインは[MIT License](LICENSE)で公開しています。第三者のコード・アイコン・フォントの利用条件は[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)を参照してください。

`package.json`の`private: true`はnpmへの誤公開を防ぐ設定です。
