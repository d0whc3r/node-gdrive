# node-gdrive

Modern Google Drive backup, restore, retention, and management CLI & TypeScript library built on **Node.js 26** and **`@googleapis/drive`**. Supports **Service Accounts / ADC**, **OAuth2 loopback with PKCE**, **Shared Drives**, nested folders, and client-side encryption.

[![CI](https://img.shields.io/github/actions/workflow/status/d0whc3r/node-gdrive/ci.yml?branch=master&style=flat-square&logo=githubactions&logoColor=white&label=CI)](https://github.com/d0whc3r/node-gdrive/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@d0whc3r/node-gdrive?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/@d0whc3r/node-gdrive)
[![npm downloads](https://img.shields.io/npm/dm/@d0whc3r/node-gdrive?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/@d0whc3r/node-gdrive)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D26-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](https://opensource.org/licenses/MIT)

---

## Quick Start

1. **Choose your authentication method** (Service Account for servers/CI, or OAuth2 for personal Drive):

```bash
# Option A — Service Account (recommended for servers, cron & Docker)
export GOOGLE_APPLICATION_CREDENTIALS="./secrets/service-account.json"

# Option B — OAuth2 Desktop credentials (opens a local loopback callback on first run)
export CREDENTIALS_FILE="./secrets/credentials.json"
```

2. **Run your first backup** (compresses `./data`, creates nested folders `backups/daily` if missing, and replaces any existing file):

```bash
npx @d0whc3r/node-gdrive -b ./data -z data-backup.zip -f backups/daily -c -r
```

3. **Preview retention cleanup safely** before deleting anything (`--dry-run` + `--keep-last`):

```bash
npx @d0whc3r/node-gdrive -f backups/daily -d 30d --keep-last 5 --dry-run
```

---

## Features

- **Modern Google Authentication**:
  - **Service Account / ADC** (`--service-account` / `GOOGLE_APPLICATION_CREDENTIALS`) for headless servers, cron jobs, and CI/CD.
  - **Localhost Loopback OAuth2 + PKCE** (`http://127.0.0.1:<port>/oauth2callback`) with automatic token refresh persistence (`0600` permissions).
- **Shared Drives & Nested Folders**: Target Google Workspace Shared Drives (`--drive-id`) and upload to nested paths (`-f backups/prod/mysql`) with fast Drive API `q` queries.
- **Flexible Backups**: Upload files, directories, globs, or piped `--stdin` streams with optional ZIP compression, `--exclude` filters, bounded parallel uploads, and exponential backoff retries on `429`/`5xx`.
- **Download & Restore**: Download by file ID or filename (`--download <file> -o <path>`) with optional transparent decryption.
- **Client-Side Encryption (`--encrypt`)**: Streaming **AES-256-GCM** encryption using Node.js built-in `node:crypto` (`scrypt` key derivation, random salt & IV, authentication tag).
- **Safe Retention Cleanup (`-d`)**: Delete files older than a duration (`s`, `m`, `h`, `d`, `w`, `M`, `y`) with `--keep-last <N>` protection, automatic folder/trash exclusion, and `--dry-run` preview.
- **MySQL Backups (`-m`)**: Dump a MySQL database, optionally zip/encrypt it, upload to Drive, and automatically clean up temporary files (`0600` permissions in a private `0700` temp directory).
- **Standalone Binaries**: Native Node.js 26 Single Executable Applications (SEA) for Linux, macOS, and Windows—no Node.js installation needed on target servers.

---

## Installation

### Option 1: Run on demand or install globally (requires Node.js >= 26)

```bash
# Run without installing
npx @d0whc3r/node-gdrive --help

# Install globally
npm install -g @d0whc3r/node-gdrive

# Add to a Node.js / TypeScript project
pnpm add @d0whc3r/node-gdrive
```

### Option 2: Standalone Binary (Node.js 26 SEA)

Build a self-contained binary for your OS (or download prebuilt artifacts from GitHub Actions):

```bash
pnpm install
pnpm build:sea
./node-gdrive --version
./node-gdrive --help
```

### Option 3: Docker

```bash
docker build -t node-gdrive .

# Run with Service Account or OAuth secrets mounted read-only (runs as non-root UID 10001)
docker run --rm \
  -v "$(pwd)/secrets:/app/secrets:ro" \
  -v "$(pwd)/data:/data:ro" \
  node-gdrive -b /data -z backup.zip -f backups/daily -c -r
```

---

## Authentication Setup

### 1. Service Account / ADC (Recommended for CI, Cron & Docker)

1. Create a Service Account in Google Cloud Console with the **Google Drive API** enabled and download its JSON key.
2. Share the target folder or Shared Drive with the Service Account email.
3. Point `node-gdrive` to the key via env var or CLI flag:

```bash
GOOGLE_APPLICATION_CREDENTIALS=./secrets/service-account.json \
  node-gdrive -l --drive-id <SHARED_DRIVE_ID>
```

### 2. OAuth2 Desktop App (Personal Google Drive / Interactive CLI)

1. Enable the **Google Drive API** in Google Cloud Console and create an **OAuth 2.0 Desktop App** client.
2. Save the downloaded JSON as `./secrets/credentials.json`.
3. Run any command (e.g., `node-gdrive -l`) and open the printed URL in your browser.
4. `node-gdrive` captures the callback on an ephemeral `http://127.0.0.1:<port>/oauth2callback` server (with PKCE `S256` and `state` validation) and saves the token with `0600` permissions to `./secrets/token.json`.

---

## Environment Variables

| Variable                                                                     | Description                                         | Default                      |
| ---------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------- |
| `GOOGLE_APPLICATION_CREDENTIALS`                                             | Path to Service Account JSON key (standard GCP var) | —                            |
| `SERVICE_ACCOUNT_FILE`                                                       | Alias for Service Account JSON key path             | —                            |
| `CREDENTIALS_FILE`                                                           | Path to OAuth2 Desktop `credentials.json`           | `./secrets/credentials.json` |
| `TOKEN_FILE`                                                                 | Path to stored OAuth2 `token.json` (`0600`)         | `./secrets/token.json`       |
| `BACKUP_ENCRYPTION_KEY`                                                      | Passphrase for `--encrypt` (AES-256-GCM)            | —                            |
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` | MySQL connection for `--mysql`                      | `localhost:3306`             |

See [example.env](./example.env) for a ready-to-copy template.

---

## CLI Reference

### Options

| Flag                       | Alias | Description                                                            |
| -------------------------- | ----- | ---------------------------------------------------------------------- |
| `--list`                   | `-l`  | List files and folders                                                 |
| `--backup <file*>`         | `-b`  | Upload files, directories, or globs (repeatable)                       |
| `--download <id-or-name>`  | —     | Download a file by ID or name                                          |
| `--output <path>`          | `-o`  | Local destination path for `--download`                                |
| `--folder <path>`          | `-f`  | Destination folder path (supports nested paths like `backups/daily`)   |
| `--zip [filename.zip]`     | `-z`  | Compress backup files into a ZIP archive                               |
| `--exclude <glob>`         | —     | Exclude files matching glob pattern (repeatable)                       |
| `--replace`                | `-r`  | Replace existing file in target folder on upload                       |
| `--create`                 | `-c`  | Create destination folder(s) if they do not exist                      |
| `--delete <rule>`          | `-d`  | Delete files older than duration (`folder=7d` or `7d`, repeatable)     |
| `--keep-last <N>`          | —     | Always preserve the N newest matching files when deleting              |
| `--dry-run`                | —     | Preview uploads/deletions without modifying Drive                      |
| `--encrypt`                | —     | Encrypt on upload / decrypt on download using `$BACKUP_ENCRYPTION_KEY` |
| `--stdin`                  | —     | Read upload payload from standard input (requires `--name`)            |
| `--name <filename>`        | —     | Filename when uploading from `--stdin`                                 |
| `--mysql`                  | `-m`  | Create and upload a MySQL dump using `$MYSQL_*` env vars               |
| `--drive-id <id>`          | —     | Target a Google Workspace Shared Drive                                 |
| `--service-account <path>` | —     | Path to a Service Account JSON key                                     |
| `--json`                   | —     | Output machine-readable JSON (ideal for CI/scripts)                    |
| `--quiet`                  | `-q`  | Suppress informational logs                                            |
| `--version`                | `-v`  | Print CLI version                                                      |
| `--help`                   | `-h`  | Print usage guide                                                      |

### Common Recipes

```bash
# 1. List files as JSON
node-gdrive -l --json

# 2. Backup files/globs to a nested folder (creating missing folders)
node-gdrive -b "src/*" -b package.json -f backups/app -c -r

# 3. Backup as an encrypted ZIP while excluding logs
BACKUP_ENCRYPTION_KEY="my-strong-passphrase" \
  node-gdrive -b "./data/*" --exclude "*.log" -z backup.zip -f backups -c -r --encrypt

# 4. Download and decrypt a backup
BACKUP_ENCRYPTION_KEY="my-strong-passphrase" \
  node-gdrive --download backup.zip.enc -f backups -o ./backup.zip --encrypt

# 5. Stream a PostgreSQL dump directly to Google Drive without touching disk
pg_dump mydb | node-gdrive --stdin --name mydb.sql -f backups/pg -c

# 6. Nightly cron job: MySQL backup + prune older than 14 days while keeping at least 5 backups
node-gdrive -m -z -f backups/mysql -c --encrypt && \
  node-gdrive -f backups/mysql -d 14d --keep-last 5
```

### Valid Duration Units (`-d`)

| Unit | Meaning | Example |
| ---- | ------- | ------- |
| `s`  | Seconds | `30s`   |
| `m`  | Minutes | `15m`   |
| `h`  | Hours   | `24h`   |
| `d`  | Days    | `7d`    |
| `w`  | Weeks   | `2w`    |
| `M`  | Months  | `1M`    |
| `y`  | Years   | `1y`    |

> Invalid units are rejected immediately with a non-zero exit code to prevent accidental deletions.

### Exit Codes

- `0`: Command succeeded (or `--help` / `--version`).
- `1`: Runtime or Google Drive API error (authentication, network, missing file, etc.).
- `2`: Invalid CLI arguments or missing required flags.

---

## Programmatic API (TypeScript / ESM & CJS)

### ESM / TypeScript

```ts
import { GDrive } from '@d0whc3r/node-gdrive';

const gdrive = new GDrive({
  serviceAccountFile: './secrets/service-account.json',
  sharedDriveId: '0AAxxxxxxxxUk9PVA',
  concurrency: 4
});

// Upload files with compression, exclusions, and AES-256-GCM encryption
const uploaded = await gdrive.uploadFiles(['./data/*'], 'backups/daily', {
  create: true,
  replace: true,
  compress: 'daily.zip',
  exclude: ['*.log', '*.tmp'],
  encryptKey: process.env.BACKUP_ENCRYPTION_KEY
});

// Download and decrypt
await gdrive.downloadFile('daily.zip.enc', './restore/daily.zip', {
  folderName: 'backups/daily',
  decryptKey: process.env.BACKUP_ENCRYPTION_KEY
});

// Retention cleanup: delete files older than 14 days, always keeping the 5 newest
await gdrive.cleanOlder('14d', 'backups/daily', { keepLast: 5 });
```

### CommonJS

```js
const { GDrive } = require('@d0whc3r/node-gdrive');

const gdrive = new GDrive();
gdrive.listFiles().then((files) => console.log(files));
```

---

## Development

```bash
pnpm install
pnpm lint           # Oxlint
pnpm format:check   # Oxfmt
pnpm typecheck      # TypeScript 7
pnpm test:unit      # Fast offline unit tests (Vitest)
pnpm test:coverage  # Coverage report
pnpm build          # Library (CJS/ESM/.d.ts) + CLI + Node 26 SEA binary
```

## License

MIT
