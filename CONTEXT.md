# Skillset

Skillset is a local CLI for configuring one shared collection of agent skills across a personal developer's devices and coding agents. The `skills` repository contains the skills themselves; Skillset configures and deploys them.

## Language

**Skill**:
A single agent skill, identified by its name, source path, and content fingerprint. Skills with the same name but different source or content are distinct Skills.
_Avoid_: skill name

**Skill collection**:
The actual collection of individual Skills that can be supplied to coding agents.
_Avoid_: Skillset

**Skillset**:
The configuration that declares a shared set of selected Skills and how it is deployed to supported Coding Agents.
_Avoid_: skill collection, skills repository

**Execution environment**:
Either Windows or WSL on a device. A device's Execution environments share one Skillset configuration but retain independent Agent configuration and Original-state snapshots.
_Avoid_: device, agent

**Remote Skills Repository**:
An optional remote repository that supplies Skills to a Skillset. When configured, all its Skills are selected by default and may be deselected by the user.
_Avoid_: required repository, skill marketplace

**Shared Skillset configuration**:
The version-controlled declaration of a Skillset's selected Skills, Target Coding Agents, and recorded Remote Skills Repository revision. It is stored with the Remote Skills Repository when one is configured; otherwise it is local to the device.
_Avoid_: Original-state snapshot, agent configuration

**Local discovery**:
A read-only scan of the actual skill directories of Coding Agents already configured on the device. It does not search remote sources or arbitrary local directories.
_Avoid_: installation, remote search

**Local managed source**:
A local Skillset-owned copy of Skills selected through Local discovery when no Remote Skills Repository is configured. It is the stable source for later Synchronization.
_Avoid_: agent skill directory, cache

**Coding Agent**:
A development tool that loads Skills according to its own configuration convention.
_Avoid_: platform, client

**Supported Coding Agent**:
A Coding Agent with an adapter for discovery, status checking, and synchronization: Codex, Claude Code, Gemini CLI, GitHub Copilot CLI, Cursor, Pi, OpenCode, Cline, Roo Code, Windsurf, or Hermes Agent. Aider is not supported in v1.
_Avoid_: all agents, compatible agent

**Target Coding Agent**:
A Supported Coding Agent explicitly selected for a Skillset on the current device. No Coding Agent is selected by default; Synchronization only affects Target Coding Agents.
_Avoid_: all discovered agents, supported agent

**Unavailable Target Coding Agent**:
A Target Coding Agent not currently discovered in an Execution environment. It remains a target and is reported as unavailable until it can be synchronized.
_Avoid_: removed target, unsupported agent

**Agent adapter**:
A component that maps Skillset discovery, comparison, and synchronization semantics to one Coding Agent's local configuration convention.
_Avoid_: skill translator

**Local Skill**:
A Skill currently loaded by a Coding Agent that is not managed by the Skillset. Synchronization preserves Local Skills and status reports them.
_Avoid_: extra skill, removable skill

**Managed Skill**:
A Skill deployed and updated by a Skillset.
_Avoid_: Local Skill

**Status check**:
A read-only comparison between a device's actual Coding Agent Skills and its Skillset.
_Avoid_: synchronization, repair

**Synchronization**:
An explicitly confirmed operation that brings Managed Skills into line with a Skillset.
_Avoid_: status check, automatic repair

**Partial synchronization**:
The result of a Synchronization in which successful Coding Agent updates are retained and failed updates are reported for a later retry.
_Avoid_: transaction, rollback

**Missing source resolution**:
The one-time startup prompt shown when a selected Skill is absent from its Remote Skills Repository. Removing it uses the normal single-Skill removal behavior; retaining it records that choice and suppresses later prompts unless the Skill reappears.
_Avoid_: automatic deletion, recurring warning

**Original-state snapshot**:
The device- and Coding-Agent-specific content saved before a Managed Skill first replaces a same-named Skill.
_Avoid_: remote backup, repository version

**Restore**:
The operation performed when a user removes a Skillset through the CLI: Managed Skills are removed and each Coding Agent's skills return to their pre-management state.
_Avoid_: repository deletion, clearing skills
