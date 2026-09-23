# GAS対応 URLパラメータ認証 クライアント実装設計書

この文書は `anonymous-session-auth-proxy-design-no-ip-rate-limit.md` のクライアント仕様を、GAS互換のURLパラメータ認証へ置き換える後続設計である。両者が異なる場合はこの文書を優先する。

## 1. 目的と前提

SiaTubeクライアントから `https://siatube.com/api/*` を呼ぶ際、匿名セッションとProof of Work（PoW）を透過的に処理する。

通信は次のいずれかを通る。

1. ブラウザからSiaTube APIへの直接fetch
2. 設定済みURLプロキシを通すfetch
3. JSONP対応のGASプロキシ
4. GASの `UrlFetchApp.fetch()`

GAS中継ではCookie、任意request header、response headerを一貫して保持できない。そのため認証に必要な値はすべて最終的なSiaTube API URLのquery parameterへ入れる。認証状態はCookieやAuthorization headerに依存しない。

この設計では以下を保証する。

- 初回だけPoWを実行する
- 成功後30分間は同じセッションで再チャレンジしない
- セッションは24時間で失効する
- 同時API失敗を1回のchallengeへ集約する
- challenge retryは最大1回、元API retryも最大1回にする
- GASがresponse headerを捨ててもJSON bodyだけで認証要求を検出する
- 認証パラメータをアプリログやエラー情報へ残さない

## 2. サーバー契約

### 2.1 予約query parameter

| 名前 | 用途 | 送信先 |
|---|---|---|
| `guard_sid` | 43文字の匿名セッションID | challenge、verify、status、通常API |
| `challenge_id` | challengeを識別する22文字の値 | verifyのみ |
| `counter` | PoWを満たす非負の安全な整数 | verifyのみ |

クライアントは既存URLへ `URL.searchParams.set()` で追加する。文字列結合で `?` や `&` を組み立てない。通常APIに元から `guard_sid` が存在しても、保存済みの正しい値で上書きする。

### 2.2 Challenge取得

初回:

```http
GET https://siatube.com/api/__guard/challenge
```

既存セッションがある場合:

```http
GET https://siatube.com/api/__guard/challenge?guard_sid=<sessionId>
```

成功body:

```json
{
  "sessionId": "...",
  "challengeId": "...",
  "nonce": "...",
  "difficultyBits": 16,
  "expiresAt": 1790083060,
  "version": 1
}
```

`sessionId` はリクエストに付けた値と異なる場合がある。Redis上でセッションが失効していればサーバーが新しいIDを返すため、レスポンスの値を常に保存し直す。

### 2.3 Challenge検証

```http
GET https://siatube.com/api/__guard/verify
    ?guard_sid=<sessionId>
    &challenge_id=<challengeId>
    &counter=<counter>
```

実際には改行なしの1 URLとして送る。成功body:

```json
{
  "ok": true,
  "verifiedUntil": 1790086600,
  "sessionId": "..."
}
```

失敗body:

```json
{
  "code": "CHALLENGE_EXPIRED",
  "sessionId": "..."
}
```

### 2.4 通常API

```http
GET https://siatube.com/api/search?q=cat&guard_sid=<sessionId>
```

未認証または検証期限切れ:

```http
HTTP/1.1 403 Forbidden
X-Guard-Action: challenge
```

```json
{
  "code": "CHALLENGE_REQUIRED",
  "sessionId": "..."
}
```

直接fetchではstatus、header、bodyを利用できる。GAS/JSONP経由ではheaderを利用できない場合があるため、認証要求の最終判定は次の条件にする。

```js
status === 403 && payload?.code === "CHALLENGE_REQUIRED"
```

headerを取得できる経路では `X-Guard-Action: challenge` も確認材料にできるが、必須条件にしない。バックエンド自身の403は `code` が一致しない限りchallengeを開始しない。

### 2.5 Rate Limit

通常APIはセッションごとに10秒間10回、challenge取得とverifyはそれぞれ60秒間10回までである。

```json
{
  "code": "RATE_LIMITED",
  "sessionId": "...",
  "retryAfter": 7
}
```

GASでは `Retry-After` headerが失われるため、必ずbodyの `retryAfter` を優先する。429をchallenge要求として扱わない。自動再試行する場合も1回までとし、`retryAfter * 1000` に0〜250msのjitterを足して待つ。

## 3. クライアント構成

既存の `siatube-client/client/src` 配下へ次を追加する。

```text
src/guard/
├─ guard-session.js
├─ guarded-request.js
├─ challenge.js
├─ guard-worker.js
└─ hash.js
```

役割:

| ファイル | 責務 |
|---|---|
| `guard-session.js` | sessionIdと期限の保存、検証、更新、削除、URLへの付与 |
| `guarded-request.js` | 通常API送信、403検出、challenge後の1回再送 |
| `challenge.js` | challenge取得、Worker実行、verify、同時実行の集約 |
| `guard-worker.js` | UI thread外でcounterを探索 |
| `hash.js` | 同期SHA-256とleading-zero判定 |

既存の通信経路選択は `src/utils/requestProxy.js` に残す。`src/services/siatubeApi.js` の `performGet()` を、認証モジュールからも呼べる低水準transportとして分離する。

```text
API固有関数（search、video、channel等）
  -> guardedGetJson
     -> URLへguard_sidを付与
     -> 共通transport
        -> direct fetch / proxy fetch / JSONP
     -> CHALLENGE_REQUIREDならensureGuardChallenge
     -> guard_sidを付け直して1回だけ再送
```

challenge、verify、statusも必ず同じ共通transportを使う。challengeだけ直接fetchすると、GASが必要な利用環境で認証できない。

## 4. セッション保存

localStorage key:

```text
siatube.guard.session.v1
```

保存値:

```json
{
  "version": 1,
  "sessionId": "...",
  "expiresAt": 1790166400000,
  "verifiedUntil": 1790081800000
}
```

- `expiresAt` はsession受信時刻 + 24時間
- `verifiedUntil` はverify responseの秒値をミリ秒へ変換
- sessionIdは `/^[A-Za-z0-9_-]{43}$/` に一致する場合だけ利用
- JSON破損、version不一致、期限切れは削除
- サーバーから別の `sessionId` が返ったら即時置換
- localStorage例外時はメモリ内保存へfallback

`verifiedUntil` はUIや不要なstatus呼び出しを避けるための参考値であり、通常APIから `CHALLENGE_REQUIRED` が返ればサーバー判定を優先する。

URLへ付ける関数:

```js
export function withGuardSession(inputUrl, sessionId) {
  const url = new URL(inputUrl, location.origin);
  if (sessionId) url.searchParams.set("guard_sid", sessionId);
  else url.searchParams.delete("guard_sid");
  return url.toString();
}
```

エラーオブジェクト、console、分析イベントにはこの戻り値を保存しない。表示用URLが必要なら次で除去する。

```js
export function redactGuardUrl(inputUrl) {
  const url = new URL(inputUrl);
  url.searchParams.delete("guard_sid");
  url.searchParams.delete("challenge_id");
  url.searchParams.delete("counter");
  return url.toString();
}
```

## 5. 共通transport

直接fetch、proxy fetch、JSONPの返り値を次へ正規化する。

```ts
type GuardTransportResponse = {
  status: number;
  ok: boolean;
  payload: unknown;
  guardAction: string | null;
};
```

JSONP/GASでは `guardAction` は `null` でよい。transportはHTTPエラーをすぐthrowせず、まずbodyをJSONとして読み、statusとpayloadを呼び出し側へ返す。これにより403の `sessionId` と `code` をchallenge処理へ渡せる。

既存 `validatePayload()` はguard処理の後に呼ぶ。順序は以下とする。

1. transportでstatusとJSONを取得
2. bodyに有効な `sessionId` があれば保存
3. `CHALLENGE_REQUIRED` を判定
4. 必要ならchallengeと元API再送
5. 最終レスポンスに対して `validatePayload()`

GASの `siatubeApiGet(pathAndQuery)` は受け取ったpath/queryを変更せずSiaTubeへ送る。長いURL用bridgeも `guard_sid` を含むquery全体を保持する。GASコードでtarget URLをログ出力しない。

## 6. guarded request

概略実装:

```js
export async function guardedRequest(url, options = {}) {
  const requestTemplate = createReplayableRequest(url, options);
  let response = await sendWithCurrentSession(requestTemplate);

  if (!isChallengeRequired(response)) return response;

  acceptReturnedSession(response.payload);
  await ensureGuardChallenge({ signal: options.signal });
  response = await sendWithCurrentSession(requestTemplate);
  return response;
}
```

要件:

- 元APIのchallenge後再送は1回だけ
- 2回目も `CHALLENGE_REQUIRED` ならそのresponseを返し、ループしない
- GETでは同じURL/queryを再構築する
- body付きrequestは最初に `Request` を作り、各送信に `request.clone()` を使う
- `ReadableStream` bodyは自動再送不可として明示的にエラーにする
- AbortSignalはchallengeと再送の全工程へ伝播する
- 401/403でも `code !== CHALLENGE_REQUIRED` ならバックエンドエラーとして扱う

現在の主要SiaTube APIはGETなので、最初に `getJson()` を `guardedGetJson()` 化する。字幕などSiaTube API以外の外部URLへは `guard_sid` を付けない。対象判定はoriginが `https://siatube.com` で、pathが `/api/` から始まる場合だけとする。

## 7. Challenge処理

同一ページ内では1つのPromiseへ集約する。

```js
let challengePromise = null;

export function ensureGuardChallenge(options) {
  if (challengePromise) return challengePromise;
  challengePromise = runChallenge(options).finally(() => {
    challengePromise = null;
  });
  return challengePromise;
}
```

`runChallenge()`:

1. 現在のsessionId付きでchallenge GET
2. responseのsessionIdを必ず保存
3. response shape、version、expiresAtを検証
4. Web Workerへ `nonce`、`difficultyBits`、`version`、deadlineを送る
5. Workerからcounterを受け取る
6. sessionId、challengeId、counterをqueryへ入れてverify GET
7. 成功時にsessionIdとverifiedUntilを保存
8. `CHALLENGE_EXPIRED` の場合だけ1へ戻り、最大1回再試行
9. `INVALID_CHALLENGE`、`RATE_LIMITED`、abort、network errorはそのまま失敗

challenge取得からverifyまでにsessionIdが変わった場合、必ずchallenge responseで返った新しいsessionIdをverifyへ使う。

### 複数タブ

同一originの複数タブで余分なPoWを避けるため、利用可能ならWeb Locks APIを使う。

```js
navigator.locks.request("siatube-guard-challenge-v1", async () => {
  const status = await fetchGuardStatus();
  if (!status.verified) await runChallengeWithoutLock();
});
```

Web Locksがない環境ではページ内Promise集約だけで動作させる。`storage` eventまたは `BroadcastChannel("siatube-guard-v1")` で別タブのsession更新を反映する。ロック取得後にstatusを再確認し、先行タブが検証済みにしていればPoWを省略する。

## 8. Web WorkerとPoW

Worker入力:

```js
{
  nonce,
  difficultyBits,
  version,
  expiresAt,
  requestId
}
```

計算対象:

```text
v1:<nonce>:<counter>
```

SHA-256 digestの先頭 `difficultyBits` bitがすべて0なら成功する。counterは0から `Number.MAX_SAFE_INTEGER` まで増加させる。`crypto.subtle.digest()` を各ループでawaitせず、Worker内の同期SHA-256実装または `@noble/hashes/sha256` を使う。

Workerは少なくとも4096回ごとに現在時刻を確認し、`expiresAt` の2秒前を越えたら `{ code: "LOCAL_CHALLENGE_EXPIRED" }` を返す。Abort時はWorkerへcancelを送り、応答を待たずterminateする。完了・失敗・abortの全経路でevent listenerとWorkerを破棄する。

## 9. GAS・JSONP固有の扱い

対象API URL:

```text
https://siatube.com/api/search?q=cat&guard_sid=ABC
```

GAS proxy URL:

```text
https://script.google.com/macros/s/.../exec?url=https%3A%2F%2Fsiatube.com%2Fapi%2Fsearch%3Fq%3Dcat%26guard_sid%3DABC
```

これは正しい二重構造である。`guard_sid` は外側のGAS queryではなく、必ずencodeされた内側のtarget URLに含める。

JSONPではさらに `callback` が外側へ付く。callback名をSiaTube API URLへ混ぜない。script elementは完了後に削除し、既存 `requestProxyJsonp()` のabort tombstone処理を維持する。

GASがHTTP statusを200へ変換する実装では、envelopeへ元statusを必ず含める。

```json
{
  "ok": false,
  "status": 403,
  "data": {
    "code": "CHALLENGE_REQUIRED",
    "sessionId": "..."
  }
}
```

直接payloadだけをJSONP callbackへ渡す方式は元statusを失うため、guard導入後は上記envelopeへ統一する。移行互換が必要な期間は、payloadの `code === "CHALLENGE_REQUIRED"` をstatus 403相当として正規化する。

## 10. エラー処理

| code | クライアント動作 |
|---|---|
| `CHALLENGE_REQUIRED` | sessionIdを保存し、challengeを1回実行後、元APIを1回再送 |
| `CHALLENGE_EXPIRED` | challenge一式を最大1回だけ再実行 |
| `INVALID_CHALLENGE` | 再試行せず認証エラー表示 |
| `RATE_LIMITED` | challengeを開始せず、必要ならretryAfter後に最大1回再送 |
| `ORIGIN_REJECTED` | 設定不備として再試行しない |
| `INTERNAL_GUARD_ERROR` | 一時障害として通常のnetwork retry方針を適用 |

元API、challenge、既存 `getJson()` の各retryが掛け算にならないよう、認証層が動作している間は下位transportのretryを0にする。1回の利用者操作で許可する最大通信数を明示する。

```text
元API 1回
challenge取得 最大2回
verify 最大2回
元API再送 1回
```

429 retryを別途許可する場合でも、同じ段階につき最大1回とする。

## 11. UI

PoWが250ms以内に終わる場合は表示を出さない。250msを超えたら非モーダル表示で「接続を確認しています…」を出す。入力や画面遷移を妨げない。

- 成功時は即座に消す
- abort時も必ず消す
- 429では「アクセスが集中しています。N秒後に再試行してください」
- challenge失敗では通常APIの一般エラーと区別できるメッセージを出す
- sessionId、challengeId、counterを画面やconsoleへ表示しない

## 12. セキュリティ要件

- API、GAS、URL proxyの全区間をHTTPSにする
- sessionIdをBearer credentialとして扱う
- `location.href`、router、履歴、リンクhrefへ認証付きAPI URLを入れない
- `console.log(error)` に認証付きURLが含まれないよう、error作成前にredactする
- Sentry等のquery string収集を無効化または `guard_sid` 等を削除する
- Service Worker Cache APIへ認証付きrequest/responseを保存しない
- challenge responseと認証エラーresponseをHTTP cacheへ保存しない
- GASで `Logger.log(targetUrl)` を使わない
- 信頼できない汎用proxyへ認証付きURLを渡さない
- sessionIdをDOM、data attribute、HTMLへ埋め込まない
- XSS対策としてCSPを維持し、localStorageから読んだ値をHTMLへ出力しない

URLパラメータ方式ではブラウザDevTools、GAS実行基盤、中継proxyからsessionIdが見える。この露出は方式上なくせない。24時間のsession TTL、30分のverified TTL、ログ除外、HTTPSで影響範囲を限定する。

## 13. テスト

### Unit test

- session保存値の正常・破損・期限切れ
- URLへ既存queryを壊さず `guard_sid` を追加・上書き
- redact後のURLに3つの予約parameterが残らない
- `403 + CHALLENGE_REQUIRED` だけを認証要求として判定
- backend由来の403でchallengeしない
- 429のbody `retryAfter` を利用
- Worker leading-zero判定（8の倍数と端数bit）
- abort、deadline、Worker cleanup

### Integration test

- sessionなし → challenge → verify → 元API再送成功
- 同時10 APIが403でもPoWは1回
- challenge成功後30分以内はchallengeなし
- sessionがRedisから消えた場合、新sessionIdへ自動更新
- expired challengeは1回だけ再取得
- verify replay拒否
- GAS fetch、長URLbridge、JSONPの各transportで同じフロー
- GASがheaderを捨ててもbody codeで動作
- APIの元queryとcontinuation tokenを保持
- `guard_sid` がSiaTubeバックエンドへ届かない
- 11回目の通常APIで429を処理
- ログ、error、analytics payloadにsessionIdがない

### Browser E2E

- Chrome、Firefox、Safariの通常タブ
- private browsing/localStorage制限時のメモリfallback
- 低速端末でもUI threadが固まらない
- 複数タブ同時アクセス
- ページ遷移中のabort
- proxy fetchとJSONP設定の切替

## 14. 実装順序

1. responseをthrow前に正規化できる共通transportを抽出
2. `guard-session.js` とURL redactionを実装
3. hash、Worker、Worker unit testを実装
4. challenge/verifyフローとPromise集約を実装
5. `guarded-request.js` を実装
6. `getJson()` の送信部分をguarded requestへ置換
7. GAS/JSONP envelopeで元statusとpayloadを保持
8. 複数タブ同期を追加
9. unit、integration、browser E2Eを実行
10. サーバーとクライアントを同時にリリース

サーバーを先に有効化すると旧クライアントは全APIで403になる。クライアントを先に配布し、サーバー側でguardをまだ経由しない状態でも通常APIが動くことを確認した後、Nginxの `/api/*` をAuth Proxyへ切り替える。

## 15. 完了条件

- CookieなしでGAS経由の認証が完了する
- 認証値はすべて最終API URLのquery parameterだけで運ばれる
- 1回成功後30分はPoWを再実行しない
- sessionは24時間で更新される
- 全transportで403、429、expiredを同じように処理する
- 同一ページの同時challengeは1回、複数タブでも原則1回
- retryに上限があり無限ループしない
- 認証parameterがバックエンド、ログ、エラー監視へ流れない
- 既存APIのpath、query、responseを壊さない
- サーバーとクライアントの統合テストが成功する


プロキシ側MD
# SiaTube Auth Proxy
​
`/api/*` の前段で、URLパラメータによる匿名セッション、SHA-256 Proof of Work、セッション単位のレート制限を適用する Fastify サービスです。GAS、JSONP、単純なGET中継でも認証状態を運べるよう、CookieやAuthorization headerには依存しません。
​
## セットアップ
​
Node.js 24 と Redis を用意し、次の手順で起動します。
​
```bash
cp .env.example .env
npm ci
npm test
npm start
```
​
既定では `127.0.0.1:4000` だけで待ち受け、`http://127.0.0.1:3000` へ転送します。`.env` はコミットしません。`ALLOWED_ORIGINS` はカンマ区切りで、既定値はWebフロントの `https://siatube-web.com,https://www.siatube-web.com` です。GASの `UrlFetchApp` のようにOriginを送らないサーバー間通信も許可します。
​
匿名セッションは24時間有効です。PoW challengeに成功した状態は30分間維持され、その間の通常APIリクエストでは再チャレンジを要求しません。通常APIは匿名セッションごとに10秒間10回までです。上限を超えると `429 RATE_LIMITED`、JSONの `retryAfter`、可能な経路では同じ値の `Retry-After` headerを返します。
​
## URL認証API
​
初回はセッションパラメータなしでchallengeを取得します。
​
```http
GET /api/__guard/challenge
```
​
レスポンスの `sessionId` を保存し、以降は `guard_sid` として付与します。
​
```json
{
  "sessionId": "43文字のbase64url値",
  "challengeId": "22文字のbase64url値",
  "nonce": "22文字のbase64url値",
  "difficultyBits": 16,
  "expiresAt": 1790083060,
  "version": 1
}
```
​
PoWの入力は `v1:<nonce>:<counter>` です。SHA-256 digestの先頭 `difficultyBits` bitが0になる非負の安全な整数counterを送ります。検証もGASで中継できるGETです。
​
```http
GET /api/__guard/verify?guard_sid=<sessionId>&challenge_id=<challengeId>&counter=<counter>
```
​
成功したchallengeはRedis上で原子的に削除され、再利用できません。通常APIにも同じセッションIDを付けます。
​
```http
GET /api/search?q=cat&guard_sid=<sessionId>
```
​
`guard_sid` は認証プロキシがバックエンド転送前に必ず削除します。未認証または30分の検証期限切れでは、次を返します。GASがresponse headerを保持しない場合は、JSONの `code` だけで判定できます。
​
```http
HTTP/1.1 403 Forbidden
X-Guard-Action: challenge
```
​
```json
{
  "code": "CHALLENGE_REQUIRED",
  "sessionId": "..."
}
```
​
`GET /api/__guard/status?guard_sid=<sessionId>` は `sessionId`、`verified`、`verifiedUntil` を返します。存在しない、期限切れ、または不正な `guard_sid` には新しいセッションを発行し、そのIDをJSONで返します。
​
## URLにセッションを載せる際の運用条件
​
`guard_sid` は匿名セッションのBearer credentialです。TLSを必須とし、クエリ文字列をアクセスログ、分析基盤、エラー報告、consoleへ記録しないでください。[nginx/siatube.com.conf](nginx/siatube.com.conf) は `$request_uri` や `$request` の代わりに `$uri` だけを記録する `guard_no_query` log formatを定義しています。API responseは `Cache-Control: no-store` です。
​
GAS側でも対象URL全体をログに出さず、例外メッセージにはoriginとpathだけを使います。外部の汎用URLプロキシへ認証付きURLを渡す場合、その運営者はセッションIDを読み取れるため、信頼できる中継だけを使用してください。
​
## Nginxと既存API
​
既存APIはポート8001〜8007に分かれています。[nginx/siatube.com.conf](nginx/siatube.com.conf) の内部ルーターをNginxの `http` contextに追加し、コメント内の `location ^~ /api/` を既存TLS serverに追加してください。既存の完全一致 `/api` locationはprefix locationより優先されるため、削除するか認証プロキシ向けに変更します。
​
YouTube EducationのAPI keyは、リポジトリ外の `/etc/nginx/snippets/youtube-education-api-key.conf` に `proxy_set_header X-API-Key "...";` として置きます。外向けリクエストは4000、内部転送はlocalhostの3000を通ります。認証プロキシ、内部ルーター、Redis、既存APIは外部インターフェースへ公開しません。
​
PM2では次のように登録できます。
​
```bash
pm2 start ecosystem.config.cjs
pm2 save
```