# Skillset

Skillset is a local CLI for configuring a shared collection of agent skills across supported Coding Agents.

## Development

```powershell
npm install
npm test
npm run check
npm run build
```

Run the development CLI with:

```powershell
node --import tsx src/cli.ts init
node --import tsx src/cli.ts doctor
```

Use `--environment windows|wsl` and `--state-root <path>` to inspect a specific execution environment or test state directory.

## Commands

`skillset init` creates the Shared Skillset configuration and state for the current Execution environment. `doctor` reports whether both are ready.

`skillset agents list` shows every built-in Supported Coding Agent and whether it is a Target Coding Agent. Use `agents add <id...>` and `agents remove <id...>` to choose targets. No targets are selected by default. V1 adapters are Codex, Claude Code, Gemini CLI, GitHub Copilot CLI, Cursor, Pi, OpenCode, Cline, Roo Code, Windsurf, and Hermes Agent.

`skillset skills list` discovers Skills only in those adapter directories. `skills search <query>` filters them; `add <name...>` selects and materializes Local managed sources; `remove <name...>` changes desired selection only. For duplicate names, use `name@sourcePath`.

`skillset remote configure <url-or-path>` configures a Remote Skills Repository through Git and selects its current Skills. `remote list` shows the recorded revision. `remote update` prints a human-readable commit summary; repeat it with `--yes` to accept the update. When a selected remote Skill disappears, use `remote resolve <name> <remove|retain>` once to record its resolution.

`skillset status` is read-only and reports each selected target as available or unavailable, then classifies Skills as managed, Local, missing, or drifted. `sync --dry-run` prints its plan without writing. `sync` asks `y/N` before deployment; `sync --yes` is suitable for automation. Synchronization snapshots a same-named Local Skill before replacement, keeps unrelated Local Skills, and retains successful target updates if another target fails. `reset` follows the same confirmation path and restores snapshots for all Managed Skills.
