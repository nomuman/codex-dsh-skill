# codex-dsh-skill

Codex から DeepSeek Harness (DSH) に開発作業を依頼し、Codex が実際の差分とテスト結果を確認する Skill です。OpenCode Go のネイティブプロバイダーで `deepseek-v4.1-flash` を使います。

## 導入

Node.js 22 以上、Git、設定済みの DSH が必要です。macOS と Linux に対応します。DSH の確認対象は `0.2.1-rc.2` です。

```sh
git clone https://github.com/nomuman/codex-dsh-skill.git
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
cp -R codex-dsh-skill/dsh-delegate "${CODEX_HOME:-$HOME/.codex}/skills/dsh-delegate"
```

DSH 実行ファイルと、認証設定済みの既存の state ディレクトリを指定します。キーの値をチャットやリポジトリに入れる必要はありません。詳しくは [ローカル設定](dsh-delegate/references/setup.md) を参照してください。

```sh
export DSH_BIN="/configured/dsh"
export DSH_HOME="/configured/state"
```

Codex では `$dsh-delegate` と作業内容、対象リポジトリ、完了条件を伝えます。通常の Skill 自動選択にも対応します。元の作業場所に未コミット変更がある場合は、Codex が別のクリーンな worktree を用意して保護します。

## 実行と確認

Skill は [一つの runner](dsh-delegate/scripts/run.mjs) で DSH を一度だけ起動します。プロンプトは stdin で渡し、応答・ログ・Git の前後状態をリポジトリ外の専用ディレクトリへ保存します。自動再試行やセッション再開はしません。

runner は最終応答だけで成功と判断せず、終了コード、セッション、最後のターンの終了理由を確認します。その後、Codex が差分を読み、必要なテストを自分で実行します。DSH の完了と Codex の検証は別に報告します。[結果とエラーの仕様](dsh-delegate/references/result-contract.md) に確認方法を記載しています。

既定の制限は 900 秒、ログ合計 8 MiB、1 リクエストあたり出力 8192 トークンです。時間・出力制限は料金上限ではありません。1 ターン中に複数のモデルリクエストが発生する場合があります。利用枠や追加課金設定は利用者が確認してください。

DSH はホストの権限で動きます。worktree とプロンプトの指示はセキュリティサンドボックスではありません。送信してよいコードと作業範囲を選び、現セッションのネットワーク制限に従ってください。DSH の state と実行ログには機密情報が残る場合があります。

## 開発

```sh
npm test
```

外部通信、API キー、DSH のインストールが不要な subprocess テストです。成功・偽の完了・エラー分類・Git 状態保護・権限・出力制限・タイムアウト・キャンセルと子プロセス停止を検証します。

[DSH 公式](https://github.com/deepseek-ai/deepseek-harness) と [OpenCode Go 公式](https://opencode.ai/v2/docs/console/go/) の仕様・条件は更新されるため、利用時点で確認してください。DeepSeek 直 API とのチェックポイント一致やデータ保持条件をこのリポジトリでは保証しません。

MIT License。
