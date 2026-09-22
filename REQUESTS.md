# 匿名要望受信（DiscordBot側）

## 動作

WebAppの `POST /api/requests` からDocker内部の `POST /internal/requests` を受け取り、運営用Discordサーバーの要望チャンネルに投稿する。投稿内容は `{ "content": "要望本文" }` の本文のみで、送信者情報・独自の見出し・時刻・リンクを追加しない。先頭末尾の空白・改行も保持し、`allowed_mentions: { parse: [] }` でメンション通知を無効化する。

Bearer認証を必須とする。非空の文字列で最大2000文字（JavaScript文字列長）のみ受理し、不正な入力は400、認証失敗は401、Discord接続不可は503、投稿失敗は502を返す。Discordへの投稿成功後のみ204を返す。本文をDB等に永続保存せず、本文やDiscord APIエラーオブジェクトをログに出さない。投稿回数の制限は実装しない。

## 設定

BotのGit管理外 `.env` に下記を設定する。

```dotenv
REQUEST_CHANNEL_ID=<運営サーバーの要望チャンネルID>
REQUEST_NOTIFY_SECRET=<WebAppと共通の32バイト以上の秘密値>
REQUEST_HTTP_PORT=3102
```

IDと秘密値の両方を設定した場合に受信口が有効になる。`NOTICE_NOTIFY_SECRET` とは異なる秘密値を設定する。既存のお知らせ通知が3101番を使用するため、ポートは重複させない。Botに対象チャンネルへのメッセージ投稿権限が必要。実際のチャンネルIDや秘密値はGitに保存しない。

両リポジトリのDocker Composeで `compose.notice.yaml` を適用し、共通の外部ネットワーク `xplay_notices` を使う。WebAppの `REQUEST_BOT_URL=http://xplay-notice-bot:3102` からのみ内部送信し、Botの受信HTTPポートはホストやInternetに公開しない。ソースまたは設定変更後はBotとWebApp両方のコンテナを再作成する。

## テスト

`test/requests.spec.ts` が受信認証、文字数、本文の厳密な保持、メンション無効化、Discord送信失敗を検証する。実際のDiscord投稿は本番のチャンネルID・秘密値を設定した上で別途確認が必要。
