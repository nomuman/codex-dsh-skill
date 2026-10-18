# Set up local DSH delegation

Use Node.js 22 or newer, Git, and an existing DSH installation on macOS or Linux. Install `dsh-delegate/` as a whole directory in your Codex skill directory. The runner uses Node built-ins and requires no npm installation.

Set `DSH_BIN` to the existing executable and `DSH_HOME` to the existing state directory. Both must be absolute paths. Keep state and credential files outside source repositories. A missing `DSH_HOME` is an error, so the runner cannot silently initialize a separate default home.

Configure a valid OpenCode Go credential under the DSH credential reference `OPENCODE_GO_API_KEY` using your local trusted credential setup. Keep its value private. The runner enables the managed credentials plugin for headless execution and never imports another application's authentication store. Existing key-import scripts can overwrite a refreshed DSH credential with a stale key, so verify their behavior before using them. A 401 or `api_key_expired` requires credential diagnosis before another request.

The runner's generated patch selects the built-in `opencode-go` provider, `deepseek-v4.1-flash`, high reasoning, and zero provider retries. The native provider preserves its session header handling. The patch disables title generation, compaction, image overflow recovery, nested subagents, workflows, and automatic goal continuation. It leaves headless permission defaults in place. It does not modify the stored configuration or credentials.

Read `node scripts/run.mjs --help` from the skill directory for available limits. Use an existing external parent with `--artifacts-dir` when the operating system's temporary directory is unsuitable. Each invocation creates its own private directory. The runner refuses canonical paths inside the target repository or DSH home, including symlink aliases.

Keep prompt files private and outside the repository. Review provider terms and your account's additional-usage settings before sending sensitive code or starting paid work. The runner cannot inspect or enforce your account's billing settings. It cannot establish that OpenCode Go and DeepSeek's direct API use the same model checkpoint.

DSH may persist prompts, tool output, and sessions in `DSH_HOME`. The runner also stores private prompts, event logs, final answers, and Git evidence externally. Delete or retain those artifacts under your own data policy after review. Temporary storage may be cleared by the operating system.

Compatibility is based on installed DSH `0.2.1-rc.2`. Other versions and future protocol changes are unverified. Check the [official headless documentation](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/headless/README.md) and [OpenCode Go documentation](https://opencode.ai/v2/docs/console/go/) when upgrading. An initial connection test consumes provider usage. Run it once only when needed and permitted by the current host.
