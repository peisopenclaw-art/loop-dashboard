# loop-state.json スキーマ仕様(v1.0)

このドキュメントは `loop-app/state/loop-state.json` の構造を定義する。
Loop Dashboard(`loop-app/`)はこのファイルを `fetch` で読み込み、
フレームワークなしのプレーンJS(`app.js`)で描画する。

設計方針は `フェーズ1/05_確定要件_フェーズ2計画.md` に準拠する:

- ダッシュボードの右ペイン固定区画(ゴール/計画/差分/ボトルネック/エラー/スキル・メモリ/おすすめ)
  にそのまま対応するフィールド構成にする
- 「文章を読まずに、見て分かるか」を優先し、各フィールドは短文・列挙・数値中心にする
- ループ実行系(GitHub Actions想定)がこのJSONを**上書き生成**し、
  ダッシュボードは常に最新の1ファイルだけを見る(履歴はgitコミット履歴に委ねる)

## トップレベル

| フィールド | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `schemaVersion` | string | ○ | スキーマのバージョン。互換性が壊れる変更をした場合はメジャーを上げる。現在 `"1.0"` |
| `updatedAt` | string (ISO 8601) | ○ | このJSONを生成した実行の完了時刻 |
| `previousRunAt` | string (ISO 8601) | ○ | 1つ前の実行の完了時刻。`changes` の基準時点として表示に使う |
| `goal` | object | ○ | ゴールセクション。下記参照 |
| `tasks` | array\<Task\> | ○ | カンバンに表示するタスク一覧 |
| `changes` | array\<Change\> | ○ | 前回実行からの差分。空配列可 |
| `bottlenecks` | array\<Bottleneck\> | ○ | ボトルネック警告。空配列可 |
| `errors` | array\<ErrorItem\> | ○ | エラー詳細。空配列可 |
| `skills` | array\<Skill\> | ○ | 適用スキル一覧 |
| `lessons` | array\<string\> | ○ | 外側のループが蓄積した教訓の一覧(自由文) |
| `recommendations` | array\<Recommendation\> | ○ | おすすめカードの内容 |

## `goal`

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `text` | string | 目標を1行で表す文。改行しない前提でUIは1〜2行に収める |
| `stopConditions` | array\<string\> | 停止条件(最大実行回数・最大実行時間・エラー連続回数など)。無限ループ防止のガードレール仕様(要件書 58〜68行)に対応 |
| `progress` | number (0〜1) | 全体進捗。UIは百分率のプログレスバーに変換する |

## `tasks[]` (Task)

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `id` | string | タスクの一意ID。`changes[].taskId` などから参照される |
| `title` | string | カンバンカードの見出し。短文推奨(1行) |
| `status` | `"todo" \| "doing" \| "review" \| "done" \| "error"` | カンバンの列。この5値以外は未定義動作(UIは値をそのまま表示するがバッジ色が付かない) |
| `dependsOn` | array\<string\> | 依存するタスクIDの配列。依存フロー図的な情報はカード展開時に「依存: …」として表示 |
| `durationMs` | number | 所要時間(ミリ秒)。`0` または未指定は「未実行」として扱い `—` 表示 |
| `retries` | number | リトライ回数。ボトルネック判定の材料 |
| `skill` | string | このタスクに適用されたスキル名。`skills[].name` と対応させる |
| `summary` | string | タスクの状態を1〜2行で要約した文。カード展開時に表示 |

## `changes[]` (Change) — 差分セクション

前回実行(`previousRunAt`)から**変わった箇所だけ**を列挙する。
これが認知負荷削減の中核(「前回との差分が一目で分かるか」の評価基準に対応)。

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `taskId` | string | 対象タスクID |
| `type` | `"added" \| "status_changed" \| "updated"` | 変化の種類。`added`=新規タスク出現、`status_changed`=ステータス遷移、`updated`=内容更新(ステータスは変わらず summary 等が変わった場合) |
| `from` | string または null | 変化前の値(主にstatus)。`added` の場合は `null` |
| `to` | string | 変化後の値(主にstatus) |
| `note` | string | 1行の補足説明 |

## `bottlenecks[]` (Bottleneck)

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `taskId` | string | 対象タスクID |
| `reason` | string | 詰まっている理由(所要時間の超過・リトライ多発など)を1〜2文で |
| `severity` | `"high" \| "medium" \| "low"` | 警告の強さ。UIの左ボーダー色とバッジに反映(重度/中度/軽度) |

## `errors[]` (ErrorItem)

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `taskId` | string | 対象タスクID |
| `message` | string | エラーメッセージ本文(短く) |
| `cause` | string | 推定原因。詳細は `<details>` 展開時に表示 |
| `action` | string | 対処状況(自動リトライ済み/保留中/要人間判断など) |

## `skills[]` (Skill)

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `name` | string | スキル名。`tasks[].skill` と対応 |
| `uses` | number | 累計使用回数 |
| `lastResult` | `"success" \| "partial_failure" \| "failure"` | 直近の結果。チップの色ドットに反映 |

## `lessons[]`

自由文字列の配列。外側のループ(セッションを超える教訓の蓄積)が書き込む。
1件1行、断定的な短文を推奨(例:「引用元リンクが404になるケースが増えている。取得前に…」)。

## `recommendations[]` (Recommendation)

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `type` | `"next_action" \| "new_skill" \| "risk" \| "cost"` | 提案の種類。バッジラベルに変換される(次の一手/新規スキル/リスク/コスト) |
| `text` | string | 提案本文(1〜2文) |

## 今後の互換性メモ(スライス2-2以降)

- スライス2-2でループ本体が実データを書き込む際も、このフィールド構成は維持する想定。
  新フィールドを追加する場合はUI側が知らないフィールドを無視できるようにする(現在の `app.js` は
  未知フィールドを読み飛ばす設計)
- `status` の値を増やす場合(例: `blocked` の追加)はメジャーバージョンを上げ、
  `styles.css` の `badge-*` / `STATUS_LABEL` (`app.js`)にも対応を追加すること
