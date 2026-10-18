# Runner result contract

The runner prints one JSON summary to stdout. Stderr contains fixed progress labels and counters. Raw provider stderr and the final answer remain in private files. The exit code is 0 for a completed DSH invocation and 1 for every failure or incomplete outcome. `codexVerified` is always false. Independent Codex review happens after the runner returns.

After preflight, summaries include `route`, `provider`, and `model` from the selected fixed route. These identify the requested configuration, not successful authentication, account eligibility, or billing. Invalid routes and duplicate options fail before run artifacts or DSH invocation. The CLI defaults to `opencode-go`; use `--route opencode-free` for the free model. A failed free run never falls back to Go.

Each run has a unique directory with mode 0700. Its `evidence/` directory also has mode 0700, and its files have mode 0600:

| File | Contents |
| --- | --- |
| `summary.json` | Outcome, error category, paths, process exit, protocol and Git integrity evidence |
| `before.json`, `after.json` | HEAD, semantic index digest, porcelain status, and staged paths |
| `prompt.txt`, `patch.yml` | Exact task and runtime configuration sent to DSH |
| `events.jsonl`, `stderr.log` | Bounded raw process output |
| `answer.txt` | Final DSH answer, when present |

The initial summary is `incomplete`. If the runner is forcibly killed or the host crashes, inspect this record and check process liveness before starting anything else. A local termination request sends SIGTERM to the process group, then SIGKILL after 1.5 seconds. Escalation remains active even if the group leader exits first. After a normal leader exit, the runner also terminates any remaining group members before capturing `after.json`. This cleanup does not change a successful completion into cancellation.

The execution deadline remains active until process output closes. After a leader exit or local stop, the runner allows at most 2 seconds for its inherited streams to close, including the 1.5-second termination grace period. It then closes its own stdio handles and saves partial evidence as a failed result. An earlier stop reason is preserved. Otherwise the category is `stream_drain_timeout`. Process-group cleanup cannot terminate descendants that move to another process group. The runner is not a security sandbox, and a task can already have changed files before termination.

`outcome: completed` requires exit 0, one session for the requested cwd, a last `turn_end` reason of `completed`, and a following final event. Later terminal inconsistencies, error events, invalid JSON, a local stop, or Git integrity changes reject completion. The runner accepts split UTF-8 chunks and a final line without a trailing newline. Unknown event types are retained without treating them as successful completion.

| Category | Meaning and next action |
| --- | --- |
| `api_key_expired` | Explicit expired key response. Refresh credentials through the trusted local flow. |
| `authentication` | 401 or explicit authentication failure. Diagnose the selected credential and provider. |
| `quota` | Explicit quota, credit, balance, or subscription usage limit. Check account state. |
| `max_tokens` | DSH ended the turn with the exact reason `max-tokens`. Review partial work and per-request output limits. This is not provider usage-quota evidence. |
| `rate_limit` | 429 or explicit rate limit without quota evidence. Respect the provider's limit. |
| `transport` | DNS, connection, or transport failure. Check host network permissions and connectivity. |
| `unknown` | No recognized provider cause or incomplete protocol evidence. Read private logs without guessing. |
| `protocol` | Malformed events or inconsistent session and terminal ordering. Check DSH compatibility. |
| `integrity` | HEAD or tracked index entries changed, staged changes appeared, or post-run Git evidence failed. Inspect without rollback. |
| `timeout`, `output_limit`, `line_limit` | Local execution or output bound stopped the process group. Review partial work. |
| `stream_drain_timeout` | Output streams remained open after the leader-exit drain bound. Runner-owned stdio was closed. Review partial work and check for surviving processes outside the DSH process group. |
| `cancelled_sigint`, `cancelled_sigterm` | The caller requested cancellation. Review partial work. |
| `spawn_error`, `runner_io_error`, `runner_error` | Process startup or local runner operation failed. Inspect the local environment. |
| `preflight_or_runner_error` | Invalid local inputs or repository prerequisites. DSH is not automatically retried. |

Error classification is best effort from the terminal turn reason, explicit error events, and bounded stderr. It does not prove account state. An unavailable model may be `unknown`; inspect its private error evidence. A 429 alone is classified as a rate limit, not a spent subscription. A completed response containing error-like prose is not classified as a provider error.

The default run limit is 900 seconds. Combined stdout and stderr storage is capped at 8 MiB, with an accepted line limit of 256 KiB. `--max-log-bytes` accepts 256 bytes through 64 MiB. `--max-tokens` defaults to 8192 per model request, and is not a task-wide token or cost limit. Prompt input is capped at 1 MiB. No retry or session resume occurs.
