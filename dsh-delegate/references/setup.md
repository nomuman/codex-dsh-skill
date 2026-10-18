# Set up local DSH delegation

Use Node.js 22 or newer, Git, an existing DSH installation, an OpenCode Go subscription, and a valid credential saved in DSH. This skill bundles none of those prerequisites. Follow the [official DSH installation instructions](https://github.com/deepseek-ai/deepseek-harness#run) and [provider and credential setup](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.md). Install the whole `dsh-delegate/` directory, including its license. The runner uses Node built-ins and needs no npm installation.

## Supply local paths

Set `DSH_BIN` to the existing executable and `DSH_HOME` to the existing state directory. Both must be absolute paths outside source repositories. A missing `DSH_HOME` is an error, so the runner cannot silently initialize a separate default home.

You can supply paths with each request or in the environment launching Codex. Exports in another terminal do not reach an already-running desktop app. For persistent desktop setup, ask Codex to record your supplied paths in `~/.config/codex-dsh-skill/local-setup.md` with file permissions `0600`. Keep this note outside repositories and installed skill folders so updates preserve it. For example, after replacing the example paths with your actual paths, tell Codex:

```text
Record DSH_BIN="/opt/dsh/node_modules/.bin/dsh" and DSH_HOME="/var/lib/dsh-user/state" in ~/.config/codex-dsh-skill/local-setup.md with permissions 0600. Record paths only and keep any unrelated settings.
```

This is an optional note for Codex, not a runner configuration parser or a shell file to source. Codex checks it before execution and passes the paths explicitly to the runner. Paths supplied for the current task take priority, followed by the caller's environment, then the note. Without a note or environment, Codex asks only for the missing paths.

## Use existing authentication

The selected DSH home must already hold a valid OpenCode Go credential under `OPENCODE_GO_API_KEY`. Keep the value out of chat, the local setup note, and repositories. The runner enables the managed credentials plugin for headless execution. It does not import another application's authentication store or change saved credentials. A 401 or `api_key_expired` requires credential diagnosis before another request.

The generated patch selects native `opencode-go`, `deepseek-v4.1-flash`, high reasoning, and zero provider retries. The inspected DSH `0.2.1-rc.2` native provider wrapper supplies `x-opencode-session`. Retain that route rather than substituting a generic compatible provider. The patch disables title generation, compaction, image overflow recovery, nested subagents, workflows, and automatic goal continuation. It leaves headless permission defaults in place and does not modify stored configuration.

## Choose limits and storage

Read `node scripts/run.mjs --help` from the installed skill directory for available limits. Use narrow tasks. Time and output limits do not cap billing, and one turn can make multiple model requests. A `max_tokens` outcome means the model reached its output limit, not that the task completed. Inspect the partial diff and result before choosing another action. Review provider terms and your account's additional-usage settings before sending sensitive code or starting paid work. The runner cannot inspect or enforce billing settings.

Use an existing external parent with `--artifacts-dir` when the operating system's temporary directory is unsuitable. Each invocation creates its own private directory. The runner refuses canonical paths inside the target repository or DSH home, including symlink aliases. Keep task files private and outside repositories.

DSH may persist prompts, tool output, and sessions in `DSH_HOME`. The runner also stores private prompts, event logs, final answers, and Git evidence externally. Retain or delete those artifacts under your own data policy after review. Temporary storage may be cleared by the operating system.

## Check compatibility when upgrading

Live delegation was checked on macOS with DSH `0.2.1-rc.2`, this runner, native `opencode-go`, `deepseek-v4.1-flash`, and high reasoning. Offline tests run on macOS and Linux. Live Linux usage, other DSH versions, and other model routes are unverified.

As checked on 2026-10-18, [OpenCode Go's client compatibility guidance](https://opencode.ai/v2/docs/console/go/) lists DSH as problematic because some adapters omit session information. See [DSH Discussion #5495](https://github.com/deepseek-ai/deepseek-harness/discussions/5495). The inspected native wrapper and the verified combination do not establish compatibility for every DSH route or future version.

Check the [official headless documentation](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/headless/README.md) when upgrading. An initial connection test consumes provider usage. Run it once only when needed and permitted by the current host. This repository does not establish model-checkpoint equivalence or guarantee provider data-retention terms.
