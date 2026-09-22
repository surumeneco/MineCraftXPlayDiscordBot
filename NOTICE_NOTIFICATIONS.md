# お知らせのDiscord通知（DiscordBot側）

## 機能

WebAppの記事公開・再公開、公開中本文の変更を、参加者向けお知らせ専用チャンネルへ送信する。通知先はBotの環境変数 `NOTICE_CHANNEL_ID` で指定する。送信先にメッセージ投稿権限が必要。

認証付き `POST /internal/notices` で次のJSONを受け付ける。

```json
{"event_id":"<記事UUID>:<変更後のversion>:publish","kind":"publish","title":"お知らせ","tags":["案内"],"url":"https://example.invalid/info/notice/..."}
```

`kind` は `publish` または `update`。公開・更新のどちらでもタグ配列を通知文面に使用する。認証ヘッダーは `Authorization: Bearer <NOTICE_NOTIFY_SECRET>`。Discord送信確認後のみHTTP 204を返す。認証失敗401、入力不正400、Bot接続不可503、Discord送信失敗502。本文のメンション解析を無効化し、同一イベントのDiscord nonceを固定して短期間の重複を抑える。

通知文面は次の形式とし、タグ名は半角空白で連結する。

- 公開・再公開: `新しいお知らせが投稿されました: <タイトル> 🏷️<タグ名を半角空白区切り>`
- 公開中本文の更新: `お知らせの内容が更新されました: <タイトル> 🏷️<タグ名を半角空白区切り>`

各メッセージの次の行に記事URLを付ける。

## 環境変数

```dotenv
DISCORD_BOT_TOKEN=<既存Botトークン>
NOTICE_CHANNEL_ID=<参加者向けお知らせチャンネルID>
NOTICE_NOTIFY_SECRET=<WebAppと共通の32バイト以上の秘密値>
NOTICE_HTTP_PORT=3101
```

`NOTICE_CHANNEL_ID` と `NOTICE_NOTIFY_SECRET` を両方設定した場合にのみ受信口が有効になる。不正な設定では起動失敗。秘密値はGit管理しない。

## 同一VPS上のDocker Compose構成

両アプリと共通の外部ネットワークを `docker network create xplay_notices` で一度作成し、本リポジトリで `docker compose -f compose.yaml -f compose.notice.yaml up -d --build` を実行する。Botはネットワーク上で `xplay-notice-bot:3101` としてWebAppからアクセスできる。HTTPポートはホストにpublishしない。WebApp側も同名のオーバーレイを適用する。

詳細な送信条件・DBロールバック・注意点はWebAppリポジトリの [`NOTICE_NOTIFICATIONS.md`](https://github.com/surumeneco/MineCraftXPlayWebApp/blob/develop/NOTICE_NOTIFICATIONS.md) を参照。CIには認証・HTTP・整形・nonce・ビルドのテストを用意するが、本番Discordへの投稿確認は別途必要。
