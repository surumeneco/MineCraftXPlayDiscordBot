# MineCraftXPlayDiscordBot

`MineCraftXPlayServer` の周辺連携を担う独自 DiscordBot です。標準の Minecraft ↔ Discord チャット・状態通知などは Minecraft 側の DiscordSRV を優先し、このリポジトリでは独自機能を実装します。

現在の実装は **Discord Gateway へ接続する最小 Bot**（設定検証、接続・終了ログ、正常停止処理）です。Minecraft 操作・VPS 操作・Web アプリ連携・自動検出などの将来機能は、現段階では利用できません。Bot 自身の HTTP API やローカル確認用 Web ページもありません。

## VSCode で開いた直後

本リポジトリのフォルダーを VSCode で開き、**[ターミナル] → [新しいターミナル]** を選びます。ローカルは Windows 11 の PowerShell、VPS は Ubuntu のシェルを想定します。コマンドは特記がなければリポジトリのルートで実行してください。

Bot 本体とテスト基盤を統合した `develop` が作業対象です。先にブランチと変更状況を確認します。

```powershell
git fetch origin --prune
git switch develop
git pull --ff-only origin develop
git status --short
```

未コミットの変更がある場合は切り替える前に内容を確認します。`main` には以前テスト基盤が別途追加されていましたが、`develop` に統合済みです。

## 必要環境と Secret

通常運用は Windows では Docker Desktop（WSL2 バックエンド）/ Docker Compose、VPS では Docker Engine / Docker Compose を使用します。Bot 本体をホストの Node.js プロセスとして直接常駐させることは正式な運用方式ではありません。ホストでテストを実行する場合のみ Node.js `>=24.17.0 <25` を用意します。

VSCode ターミナルで Docker を確認します。

```powershell
docker version
docker compose version
```

初回だけ `.env.example` を `.env` へコピーし、Discord Developer Portal で取得した Bot Token を設定します。既存の `.env` は上書きしません。

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

```dotenv
DISCORD_BOT_TOKEN=実際のBotToken
```

この Bot は Minecraft 側の DiscordSRV と **同じ Discord Bot Application / Bot Token** を使います。別々の VPS 上に、それぞれ Git 管理外の `.env` を配置してください。Token を Git、README、Dockerfile、Compose 定義、Discord チャットに書き込まないでください。

## ローカルで起動・接続確認

リポジトリのルートで開発用 Compose を起動します。開発用 override は `NODE_ENV=development` と再起動無効を指定しますが、ソースコードの bind mount は行いません。**コード変更は `--build` による再ビルドが必要**です。

```powershell
docker compose -f compose.yaml -f compose.dev.yaml up -d --build
```

状態とログ:

```powershell
docker compose -f compose.yaml -f compose.dev.yaml ps bot
docker compose -f compose.yaml -f compose.dev.yaml logs -f bot
```

ログに `Discord client ready as ...` が出れば Discord Gateway への接続を確認できます。`Discord bot failed to start.` やコンテナの終了が表示された場合は、`.env` の Token、有効性、ネットワーク接続とログを確認します。ログの追跡表示を止める `Ctrl+C` はコンテナの停止操作ではありません。

停止・再起動・再ビルド:

```powershell
# 正常停止
docker compose -f compose.yaml -f compose.dev.yaml stop bot
# 起動済みコンテナの再起動（コード・環境変数の変更は反映しない）
docker compose -f compose.yaml -f compose.dev.yaml restart bot
# コード・image・Compose・.env の変更を反映
docker compose -f compose.yaml -f compose.dev.yaml up -d --build
# コンテナを終了・削除
docker compose -f compose.yaml -f compose.dev.yaml down
```

同じ Bot Token を使ってローカルと本番を同時に起動すると、同一 Bot アカウントの複数プロセスが動作します。接続確認が終わったら不要な開発コンテナを停止してください。

## テスト

ホストに対応する Node.js / npm がある場合、VSCode ターミナルで以下を実行できます。

```powershell
node --version
npm ci
npm run verify
```

`verify` は本体とテストの型チェック、TypeScript ビルド、既存の Node.js smoke test、Vitest の単体テストを実行します。個別に実行する場合は `npm test`、Vitest の監視実行は `npm run test:watch` を使用します。`pict-node` のセットアップには環境によって Git やネイティブのビルドツールが必要です。**テストに有効な Discord Token は不要**です。詳細は [`TESTING.md`](./TESTING.md) を参照してください。現段階で Discord レスポンスのスナップショットテストは導入していません。

## アプリ用 VPS に接続する（VSCode ターミナルから）

独自 Bot は Web アプリと同じアプリ用 VPS で動作し、Minecraft 本体・DiscordSRV は別の Minecraft 用 VPS で動作します。VSCode の**ローカル**ターミナルから、実際の秘密鍵・SSH ユーザー・アプリ側 VPS の IP を指定します。

```powershell
ssh -i "$HOME/.ssh/鍵ファイル名" SSHユーザー名@アプリVPSのIP
```

接続後は Ubuntu 上の操作です。既存の配置先がある場合はそのディレクトリを使います。未配置で新たに構築する場合の配置例は次のとおりです。すでに稼働中の Bot を二重に配置・起動しないでください。

```bash
mkdir -p ~/apps
cd ~/apps
git clone https://github.com/surumeneco/MineCraftXPlayDiscordBot.git
cd MineCraftXPlayDiscordBot
git fetch origin --prune
git switch develop
git pull --ff-only origin develop
```

初回のみ、VPS 内で `.env` を作成して本番用 Token を設定します。既存の `.env` を Git 更新やコピーで上書きしません。

```bash
[ -f .env ] || cp .env.example .env
docker compose -f compose.yaml -f compose.prod.yaml up -d --build
docker compose -f compose.yaml -f compose.prod.yaml ps bot
docker compose -f compose.yaml -f compose.prod.yaml logs -f bot
```

本番用 override は `restart: unless-stopped` を設定します。Bot には公開待受ポートがなく、稼働確認は主にログと Docker のコンテナ状態で行います。

本番の通常操作は次のとおりです。

```bash
# 停止
docker compose -f compose.yaml -f compose.prod.yaml stop bot
# 再起動（コードや設定が変わっていない場合）
docker compose -f compose.yaml -f compose.prod.yaml restart bot
# 状態確認
docker compose -f compose.yaml -f compose.prod.yaml ps bot
# ログ確認
docker compose -f compose.yaml -f compose.prod.yaml logs --tail=100 bot
# ソース更新・再ビルド・コンテナ再作成
git pull --ff-only origin develop
docker compose -f compose.yaml -f compose.prod.yaml up -d --build
```

`restart` だけでは新しいコード・image・環境変数は反映されません。変更時は `up -d --build` を使用します。本番更新前に `git status --short` を確認し、Secret や VPS 固有の状態を Git に追加しないでください。

## 仕様・環境資料

- [テスト方針と共通ユーティリティ](./TESTING.md)
- [DiscordBot 設計](https://drive.google.com/file/d/1rpYIHjRzajzdnohlQGl0lkTLVuL0C4Ju/view)
- [実装制約](https://drive.google.com/file/d/1KvbMEWMfC-HWpg7k_VWqGV6XIZirK2Sd/view)
- [サーバー構成](https://drive.google.com/file/d/1SndNSbyQX5HUEEE-ueQAofPO0bZ6jvto/view)
