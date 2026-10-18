# codex-dsh-skill

Codex から DeepSeek Harness (DSH) に開発作業を依頼し、Codex が実際の差分とテスト結果を確認する Skill です。OpenCode の期間限定無料モデルと、契約が必要な OpenCode Go を選べます。

個人が開発する非公式・実験的なツールです。OpenAI、DeepSeek、OpenCode による提供・承認を示すものではありません。

## 導入

Node.js 22 以上、Git、インストール済みの DSH、選択する経路の有効な認証情報が必要です。無料経路に Go 契約は不要です。このリポジトリには DSH 本体・契約・API キーは含まれません。DSH の準備は [公式の起動手順](https://github.com/deepseek-ai/deepseek-harness#run) と [プロバイダー・認証設定](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.md) を参照してください。

Codex の組み込み `$skill-installer` に、次のように依頼します。

```text
$skill-installer nomuman/codex-dsh-skill の main ブランチから dsh-delegate ディレクトリをインストールして。
```

新規に手動導入する場合は、`dsh-delegate/` 全体を未使用の `~/.agents/skills/dsh-delegate/` へ配置してください。[Codex 公式の Skill 案内](https://learn.chatgpt.com/docs/build-skills)に保存場所と検出方法が記載されています。既に同名の Skill がある場合は、下記の更新手順に従ってください。変更が表示されなければ Codex を再起動します。

DSH 実行ファイルと既存の state ディレクトリの絶対パスを Codex に伝えます。毎回の入力を省く場合は、リポジトリ・Skill の外にある `~/.config/codex-dsh-skill/local-setup.md` にパスや経路の希望を保存できます。これは Codex が読む任意のローカル設定で、runner が読み込む設定ファイルではありません。詳しくは [ローカル設定](dsh-delegate/references/setup.md) を参照してください。別ターミナルで `export` しても、起動済みの Codex デスクトップには反映されません。

Codex では `$dsh-delegate` と作業内容、対象リポジトリ、完了条件を伝えます。無料または Go を指定した場合は、その指定を保存済みの経路設定より優先します。どちらもなければ runner が自動選択します。通常の Skill 自動選択にも対応します。元の作業場所に未コミット変更がある場合は、Codex が別のクリーンな worktree を用意して保護します。

| 選択された経路 | 使用するモデル | 必要な認証参照 |
| --- | --- | --- |
| `--route opencode-free` | `opencode` / `deepseek-v4.1-flash-free` | `OPENCODE_API_KEY` |
| `--route opencode-go` | `opencode-go` / `deepseek-v4.1-flash` | `OPENCODE_GO_API_KEY` と Go 契約 |

DSH が選択した認証参照を保存済みの認証ストアか環境変数から解決できる必要があります。プロバイダーへのログイン情報だけでは、この参照を満たさない場合があります。runner の `--route` 省略時は `auto` です。Go 専用参照 `OPENCODE_GO_API_KEY` が保存済みストアまたは有効な環境設定にあれば Go、なければ無料経路を選びます。これは登録設定の判定であり、有効な契約や残り利用枠の確認ではありません。認証や利用枠のエラーが出ても経路を切り替えません。

[無料モデルは公式に期間限定と記載されています](https://opencode.ai/v2/docs/console/models/)。無制限利用や将来の無料継続を保証するものではありません。認証と設定の詳細は [ローカル設定](dsh-delegate/references/setup.md) を参照してください。

## 更新と戻し方

1. Codex で現在使っている Skill の場所を確認します。以前の `~/.codex/skills/dsh-delegate/` に導入済みなら、その場所を更新します。同名の Skill を別の検出対象フォルダへ追加すると、両方表示される場合があります。
2. 実行中の委譲が終了していることを確認し、現在の Skill 全体を検出対象外の私用フォルダへ退避します。既存のローカル設定は内容を確認し、秘密情報を含まないパスと経路の希望を上記の `local-setup.md` へ移します。既存の Go 設定も維持します。認証情報や DSH state は移動しません。
3. 更新先のコミットを選び、別の一時フォルダへ取得します。差分を確認してから、元の導入先を新しい `dsh-delegate/` 全体へ置き換えます。既存フォルダへの再帰コピーは、入れ子や古いファイルの残存を招くため使いません。不明なローカルファイルは退避して確認します。
4. `node "<installed-skill>/scripts/run.mjs" --help` が動き、Codex に同名 Skill が重複しないことを確認します。`<installed-skill>` は実際の導入先へ置き換えます。この確認ではモデルを呼び出しません。問題があれば実行を止め、退避した Skill 全体を同じ導入先へ戻します。外部の `local-setup.md` は維持します。

## 実行と確認

Skill は [一つの runner](dsh-delegate/scripts/run.mjs) で DSH を一度だけ起動します。プロンプトは stdin で渡し、応答・ログ・Git の前後状態をリポジトリ外の専用ディレクトリへ保存します。自動再試行やセッション再開はしません。

runner は最終応答だけで成功と判断せず、終了コード、セッション、最後のターンの終了理由を確認します。その後、Codex が差分を読み、必要なテストを自分で実行します。DSH の完了と Codex の検証は別に報告します。[結果とエラーの仕様](dsh-delegate/references/result-contract.md) に確認方法を記載しています。

既定の制限は 900 秒、ログ合計 8 MiB、1 リクエストあたり出力 8192 トークンです。時間・出力制限は料金上限ではありません。1 ターン中に複数のモデルリクエストが発生する場合があります。利用枠や追加課金設定は利用者が確認してください。

制限内に収まる小さなタスクを依頼してください。`max_tokens` はモデルの出力上限到達で、作業完了ではありません。出力上限やタイムアウトで止まった場合も部分的な変更が残る可能性があります。原因と差分を確認してから次の対応を決めます。

DSH はホストの権限で動きます。worktree とプロンプトの指示はセキュリティサンドボックスではありません。送信してよいコードと作業範囲を選び、現セッションのネットワーク制限に従ってください。DSH の state と実行ログには機密情報が残る場合があります。

## 確認した組み合わせ

Go での実際の委譲は macOS、DSH `0.2.1-rc.2`、この runner のネイティブ `opencode-go`、`deepseek-v4.1-flash`、high reasoning で確認しました。無料経路は外部通信なしの CLI テストで設定と失敗時の停止を確認しています。無料経路の実認証・アカウントの利用資格・実接続は未確認です。外部通信のないテストは macOS と Linux の CI で実行しています。Linux での実プロバイダー接続や、他の DSH バージョンは未確認です。

2026-10-18 に確認した [OpenCode Go 公式説明](https://opencode.ai/v2/docs/console/go/) は、DSH の一部モデル経路でセッション情報が欠ける問題を掲載しています。[追跡先は Discussion #5495](https://github.com/deepseek-ai/deepseek-harness/discussions/5495) です。この runner は確認済みのネイティブプロバイダー経路を使いますが、DSH 全体の Go 互換性を保証するものではありません。

## 開発

```sh
npm test
```

外部通信、API キー、DSH のインストールが不要な subprocess テストです。自動選択・明示指定・失敗時の一度だけの起動・成功・偽の完了・エラー分類・Git 状態保護・権限・出力制限・タイムアウト・キャンセルと子プロセス停止を検証します。

[DSH 公式](https://github.com/deepseek-ai/deepseek-harness) と [OpenCode Go 公式](https://opencode.ai/v2/docs/console/go/) の仕様・条件は更新されるため、利用時点で確認してください。DeepSeek 直 API とのチェックポイント一致やデータ保持条件をこのリポジトリでは保証しません。

リポジトリと単体 Skill は [MIT License](LICENSE) です。配布用の `dsh-delegate/` にも同じ [LICENSE](dsh-delegate/LICENSE) を含みます。
