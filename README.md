# しあTube

Vue 3 / Vite で構築したクライアントアプリです。開発・テスト・ビルドはすべてリポジトリのルートで実行します。

## 開発

Node.js 20 以上と npm 11 以上を使用してください。

```sh
npm ci
npm run dev
```

```sh
npm test          # 回帰テスト
npm run build    # Web 配信用ファイルと単一 HTML を生成
npm run preview  # ビルド結果をローカルで確認
npm start        # ビルド結果を 0.0.0.0:8010 で確認
```

`preview` / `start` の前には `npm run build` を実行してください。Web 配信用ファイルは `dist/`、JavaScript・CSS・アイコンを埋め込んだ単一 HTML は `dist/siatube-full.html.txt` に生成されます。単一 HTML は拡張子を `.html` に変更して利用できます。生成物と `node_modules/` は Git の管理対象外です。

本番の静的ホスティングでは `dist/` を公開し、`/watch` などへの直接アクセスを `index.html` にフォールバックさせてください。

動画ページのアンビエントライトは初期状態でオンです。設定画面または動画の再生設定から切り替えられ、選択は次回も維持されます。タイプ２では再生中の映像をぼかして周囲に広げ、通常（タイプ１）ではサムネイルの色を使います。映像の更新は最大15fpsです。

## ファイル構成

```text
src/
  assets/         # 検索アイコン・favicon の元データ
  components/     # layout / player / video / channel / playlist / settings
  composables/    # Vue の状態管理とイベントのライフサイクル
  config/         # API 接続先などの共通設定
  router/         # ページのルーティング
  services/
    api/          # API 呼び出し・レスポンス変換・互換インターフェース
    guard/        # 通信の認証・セッション・Worker
    media/        # 画像圧縮
    network/      # プロキシ・通信方式
    storage/      # 設定・履歴・プレイリスト・チャンネル登録の保存
  styles/         # 共通 CSS と大きな画面のスタイル
  utils/          # 共通処理。player/ は再生・字幕・自動再生の処理
  vendor/         # ライセンス表記を含む同梱ライブラリ
  views/          # ルートに対応する画面
scripts/          # Vite 用プラグイン・単一 HTML 生成
test/             # Node.js 標準テストランナーの回帰テスト
server/           # 既存サーバーのソースをそのまま保存
```

<h2>連絡先・コミュニティ</h2>
<ul style="list-style: none; padding: 0;">
  <li>
    <img src="https://www.google.com/a/cpanel/images/favicon.ico" alt="メール" width="16" height="16" style="vertical-align: middle; margin-right: 4px;">
    siawaseok@siatube.com(返信は別アドレスから)
  </li>
  <li>
    <img src="https://www.line.me/static/img/apple-touch-icon-57x57.png" alt="LINE" width="16" height="16" style="vertical-align: middle; margin-right: 4px;">
    <a href="https://line.me/ti/g2/PT62G9W_N5WOkD7VECW3tftJlCn2KTJIVt6k7g" target="_blank">LINEオープンチャット</a>
  </li>
  <li>
    <img src="https://assets.chatwork.com/images/favicon/favicon00.ico" alt="Chatwork" width="16" height="16" style="vertical-align: middle; margin-right: 4px;">
    <a href="https://www.chatwork.com/g/siatube" target="_blank">Chatwork</a>
  </li>
</ul>
