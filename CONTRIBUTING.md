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

## Architecture Overview

```text
src/
├── index.ts                 # Public library entrypoint (GDrive + DB, auth, retry & crypto exports)
├── auth.ts                  # Service Account, OAuth2 loopback (PKCE + state), and ADC auth
├── config.ts                # Environment variable resolution & test reset
├── crypto.ts                # AES-256-GCM encryption / decryption
├── retry.ts                 # Exponential backoff with jitter for transient Drive API errors
├── types.ts                 # Shared TypeScript interfaces
└── db/
    ├── types.ts             # DbEngine, DbDumpOptions, DbDumpResult (stream | file), DbProvider
    ├── index.ts             # Provider registry, URI auto-detection, dumpDatabase() facade
    ├── spawn.ts             # Safe child_process.spawn wrapper (no shell, backpressure, stderr sanitization)
    └── providers/
        ├── postgres.ts      # pg_dump (plain / custom / tar, PGPASSWORD via env)
        ├── mysql.ts         # mysqldump / mariadb-dump CLI (MYSQL_PWD via env) + JS fallback
        ├── mongodb.ts       # mongodump --archive (0600 temp --config file)
        └── sqlite.ts        # Node 26 built-in node:sqlite online backup API
cli/
├── cli.ts                   # Binary entrypoint & exit-code handling
├── cliconfig.ts             # CLI flags & usage guide
└── climodule.ts             # CLI command orchestration (backup, db, stdin, download, delete, list)
```

### Database Backup Architecture

- **Streaming-first**: CLI-backed providers (`postgres`, `mysql`, `mongodb`) return a `DbDumpStreamResult` whose `Readable` stream pipes directly into `GDrive.uploadStream()` (and optional encryption) with `O(1)` memory and zero temporary disk usage.
- **File materialization on demand**: When `--zip` is requested (`preferFile: true`), `dumpDatabase()` materializes the stream into a `0700` temp directory (`0600` file) and removes it in `cleanup()`. SQLite uses Node 26's built-in `node:sqlite` `backup()` API directly to a temp file (WAL-safe, zero external dependencies).
- **Security invariants**:
  - Never spawn binaries with `shell: true`.
  - Never pass passwords on CLI `argv` (use `PGPASSWORD`, `MYSQL_PWD`, or a `0600` temp config file for `mongodump`).
  - Always sanitize URLs in stderr/error messages via `sanitizeUrl()`.
  - Always await `cleanup()` in a `finally` block.

### Adding a New Database Engine

1. Add the engine name to `DbEngine` in `src/db/types.ts`.
2. Create `src/db/providers/<engine>.ts` implementing `DbProvider` (`engine`, `aliases`, `dump()`).
3. Register the provider in `DB_PROVIDERS` and add URI scheme detection in `detectDbEngineFromUrl()` in `src/db/index.ts`.
4. Add unit tests in `tests/db.unit.spec.ts` (use fake executable scripts in a temp `PATH` dir to test real process streaming, env isolation, stderr sanitization, and cleanup).
5. If the engine requires a CLI client binary, add it to the `db` target in `Dockerfile` and smoke-test it in `.github/workflows/ci.yml`.

## Building Docker Images Locally

The `Dockerfile` defines two targets:

```bash
# Default slim image (minimal footprint; supports files, --stdin, SQLite, and MySQL JS fallback)
docker build -t d0whc3r/gdrive:local .

# Database-enabled image (adds pg_dump, mariadb-dump, and mongodump)
docker build --target db -t d0whc3r/gdrive:local-db .
docker run --rm --entrypoint sh d0whc3r/gdrive:local-db -c "pg_dump --version && mariadb-dump --version && mongodump --version"
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
