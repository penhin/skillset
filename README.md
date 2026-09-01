# Skillset

Skillset is a local CLI for configuring a shared collection of agent skills across supported Coding Agents.

## Install

Install the published CLI globally with npm:

```powershell
npm install -g @penhin/skillset
```

Then initialize a Skillset and inspect the Coding Agents discovered on your machine:

```powershell
skillset init
skillset agents list
```

For example, to use Skills from the `penhin/shared-agent-skills` repository:

```powershell
skillset remote configure https://github.com/penhin/shared-agent-skills.git --skills-path .agents/skills
skillset agents add codex
skillset sync
```

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

### Built-in adapter conventions

| Supported Coding Agent | Personal Skill directory (under the home directory) |
| --- | --- |
| Codex, Pi | `.agents/skills` |
| Claude Code | `.claude/skills` |
| Gemini CLI | `.gemini/skills` |
| GitHub Copilot CLI | `.copilot/skills` |
| Cursor | `.cursor/skills` |
| OpenCode | `.config/opencode/skills` |
| Cline | `.cline/skills` |
| Roo Code | `.roo/skills` |
| Windsurf | `.codeium/windsurf/skills` |
| Hermes Agent | `.hermes/skills` |

`skillset agents list` shows every built-in Supported Coding Agent and whether it is a Target Coding Agent. Use `agents add <id...>` and `agents remove <id...>` to choose targets. No targets are selected by default. V1 adapters are Codex, Claude Code, Gemini CLI, GitHub Copilot CLI, Cursor, Pi, OpenCode, Cline, Roo Code, Windsurf, and Hermes Agent.

`skillset skills list` discovers Skills only in those adapter directories. `skills search <query>` filters them; `add <name...>` selects and materializes Local managed sources; `remove <name...>` changes desired selection only. For duplicate names, use `name@sourcePath`.

`skillset remote configure <url-or-path>` configures a Remote Skills Repository through Git and selects its current Skills. `remote list` shows the recorded revision. `remote update` prints a human-readable commit summary; repeat it with `--yes` to accept the update. When a selected remote Skill disappears, use `remote resolve <name> <remove|retain>` once to record its resolution.

### Remote Skills Repository format

The configured Skill root must contain one directory per Skill, each with a `SKILL.md` file:

```text
<Skill root>/<skill-name>/SKILL.md
```

By default, the repository root is the Skill root:

```powershell
skillset remote configure https://github.com/example/skills.git
```

Use `--skills-path <relative-path>` when Skills live beneath a directory in the repository. The path must stay inside the cloned repository. For example, the `penhin/shared-agent-skills` layout is `.agents/skills/<skill-name>/SKILL.md`, so configure it with:

```powershell
skillset remote configure https://github.com/penhin/shared-agent-skills.git --skills-path .agents/skills
```

`skillset status` is read-only and reports each selected target as available or unavailable, then classifies Skills as managed, Local, missing, or drifted. `sync --dry-run` prints its plan without writing. `sync` asks `y/N` before deployment; `sync --yes` is suitable for automation. Synchronization snapshots a same-named Local Skill before replacement, keeps unrelated Local Skills, and retains successful target updates if another target fails. `reset` follows the same confirmation path and restores snapshots for all Managed Skills.
