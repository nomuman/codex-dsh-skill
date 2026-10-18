# codex-dsh-skill

[日本語](README.ja.md)

This skill delegates development work from Codex to DeepSeek Harness (DSH). Codex then reviews the actual diff and test results. You can choose OpenCode's time-limited free model or OpenCode Go, which requires a subscription.

This is an unofficial, experimental tool developed by an individual. It is not provided or endorsed by OpenAI, DeepSeek, or OpenCode.

## Install

You need Node.js 22 or later, Git, an installed copy of DSH, and valid credentials for the route you choose. The free route does not require a Go subscription. This repository does not include DSH, a subscription, or API keys. Follow the [official DSH run instructions](https://github.com/deepseek-ai/deepseek-harness#run) and [provider and authentication guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.md) to set up DSH.

Ask Codex's built-in `$skill-installer` to install the skill:

```text
$skill-installer Install the dsh-delegate directory from the main branch of nomuman/codex-dsh-skill.
```

For a new manual installation, place the entire `dsh-delegate/` directory in an unused `~/.agents/skills/dsh-delegate/` path. The [official Codex skill guide](https://learn.chatgpt.com/docs/build-skills) explains where to store skills and how Codex finds them. If you already have a skill with that name, follow the update steps below. Restart Codex if the change does not appear.

Tell Codex the absolute paths to the DSH executable and your existing state directory. To avoid entering them each time, you can save the paths and your preferred route in `~/.config/codex-dsh-skill/local-setup.md`, outside both the repository and the skill. This is an optional local note for Codex to read, not a configuration file that the runner loads. See [local setup](dsh-delegate/references/setup.md) for details. An `export` in another terminal does not affect an already running Codex desktop app.

In Codex, specify `$dsh-delegate`, the work to do, the target repository, and the completion criteria. An explicit choice of free or Go takes priority over a saved route preference. If neither is specified, the runner selects a route automatically. Codex can also select the skill through its normal automatic skill selection. If the original worktree has uncommitted changes, Codex prepares a separate clean worktree to protect them.

| Selected route | Model | Required authentication reference |
| --- | --- | --- |
| `--route opencode-free` | `opencode` / `deepseek-v4.1-flash-free` | `OPENCODE_API_KEY` |
| `--route opencode-go` | `opencode-go` / `deepseek-v4.1-flash` | `OPENCODE_GO_API_KEY` and a Go subscription |

DSH must be able to resolve the selected authentication reference from its saved credential store or the environment. A provider login alone may not satisfy that reference. If you omit the runner's `--route`, it uses `auto`. It selects Go when the Go-specific `OPENCODE_GO_API_KEY` reference exists in the saved store or the active environment; otherwise, it selects the free route. This checks whether the reference is configured. It does not check whether the subscription is valid or usage remains. The runner does not switch routes after an authentication or usage-limit error.

[OpenCode describes the free model as time-limited](https://opencode.ai/v2/docs/console/models/). Unlimited use and continued free access are not guaranteed. See [local setup](dsh-delegate/references/setup.md) for authentication and configuration details.

## Update or roll back

1. Check where Codex currently loads the skill. If you previously installed it in `~/.codex/skills/dsh-delegate/`, update that location. Adding another skill with the same name in a different discovery directory may show both.
2. Wait for any active delegation to finish. Move the entire current skill to a private directory that Codex does not scan. Review any existing local configuration and move paths and route preferences that contain no secrets to the `local-setup.md` file above. Keep any existing Go settings. Do not move credentials or DSH state.
3. Choose the commit you want to install and fetch it into a separate temporary directory. Review the diff, then replace the original installation with the entire new `dsh-delegate/` directory. Do not recursively copy into the existing directory, which could create a nested directory or leave old files behind. Set aside unfamiliar local files for review.
4. Run `node "<installed-skill>/scripts/run.mjs" --help` and check that Codex does not show duplicate skills with the same name. Replace `<installed-skill>` with the actual installation path. This check does not call a model. If there is a problem, stop and restore the entire saved skill to the same installation path. Keep the external `local-setup.md` file.

## Run and verify

The skill uses [one runner](dsh-delegate/scripts/run.mjs) to start DSH once. It sends the prompt through stdin and saves the response, logs, and Git state before and after the run in a dedicated directory outside the repository. It does not retry automatically or resume a session.

The runner does not treat the final response alone as proof of success. It checks the exit code, session, and final turn's end reason. Codex then reads the diff and runs the tests it needs. Report DSH completion and Codex verification separately. The [result and error contract](dsh-delegate/references/result-contract.md) explains how to check them.

The default limits are 900 seconds, 8 MiB of total logs, and 8192 output tokens per request. Time and output limits are not spending caps. One turn may make multiple model requests. Check your usage allowance and any additional billing settings yourself.

Delegate small tasks that fit within these limits. `max_tokens` means the model reached its output limit, not that the work is complete. Partial changes may remain after an output limit or timeout. Review the cause and diff before deciding what to do next.

DSH runs with the host's permissions. A worktree and prompt instructions are not a security sandbox. Choose code you may send and the scope of work, and follow the current session's network restrictions. DSH state and run logs may contain sensitive information.

## Verified combinations

An actual Go delegation was verified on macOS with DSH `0.2.1-rc.2`, this runner's native `opencode-go` route, `deepseek-v4.1-flash`, and high reasoning. For the free route, CLI tests without external network access verified configuration and stopping on failure. Live authentication, account eligibility, and a real provider connection on the free route remain unverified. Tests without external network access were run in macOS and Linux CI. A live Linux provider connection and other DSH versions remain unverified.

As checked on 2026-10-18, the [official OpenCode Go documentation](https://opencode.ai/v2/docs/console/go/) reports missing session information on some DSH model routes. See [Discussion #5495](https://github.com/deepseek-ai/deepseek-harness/discussions/5495) for tracking. This runner uses the verified native provider route, but does not guarantee Go compatibility across all of DSH.

## Develop

```sh
npm test
```

These subprocess tests need no external network access, API key, or DSH installation. They cover automatic route selection, explicit route selection, starting only once on failure, success, false completion, error classification, Git state protection, permissions, output limits, timeouts, cancellation, and stopping child processes.

The terms and specifications from [DSH](https://github.com/deepseek-ai/deepseek-harness) and [OpenCode Go](https://opencode.ai/v2/docs/console/go/) may change. Check them when you use the skill. This repository does not guarantee checkpoint equivalence with the direct DeepSeek API or any data retention terms.

The repository and standalone skill use the [MIT License](LICENSE). The distributable `dsh-delegate/` directory also includes the same [LICENSE](dsh-delegate/LICENSE).
