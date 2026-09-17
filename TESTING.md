# テスト構造

## 基本構造

DiscordBotのテストは対象部品単位でフォルダを分け、その配下で責務ごとにテストファイルを分割する。

```text
test/
├─ commands/<command>/
│  ├─ <command>.robustness.spec.ts
│  ├─ <command>.pict.spec.ts
│  └─ <command>.<category>.spec.ts
├─ events/<event>/
├─ interactions/<interaction>/
├─ services/<service>/
├─ api/<api>/
└─ test-utils/
```

ファイル分割は固定本数ではなく責務単位とする。小さい機能はカテゴリ単位でまとめ、1ファイルが複数の無関係な責務を持つ状態を避ける。

Discord APIへの実通信を単体テストの前提とせず、`interaction.reply()`、`editReply()`、`followUp()`、`channel.send()` 等の境界はVitestのmockで置換する。

## variant定義

Slash Command option、Modal入力、Button/Select Menuの入力、外部API入力等は、対象の設計型に対応するvariant定義を用意する。

```ts
import { accept, defineVariants, reject } from '@test-utils'

interface CommandParams {
  playerName: string
  force: boolean
}

export const commandParamVariants = defineVariants<CommandParams>()({
  playerName: [
    accept('normal', 'Steve', { baseline: true, category: 'normal' }),
    accept('empty', '', { category: 'boundary' }),
    reject('null', null, { category: 'invalid-type' }),
  ],
  force: [
    accept('false', false, { baseline: true, category: 'normal' }),
    accept('true', true, { category: 'normal' }),
    reject('string', 'true', { category: 'invalid-type' }),
  ],
})
```

`accept()` は設計型と一致する必要があるため、型変更時にvariant側の不整合も型エラーとして検出する。型外値を試す `reject()` は意図的に `unknown` として扱う。

各フィールドには必ず1つだけ正常系baselineを置く。これを他フィールドの基準値として使う。

## 堅牢性テスト

`buildRobustnessCases()` は全baselineのケースと、baselineから各フィールドを1つずつ差し替えたケースを生成する。

```ts
const cases = buildRobustnessCases(commandParamVariants)

it.each(cases)('$id', async ({ values, shouldAccept }) => {
  const result = await execute(values)
  expectResult(result, shouldAccept)
})
```

## PICTテスト

PICTでも堅牢性テストと同じvariant定義を使用する。

```ts
const cases = await buildPictCases(commandParamVariants)

it.each(cases)('$id', async ({ values, shouldAccept }) => {
  const result = await execute(values)
  expectResult(result, shouldAccept)
})
```

デフォルトはpairwise（order 2）。必要な対象のみ `buildPictCases(variants, { order: 3 })` のように強度を上げる。

`shouldAccept` は選択されたvariantが全て `accept` なら `true`、1つでも `reject` を含めば `false` になる。Discord応答内容、エラー種別、権限判定等の具体的な期待値は各テスト対象側で判定する。

## 細かな機能テスト

入力網羅とは独立した挙動は、対象内でカテゴリごとのテストファイルにまとめる。例:

- 権限・認可
- `reply` / `editReply` / `followUp` の呼出し
- Discordイベント処理
- Web API成功時・失敗時処理
- Minecraft連携成功時・失敗時処理
- 永続化、副作用
- タイムアウト、リトライ、例外処理

variant/PICTテストへ全ての機能確認を詰め込まず、入力空間の確認とBot挙動の確認を分離する。

## snapshot

Discordレスポンス、Embed、Component等のsnapshotテストは現時点では導入しない。
