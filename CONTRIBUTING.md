# Contributing to node-gdrive

Thank you for your interest in contributing to **node-gdrive**!

## Requirements

- **Node.js** `>= 26.0.0`
- **pnpm** `12.x`

## Local Setup

```bash
git clone https://github.com/d0whc3r/node-gdrive.git
cd node-gdrive
pnpm install
```

## Common Commands

```bash
pnpm lint           # Run Oxlint
pnpm lint:fix       # Auto-fix lint issues
pnpm format         # Format files with Oxfmt
pnpm format:check   # Check formatting
pnpm typecheck      # Type-check with TypeScript 7
pnpm test:unit      # Run offline unit tests (Vitest)
pnpm test:coverage  # Run unit tests with coverage report
pnpm build:base     # Build CJS/ESM library, CLI, and .d.ts declarations
pnpm build:sea      # Build native Node.js 26 Single Executable Application
pnpm build          # Full build (library + CLI + SEA binary)
```

## Running Integration Tests

Live integration tests (`tests/gdrive.integration.spec.ts`) run against a real Google Drive test account when `CREDENTIALS_JSON` and `TOKEN_JSON` (or local `./secrets/credentials.json` and `./secrets/token.json`) are available:

```bash
pnpm test:integration
```

> **Warning:** Use a dedicated empty test Google Drive account when running integration tests.

## Commit Guidelines

This repository uses [Conventional Commits](https://www.conventionalcommits.org/) enforced by `commitlint` and `husky`:

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation changes
- `refactor:` code refactoring without behavior changes
- `perf:` performance improvement
- `test:` adding or updating tests
- `chore:` build, tooling, or dependency updates
- `ci:` CI/CD workflow changes

## Pull Request Checklist

1. Create a branch from `master`.
2. Add or update unit tests for your changes.
3. Ensure `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test:unit`, and `pnpm build:base` all pass.
4. Open a pull request describing the motivation and changes clearly.
