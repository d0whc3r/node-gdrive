# node-gdrive

CLI and Node.js library to back up, restore, encrypt, and prune **files and databases (PostgreSQL, MySQL/MariaDB, MongoDB, SQLite)** on **Google Drive**—works via **Docker**, **npx/npm**, or as a **standalone binary** (Linux, macOS, Windows).

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

# Back up PostgreSQL / MySQL / MariaDB / MongoDB using the :db image variant
# (includes pg_dump, mariadb-dump, and mongodump; SQLite works in both images)
docker run --rm \
  -v "$PWD/secrets:/app/secrets:ro" \
  -e DATABASE_URL="postgresql://user:pass@host:5432/mydb" \
  d0whc3r/gdrive:db --db postgres -f backups/pg -c --encrypt
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

Install the prebuilt binary on **Linux (`x64`)** or **macOS (`arm64`)** with a single command:

```bash
curl -fsSL https://raw.githubusercontent.com/d0whc3r/node-gdrive/master/install.sh | sh
```

Optional installer overrides:

```bash
# Pin a specific version or custom install directory
VERSION=v3.6.0 INSTALL_DIR="$HOME/.local/bin" \
  curl -fsSL https://raw.githubusercontent.com/d0whc3r/node-gdrive/master/install.sh | sh
```

Update an installed standalone binary in place at any time (no Google Drive credentials required):

```bash
node-gdrive --update            # Check GitHub Releases and replace binary atomically
node-gdrive --update --dry-run  # Check if a newer release is available without modifying the binary
node-gdrive --update --json     # Output machine-readable update status
```

_(If installed via `npm`/`npx`, `--update` detects the Node.js runtime safely and prints the `npm install -g @d0whc3r/node-gdrive@latest` command instead of touching the binary. On Windows `x64`, download `node-gdrive-win-x64.exe` from [GitHub Releases](https://github.com/d0whc3r/node-gdrive/releases); `--update` works on Windows too.)_

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

## Database Backups

`node-gdrive` supports native backups for **PostgreSQL**, **MySQL / MariaDB**, **MongoDB**, and **SQLite** without piping through `--stdin`.

| Engine              | CLI Flag / Aliases                   | Underlying Method                                                           | Mode                                        | Docker Image                                    |
| ------------------- | ------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------- |
| **PostgreSQL**      | `--db postgres` (`pg`, `postgresql`) | `pg_dump` (`plain`, `custom`, `tar`)                                        | Direct stream (`O(1)` RAM, zero temp disk)  | `d0whc3r/gdrive:db`                             |
| **MySQL / MariaDB** | `--db mysql` (`mariadb`, `-m`)       | `mysqldump` / `mariadb-dump` (auto-fallback to pure-JS `mysqldump`)         | Direct stream (or temp file on JS fallback) | `d0whc3r/gdrive:db` _(or slim via JS fallback)_ |
| **MongoDB**         | `--db mongodb` (`mongo`)             | `mongodump --archive`                                                       | Direct stream (`O(1)` RAM, zero temp disk)  | `d0whc3r/gdrive:db`                             |
| **SQLite**          | `--db sqlite` (`sqlite3`)            | Node.js built-in `node:sqlite` online backup (WAL-safe, zero external deps) | Temp file (`0600`, auto-cleaned)            | `d0whc3r/gdrive:latest` & `:db`                 |

> **Streaming & Compression:** Without `-z`/`--zip`, PostgreSQL, MySQL/MariaDB, and MongoDB stream directly into Google Drive (and optional `--encrypt` AES-256-GCM) with zero temp disk space. Adding `-z` compresses the dump into a ZIP archive in a `0700` temp directory before uploading.
>
> **Credential Safety:** Passwords are never passed as CLI arguments (`ps`-safe). They are injected via `PGPASSWORD`, `MYSQL_PWD`, or a temporary `0600` `mongodump --config` file that is removed immediately after the dump finishes.

### Engine Examples

```bash
# PostgreSQL using standard PG* environment variables
PGHOST=db.internal PGUSER=postgres PGPASSWORD=secret PGDATABASE=app \
  node-gdrive --db postgres -f backups/pg -c --encrypt

# PostgreSQL custom binary format (.dump) via connection URI (auto-detects engine)
node-gdrive --db-url "postgresql://postgres:secret@db.internal:5432/app?sslmode=require" \
  --db-format custom -f backups/pg -c --encrypt

# MySQL / MariaDB (via --db mysql, --db mariadb, -m, or URI)
node-gdrive --db-url "mariadb://root:secret@127.0.0.1:3306/shop" -f backups/mysql -c

# MongoDB single-file archive via MONGODB_URI or --db-url
MONGODB_URI="mongodb+srv://user:secret@cluster.example.com/orders" \
  node-gdrive --db mongodb -f backups/mongo -c --encrypt

# SQLite online backup (safe while the database is in active WAL use)
node-gdrive --db sqlite --db-url "sqlite:///var/data/app.sqlite" -z -f backups/sqlite -c

# Docker (:db variant bundles pg_dump, mariadb-dump, and mongodump)
docker run --rm \
  -v "$PWD/secrets:/app/secrets:ro" \
  -e DATABASE_URL="postgresql://postgres:secret@host.docker.internal:5432/app" \
  -e BACKUP_ENCRYPTION_KEY="my-strong-passphrase" \
  d0whc3r/gdrive:db --db postgres -f backups/pg -c --encrypt
```

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

# Native database backups (PostgreSQL, MySQL/MariaDB, MongoDB, SQLite)
node-gdrive --db postgres -f backups/pg -c --encrypt
node-gdrive --db-url "postgresql://user:pass@host:5432/mydb" --db-format custom -f backups/pg -c
node-gdrive --db-url "mongodb+srv://user:pass@cluster/mydb" -f backups/mongo -c --encrypt
node-gdrive --db sqlite --db-url "sqlite:///var/data/app.sqlite" -z -f backups/sqlite -c

# Preview retention cleanup safely before deleting anything
node-gdrive -f backups/daily -d 30d --keep-last 5 --dry-run

# Nightly cron job: PostgreSQL dump + encrypt + prune older than 14 days (keep at least 5)
node-gdrive --db postgres -f backups/pg -c --encrypt && \
  node-gdrive -f backups/pg -d 14d --keep-last 5
```

---

## Environment Variables

| Variable                                                                                                     | Description                                               | Default                      |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ---------------------------- |
| `GOOGLE_APPLICATION_CREDENTIALS`                                                                             | Path to Service Account JSON key (standard GCP var)       | —                            |
| `SERVICE_ACCOUNT_FILE`                                                                                       | Alias for Service Account JSON key path                   | —                            |
| `CREDENTIALS_FILE`                                                                                           | Path to OAuth2 Desktop `credentials.json`                 | `./secrets/credentials.json` |
| `TOKEN_FILE`                                                                                                 | Path to stored OAuth2 `token.json` (`0600`)               | `./secrets/token.json`       |
| `BACKUP_ENCRYPTION_KEY`                                                                                      | Passphrase for `--encrypt` (AES-256-GCM)                  | —                            |
| `DATABASE_URL`                                                                                               | Connection URI (auto-detects Postgres/MySQL/Mongo/SQLite) | —                            |
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGSSLMODE`                                        | PostgreSQL connection for `--db postgres`                 | `localhost:5432`             |
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`                                 | MySQL / MariaDB connection for `--db mysql` / `--mysql`   | `localhost:3306`             |
| `MONGODB_URI`, `MONGO_HOST`, `MONGO_PORT`, `MONGO_USER`, `MONGO_PASSWORD`, `MONGO_DATABASE`, `MONGO_AUTH_DB` | MongoDB connection for `--db mongodb`                     | `localhost:27017`            |
| `SQLITE_PATH`                                                                                                | SQLite database file path for `--db sqlite`               | —                            |

See [example.env](./example.env) for a ready-to-copy template.

---

## CLI Options

| Flag                       | Alias | Description                                                              |
| -------------------------- | ----- | ------------------------------------------------------------------------ |
| `--list`                   | `-l`  | List files and folders                                                   |
| `--backup <file*>`         | `-b`  | Upload files, directories, or globs (repeatable)                         |
| `--download <id-or-name>`  | —     | Download a file by ID or name                                            |
| `--output <path>`          | `-o`  | Local destination path for `--download`                                  |
| `--folder <path>`          | `-f`  | Destination folder path (supports nested paths like `backups/daily`)     |
| `--zip [filename.zip]`     | `-z`  | Compress backup files into a ZIP archive                                 |
| `--exclude <glob>`         | —     | Exclude files matching glob pattern (repeatable)                         |
| `--replace`                | `-r`  | Replace existing file in target folder on upload                         |
| `--create`                 | `-c`  | Create destination folder(s) if they do not exist                        |
| `--delete <rule>`          | `-d`  | Delete files older than duration (`folder=7d` or `7d`, repeatable)       |
| `--keep-last <N>`          | —     | Always preserve the N newest matching files when deleting                |
| `--dry-run`                | —     | Preview uploads/deletions without modifying Drive                        |
| `--encrypt`                | —     | Encrypt on upload / decrypt on download using `$BACKUP_ENCRYPTION_KEY`   |
| `--stdin`                  | —     | Read upload payload from standard input (requires `--name`)              |
| `--name <filename>`        | —     | Destination filename when using `--stdin` or custom dump name for `--db` |
| `--db <engine>`            | —     | Native DB backup: `postgres`, `mysql` (`mariadb`), `mongodb`, `sqlite`   |
| `--db-url <uri>`           | —     | Database connection URI (auto-detects engine from scheme)                |
| `--db-format <fmt>`        | —     | PostgreSQL dump format: `plain` (`.sql`), `custom` (`.dump`), `tar`      |
| `--mysql`                  | `-m`  | Alias for `--db mysql`                                                   |
| `--drive-id <id>`          | —     | Target a Google Workspace Shared Drive                                   |
| `--service-account <path>` | —     | Path to a Service Account JSON key                                       |
| `--json`                   | —     | Output machine-readable JSON (ideal for CI/scripts)                      |
| `--quiet`                  | `-q`  | Suppress informational logs                                              |
| `--update`                 | `-u`  | Update standalone binary to latest GitHub release (supports `--dry-run`) |
| `--version`                | `-v`  | Print CLI version                                                        |
| `--help`                   | `-h`  | Print usage guide                                                        |

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

- `0`: Success (or `--help` / `--version` / `--update`).
- `1`: Runtime or Google Drive API error.
- `2`: Invalid CLI arguments or missing required options.

---

## Using as a Node.js Library

```bash
npm install @d0whc3r/node-gdrive
```

### ESM / TypeScript

```ts
import { dumpDatabase, GDrive } from '@d0whc3r/node-gdrive';

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

// Stream a PostgreSQL dump directly to Google Drive with client-side encryption
const dump = await dumpDatabase({
  url: process.env.DATABASE_URL,
  format: 'custom'
});
try {
  if (dump.kind === 'stream') {
    await gdrive.uploadStream(dump.stream, dump.filename, 'backups/pg', {
      create: true,
      encryptKey: process.env.BACKUP_ENCRYPTION_KEY,
      mimeType: dump.mimeType
    });
    await dump.wait();
  } else {
    await gdrive.uploadFile(dump.filePath, 'backups/pg', {
      create: true,
      encryptKey: process.env.BACKUP_ENCRYPTION_KEY
    });
  }
} finally {
  await dump.cleanup();
}

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
