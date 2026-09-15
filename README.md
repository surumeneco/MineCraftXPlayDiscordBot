# MineCraftXPlayDiscordBot

`MineCraftXPlayServer` 周辺のDiscord連携を担当する独自Botです。
DiscordSRVで実現できるMinecraft ↔ Discord連携はDiscordSRV側を優先し、このリポジトリでは独自機能を実装します。

## 現在の実装範囲

現段階では後続機能の基盤となる最小Botのみを実装しています。

- TypeScript + `discord.js`
- Discord Gatewayへの接続
- 起動成功 / 起動失敗ログ
- `SIGINT` / `SIGTERM` によるgraceful shutdown
- Docker / Docker Composeによる開発・本番共通実行
- 必須環境変数の検証
- TypeScript型チェックと最小テスト

Minecraft情報照会、Minecraft操作、VPS操作、Webアプリ連携、自動検出・AIは未実装です。

## 必要環境

- Docker Engine または Docker Desktop
- Docker Compose

Node.jsをホストOSへ直接導入してBotを運用することは正式な手順としていません。

## 初期設定

`.env.example` を `.env` にコピーし、Discord Developer Portalで取得したBot Tokenを設定します。

```env
DISCORD_BOT_TOKEN=YOUR_BOT_TOKEN
```

`.env` はGit管理対象外です。

## 開発環境での起動

```bash
docker compose -f compose.yaml -f compose.dev.yaml up -d --build
```

ログ確認:

```bash
docker compose -f compose.yaml -f compose.dev.yaml logs -f bot
```

停止:

```bash
docker compose -f compose.yaml -f compose.dev.yaml stop bot
```

## 本番環境での起動

```bash
docker compose -f compose.yaml -f compose.prod.yaml up -d --build
```

本番overrideでは `restart: unless-stopped` を適用します。

## Secret不要部分の検証

Node.js 24.17.0以上24.x未満を使用する場合は、以下で確認できます。

```bash
npm ci
npm run verify
```

BotのDiscord接続確認には有効な `DISCORD_BOT_TOKEN` が必要です。

## DiscordSRVとの責務境界

Minecraft ↔ Discordチャット、Minecraftイベント通知、Minecraftコンソール連携、Discord ↔ Minecraftアカウントリンクなど、DiscordSRV標準機能として採用するものはDiscordSRV側で構成します。
独自Bot側には同じ中継機能を重複実装しません。
