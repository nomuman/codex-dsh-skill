---
name: dsh-delegate
description: Delegate a bounded development task from Codex to DeepSeek Harness using OpenCode Go, then independently review the resulting diff and tests. Use when the user requests DSH delegation or an authorized task benefits from a separate coding executor.
---

# Delegate development to DSH

Codex owns scope, review, and the final report. DSH performs one bounded task in a clean Git worktree. Its completion event is evidence of execution, not proof that the implementation is correct.

## Prepare a reviewable task

Read the target repository's instructions. Establish the requested behavior, allowed files, completion criteria, and relevant test command. Keep the task narrow enough to review in one diff. Include those details in a private task file outside the repository. Exclude credentials and unnecessary personal data.

Check the actual checkout and Git status. The runner requires a clean Git root with an existing HEAD. If the user's checkout has changes, preserve it and prepare a separate clean worktree at the intended revision. Do not stash, discard, or incorporate unrelated work. Keep the original and delegated worktree paths clear.

Use only the network access and execution permissions provided by the current session. If the host forbids the required access, report the limitation. A separate terminal or background process must not bypass that restriction.

For first use or changed local configuration, read [setup.md](references/setup.md). Require explicit existing absolute `DSH_BIN` and `DSH_HOME` paths. Use the saved credentials in that home, without reading or rewriting credential values. The configured provider is the native `opencode-go`, with `deepseek-v4.1-flash` and high reasoning.

## Run once

Execute the bundled runner using the installed skill path:

```sh
DSH_BIN="/configured/dsh" DSH_HOME="/configured/state" \
  node "<skill-directory>/scripts/run.mjs" \
  --repo "/clean/worktree" \
  --task-file "/private/task.txt" \
  --timeout-seconds 900
```

The runner sends the task through stdin and writes private artifacts outside the repository and DSH home. It invokes DSH once, with provider retries disabled. It does not resume sessions or automatically reassign a failed task. Time, output, and per-request token limits are operational limits, not monetary caps. DSH can make multiple model requests during one turn.

Keep the execution in progress until the runner exits. Use the returned summary path to read the result. If execution times out or is cancelled, inspect any partial work before deciding the next action. Never infer failure means no files changed.

For authentication, quota, rate, transport, protocol, or integrity failures, read [result-contract.md](references/result-contract.md). Diagnose the recorded cause before any new model request. Report an unknown cause as unknown. Host communication restrictions and an expired provider credential are separate failures.

## Verify independently

Read the saved before/after Git evidence, current Git status, and the actual diff. Include untracked files in the review. Check scope, correctness, credential exposure, and unexpected generated files. Treat DSH's final answer and test claims as untrusted evidence.

Run the relevant tests yourself in the delegated worktree. A successful runner summary only means DSH met its execution protocol. Claim verification only for the behavior and checks you personally observed. If tests cannot run, report the reason and remaining uncertainty.

Report changed behavior, relevant files, independently run checks and their outcomes, and unresolved limitations. Keep private prompts, provider errors, and logs out of public issues and repositories. Separate DSH completion from Codex verification. Commits, pushes, deployment, and integration back into another checkout follow the user's authorization and repository rules after review. The runner deliberately treats DSH commits or index changes as an integrity failure and preserves them for inspection.

Prompt restrictions and worktrees are not a security sandbox. DSH executes with the host process's permissions and existing headless permission defaults. Use a task and repository whose content may be sent to the selected provider.
