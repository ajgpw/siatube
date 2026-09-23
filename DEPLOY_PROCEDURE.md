## 前提

- Node.js 20 以上
- npm 11 以上
- Cloudflare Workers へ展開する場合は Wrangler が使えること
- Google Apps Script 版を更新する場合は、GAS の編集権限があること

## 1. 依存関係をインストールする

初回、または `package-lock.json` が更新された後に実行します。

```bash
npm install
```

ルートの `postinstall` により、`client/` 側の依存関係インストールとビルドも実行されます。

## 2. ローカルで開発確認する

フロントエンドだけを Vite で確認する場合:

```bash
npm run dev
```

## 3. 認証対応クライアントをビルドする

```bash
npm run build --prefix client
```

`client/dist/` と単一HTML配布用の `siatube-full.html.txt` を同時に更新します。
GASやダウンロード版には、この生成済みHTMLを配布してください。PoW WorkerもHTML内に含まれます。

認証プロキシの `ALLOWED_ORIGINS` には、実際にクライアントを開くページのorigin
（スキーム・ホスト・ポート）を登録してください。既定値は
`https://siatube-web.com,https://www.siatube-web.com` です。
別ドメインやローカル開発環境を使う場合は、そのoriginの追加が必要です。
`403 ORIGIN_REJECTED` はこのサーバー設定による拒否で、PoWの再試行では解消しません。
