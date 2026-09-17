# Shared test utilities

`test-utils/` はDiscordBotの入力組合せテストで利用する共通部品です。

- `defineVariants<T>()`: 設計上の型に対してフィールドごとのvariantを定義する。
- `accept()`: 型として許容されるvariant。各フィールドに1つだけ `baseline: true` を指定する。
- `reject()`: 型外・範囲外・不正形式など、堅牢性確認用のvariant。
- `buildRobustnessCases()`: 全baseline + 1フィールドずつvariantを差し替えた堅牢性ケースを生成する。
- `buildPictCases()`: 同じvariant定義を `pict-node` に渡し、PICTの組合せケースを生成する。

TypeScriptの型情報は実行時には消えるため、union型などから値候補を自動列挙しません。`accept()` の値を設計型へ型チェックさせることで、型定義とvariant定義のずれをコンパイル時に検出します。`reject()` は意図的に型外の値を保持できるよう `unknown` としています。
