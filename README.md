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
