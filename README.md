# node-gdrive

CLI and Node.js library to back up, restore, encrypt, and prune files on **Google Drive**—works via **Docker**, **npx/npm**, or as a **standalone binary** (Linux, macOS, Windows).

[![CI](https://img.shields.io/github/actions/workflow/status/d0whc3r/node-gdrive/ci.yml?branch=master&style=flat-square&logo=githubactions&logoColor=white&label=CI)](https://github.com/d0whc3r/node-gdrive/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@d0whc3r/node-gdrive?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/@d0whc3r/node-gdrive)
[![Docker Hub](https://img.shields.io/docker/v/d0whc3r/gdrive?style=flat-square&logo=docker&logoColor=white&label=docker)](https://hub.docker.com/r/d0whc3r/gdrive)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D26-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](./LICENSE)

---

## Ways to Run

### 1. Docker (No Node.js required)

```bash
docker run --rm d0whc3r/gdrive --help

# Mount your secrets folder read-only and list files
docker run --rm -v "$PWD/secrets:/app/secrets:ro" d0whc3r/gdrive -l

# Back up a local directory into Google Drive
docker run --rm \
  -v "$PWD/secrets:/app/secrets:ro" \
  -v "$PWD/data:/data:ro" \
  d0whc3r/gdrive -b /data -z backup.zip -f backups/daily -c -r
```

### 2. npx / npm (Node.js >= 26)

```bash
# Run on demand
npx @d0whc3r/node-gdrive --help

# Or install globally
npm install -g @d0whc3r/node-gdrive
node-gdrive --help
```

### 3. Standalone Binary (No Node.js required)

Download the prebuilt `node-gdrive` (Linux / macOS) or `node-gdrive.exe` (Windows) executable from [GitHub Releases](https://github.com/d0whc3r/node-gdrive/releases) and run it directly:

```bash
chmod +x ./node-gdrive
./node-gdrive --help
```

---

## Authentication Setup

### Option A: Service Account (Recommended for Servers, Cron & Docker)

1. In [Google Cloud Console](https://console.cloud.google.com/), enable the **Google Drive API**, create a **Service Account**, and download its JSON key to `./secrets/service-account.json`.
2. Share your target Google Drive folder or **Shared Drive** with the Service Account email address.
3. Run with `GOOGLE_APPLICATION_CREDENTIALS` or `--service-account`:

```bash
GOOGLE_APPLICATION_CREDENTIALS=./secrets/service-account.json \
  node-gdrive -l --drive-id <SHARED_DRIVE_ID>
```

### Option B: OAuth2 Desktop App (Personal Google Drive)

1. In [Google Cloud Console](https://console.cloud.google.com/), enable the **Google Drive API**, create an **OAuth 2.0 Desktop App** client, and save the JSON as `./secrets/credentials.json`.
2. Run any command (for example, `node-gdrive -l`).
3. Open the printed authorization URL in your browser and approve access. `node-gdrive` captures the callback automatically via a temporary local loopback server (`http://127.0.0.1:<port>/oauth2callback`, PKCE + `state`) and saves `./secrets/token.json` with `0600` permissions.

---

## Common Usage Examples

```bash
# List files (human-readable or JSON for scripts)
node-gdrive -l
node-gdrive -l --json

# Back up files or globs to a nested folder (creating missing folders)
node-gdrive -b "src/*" -b package.json -f backups/app -c -r

# Back up as a ZIP archive, excluding logs, with client-side AES-256-GCM encryption
BACKUP_ENCRYPTION_KEY="my-strong-passphrase" \
  node-gdrive -b "./data/*" --exclude "*.log" -z backup.zip -f backups -c -r --encrypt

# Download and decrypt a backup
BACKUP_ENCRYPTION_KEY="my-strong-passphrase" \
  node-gdrive --download backup.zip.enc -f backups -o ./backup.zip --encrypt

# Pipe a PostgreSQL dump directly to Google Drive without writing to disk
pg_dump mydb | node-gdrive --stdin --name mydb.sql -f backups/pg -c

# Preview retention cleanup safely before deleting anything
node-gdrive -f backups/daily -d 30d --keep-last 5 --dry-run

# Nightly cron job: MySQL dump + zip + encrypt + prune older than 14 days (keep at least 5)
node-gdrive -m -z -f backups/mysql -c --encrypt && \
  node-gdrive -f backups/mysql -d 14d --keep-last 5
```

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

## CLI Options

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

> Unrecognized units are rejected immediately to prevent accidental deletions.

### Exit Codes

- `0`: Success (or `--help` / `--version`).
- `1`: Runtime or Google Drive API error.
- `2`: Invalid CLI arguments or missing required options.

---

## Using as a Node.js Library

```bash
npm install @d0whc3r/node-gdrive
```

### ESM / TypeScript

```ts
import { GDrive } from '@d0whc3r/node-gdrive';

const gdrive = new GDrive({
  serviceAccountFile: './secrets/service-account.json',
  sharedDriveId: '0AAxxxxxxxxUk9PVA',
  concurrency: 4
});

// Upload with ZIP compression, exclusions, and AES-256-GCM encryption
await gdrive.uploadFiles(['./data/*'], 'backups/daily', {
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

// Delete files older than 14 days while keeping at least the 5 newest
await gdrive.cleanOlder('14d', 'backups/daily', { keepLast: 5 });
```

### CommonJS

```js
const { GDrive } = require('@d0whc3r/node-gdrive');

const gdrive = new GDrive();
gdrive.listFiles().then((files) => console.log(files));
```

---

## Contributing, Security & License

- Want to contribute or build from source? See [CONTRIBUTING.md](./CONTRIBUTING.md).
- Found a security issue? See [SECURITY.md](./SECURITY.md).
- Released under the [MIT License](./LICENSE).
