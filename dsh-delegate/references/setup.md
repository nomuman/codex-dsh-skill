# Set up local DSH delegation

Use Node.js 22 or newer, Git, an existing DSH installation, and a valid credential for the selected route. This skill bundles none of those prerequisites. Follow the [official DSH installation instructions](https://github.com/deepseek-ai/deepseek-harness#run) and [provider and credential setup](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.md). Install the whole `dsh-delegate/` directory, including its license. The runner uses Node built-ins and needs no npm installation.

## Select a route

| `--route` | Native provider and model | Credential reference | Requirement |
| --- | --- | --- | --- |
| `opencode-free` | `opencode` / `deepseek-v4.1-flash-free` | `OPENCODE_API_KEY` | Valid OpenCode credential; no Go subscription needed |
| `opencode-go` | `opencode-go` / `deepseek-v4.1-flash` | `OPENCODE_GO_API_KEY` | OpenCode Go subscription and valid credential |

Pass the selected route explicitly. Omission defaults to Go for existing CLI callers. [OpenCode lists the free model as free for a limited time](https://opencode.ai/v2/docs/console/models/). Availability and terms can change; this is not unlimited use or a future-price guarantee. A free failure stops without a Go fallback.

## Supply local paths

Set `DSH_BIN` to the existing executable and `DSH_HOME` to the existing state directory. Both must be absolute paths outside source repositories. A missing `DSH_HOME` is an error, so the runner cannot silently initialize a separate default home.

You can supply paths with each request or in the environment launching Codex. Exports in another terminal do not reach an already-running desktop app. For persistent desktop setup, ask Codex to record your supplied paths in `~/.config/codex-dsh-skill/local-setup.md` with file permissions `0600`. Keep this note outside repositories and installed skill folders so updates preserve it. For example, after replacing the example paths with your actual paths, tell Codex:

```text
Record DSH_BIN="/opt/dsh/node_modules/.bin/dsh" and DSH_HOME="/var/lib/dsh-user/state" in ~/.config/codex-dsh-skill/local-setup.md with permissions 0600. Record paths only and keep any unrelated settings.
```

This is an optional note for Codex, not a runner configuration parser or a shell file to source. It may also hold a non-secret preference such as `route: opencode-free` or `route: opencode-go`. Codex checks it before execution and passes the paths and selected route explicitly to the runner. Paths supplied for the current task take priority, followed by the caller's environment, then the note. Without a note or environment, Codex asks for the missing paths.

## Use existing authentication

DSH must resolve the selected route's exact credential reference from its saved credential store or the environment. A provider-login entry alone may not satisfy the explicit `apiKeyEnv` reference. Keep secret values out of chat, the local setup note, and repositories. The runner enables the managed credentials plugin for headless execution. It does not import another application's authentication store or change saved credentials. A 401 or `api_key_expired` requires credential diagnosis before another request.

The generated patch selects the route's native provider and model, high reasoning, and zero provider retries. Free uses `https://opencode.ai/inference/openai/v1`; Go uses `https://opencode.ai/inference/go/openai/v1`. The inspected DSH `0.2.1-rc.2` native wrappers supply `x-opencode-session`. Retain native adapters. The patch disables title generation, compaction, image overflow recovery, nested subagents, workflows, and automatic goal continuation. It leaves headless permission defaults in place and does not modify stored configuration.

## Choose limits and storage

Read `node scripts/run.mjs --help` from the installed skill directory for available limits. Use narrow tasks. Time and output limits do not cap billing, and one turn can make multiple model requests. A `max_tokens` outcome means the model reached its output limit, not that the task completed. Inspect the partial diff and result before choosing another action. Review provider terms and your account's additional-usage settings before sending sensitive code or starting paid work. The runner cannot inspect or enforce billing settings.

Use an existing external parent with `--artifacts-dir` when the operating system's temporary directory is unsuitable. Each invocation creates its own private directory. The runner refuses canonical paths inside the target repository or DSH home, including symlink aliases. Keep task files private and outside repositories.

DSH may persist prompts, tool output, and sessions in `DSH_HOME`. The runner also stores private prompts, event logs, final answers, and Git evidence externally. Retain or delete those artifacts under your own data policy after review. Temporary storage may be cleared by the operating system.

## Check compatibility when upgrading

Live Go delegation was checked on macOS with DSH `0.2.1-rc.2`, this runner, native `opencode-go`, `deepseek-v4.1-flash`, and high reasoning. Offline CLI tests cover route selection and free failure handling without provider calls. Free authentication, account eligibility, and live compatibility are unverified. Offline tests run on macOS and Linux; live Linux usage and other DSH versions are unverified.

As checked on 2026-10-18, [OpenCode Go's client compatibility guidance](https://opencode.ai/v2/docs/console/go/) lists DSH as problematic because some adapters omit session information. See [DSH Discussion #5495](https://github.com/deepseek-ai/deepseek-harness/discussions/5495). The inspected native wrapper and the verified combination do not establish compatibility for every DSH route or future version.

Check the [official headless documentation](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/headless/README.md) when upgrading. An initial connection test consumes provider usage. Run it once only when needed and permitted by the current host. This repository does not establish model-checkpoint equivalence or guarantee provider data-retention terms.
