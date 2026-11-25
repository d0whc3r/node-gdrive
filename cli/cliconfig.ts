import commandLineArgs, { CommandLineOptions } from 'command-line-args';
import commandLineUsage, { OptionDefinition, Section } from 'command-line-usage';
import pkg from '../package.json' with { type: 'json' };

export const optionDefinitions: OptionDefinition[] = [
  {
    name: 'list',
    alias: 'l',
    multiple: false,
    type: Boolean,
    description: 'List all files and folders'
  },
  {
    name: 'backup',
    alias: 'b',
    typeLabel: '{underline file*}',
    defaultOption: true,
    multiple: true,
    type: String,
    description: 'Backup files, directories, or globs'
  },
  {
    name: 'download',
    typeLabel: '{underline fileId|name}',
    multiple: false,
    type: String,
    description: 'Download/restore a file from Google Drive'
  },
  {
    name: 'output',
    alias: 'o',
    typeLabel: '{underline path}',
    multiple: false,
    type: String,
    description: 'Local destination path for --download'
  },
  {
    name: 'zip',
    alias: 'z',
    typeLabel: '{underline zipname.zip}',
    multiple: false,
    type: String,
    description: 'Zip backup files before uploading'
  },
  {
    name: 'replace',
    alias: 'r',
    multiple: false,
    type: Boolean,
    description: 'Replace files if already exists when uploading'
  },
  {
    name: 'create',
    alias: 'c',
    multiple: false,
    type: Boolean,
    description: 'Create destination upload folder if missing'
  },
  {
    name: 'folder',
    alias: 'f',
    typeLabel: '{underline foldername}',
    multiple: false,
    type: String,
    description: 'Destination or target folder path (supports nested paths like a/b/c)'
  },
  {
    name: 'delete',
    alias: 'd',
    typeLabel: '{underline folder=duration} OR {underline duration}',
    multiple: true,
    type: String,
    description: 'Clean files older than duration (e.g. 7d, 1M, 30m)'
  },
  {
    name: 'keep-last',
    typeLabel: '{underline N}',
    multiple: false,
    type: Number,
    description: 'Always keep the newest N files when cleaning older files'
  },
  {
    name: 'mysql',
    alias: 'm',
    multiple: false,
    type: Boolean,
    description: 'MySQL backup using environment variables ($MYSQL_USER, $MYSQL_PASSWORD, $MYSQL_DATABASE, $MYSQL_HOST, $MYSQL_PORT)'
  },
  {
    name: 'stdin',
    multiple: false,
    type: Boolean,
    description: 'Read upload content from stdin (requires --name)'
  },
  {
    name: 'name',
    typeLabel: '{underline filename}',
    multiple: false,
    type: String,
    description: 'Target filename when uploading from --stdin'
  },
  {
    name: 'encrypt',
    multiple: false,
    type: Boolean,
    description: 'Encrypt uploads / decrypt downloads with AES-256-GCM using $BACKUP_ENCRYPTION_KEY'
  },
  {
    name: 'exclude',
    typeLabel: '{underline glob}',
    multiple: true,
    type: String,
    description: 'Exclude glob pattern(s) when backing up files'
  },
  {
    name: 'dry-run',
    multiple: false,
    type: Boolean,
    description: 'Preview uploads or deletions without modifying Google Drive'
  },
  {
    name: 'drive-id',
    typeLabel: '{underline id}',
    multiple: false,
    type: String,
    description: 'Google Shared Drive ID'
  },
  {
    name: 'service-account',
    typeLabel: '{underline path}',
    multiple: false,
    type: String,
    description: 'Path to Google Service Account JSON key file'
  },
  {
    name: 'json',
    multiple: false,
    type: Boolean,
    description: 'Output command results as JSON'
  },
  {
    name: 'quiet',
    alias: 'q',
    multiple: false,
    type: Boolean,
    description: 'Suppress non-essential log output'
  },
  {
    name: 'version',
    alias: 'v',
    multiple: false,
    type: Boolean,
    description: 'Print version number'
  },
  {
    name: 'help',
    alias: 'h',
    description: 'Print this usage guide',
    type: Boolean
  }
];

export interface GDriveOptions extends CommandLineOptions {
  help?: boolean;
  version?: boolean;
  list?: boolean;
  backup?: string | string[];
  download?: string;
  output?: string;
  folder?: string;
  zip?: string | null;
  create?: boolean;
  replace?: boolean;
  delete?: string | string[];
  'keep-last'?: number;
  mysql?: boolean;
  stdin?: boolean;
  name?: string;
  encrypt?: boolean;
  exclude?: string[];
  'dry-run'?: boolean;
  'drive-id'?: string;
  'service-account'?: string;
  json?: boolean;
  quiet?: boolean;
}

export function getVersion(): string {
  return pkg.version;
}

export function getUsageGuide(): string {
  const ex = 'node-gdrive';
  const sections: Section[] = [
    {
      header: `Help for ${ex} v${pkg.version}`,
      content: `Usage of {italic ${ex}} in command line.`
    },
    {
      header: 'Options',
      optionList: optionDefinitions
    },
    {
      header: 'Examples',
      content: [
        {
          desc: '1. List files (or JSON output).',
          example: `$ ${ex} -l --json`
        },
        {
          desc: '2. Backup multiple files to nested folder.',
          example: `$ ${ex} -b src/index.ts -b images/logo.png -f backups/app -c`
        },
        {
          desc: '3. Backup files as encrypted zip excluding logs.',
          example: `$ BACKUP_ENCRYPTION_KEY=secret ${ex} -b ./data/* --exclude "*.log" -z backup.zip -f backups -c -r --encrypt`
        },
        {
          desc: '4. Stream stdin directly to Google Drive.',
          example: `$ pg_dump mydb | ${ex} --stdin --name mydb.sql -f backups/pg -c`
        },
        {
          desc: '5. Download and decrypt a backup.',
          example: `$ BACKUP_ENCRYPTION_KEY=secret ${ex} --download backup.zip.enc -f backups -o ./backup.zip --encrypt`
        },
        {
          desc: '6. Clean files older than 7 days while keeping the 5 newest (dry run).',
          example: `$ ${ex} -f backups -d 7d --keep-last 5 --dry-run`
        },
        {
          desc: '7. Generate MySQL dump, zip, and upload to "mysql-backup" folder.',
          example: `$ ${ex} -f mysql-backup -m -z -c`
        }
      ]
    }
  ];
  return commandLineUsage(sections);
}

export function parseCliArgs(argv?: string[]): GDriveOptions {
  const parsed = commandLineArgs(optionDefinitions, argv ? { argv } : undefined) as GDriveOptions;

  if (parsed['keep-last'] !== undefined) {
    const keepLast = parsed['keep-last'];
    if (!Number.isInteger(keepLast) || keepLast < 0) {
      throw new Error(`Invalid --keep-last value "${String(keepLast)}": expected a non-negative integer.`);
    }
  }

  if (parsed.stdin && !parsed.name) {
    throw new Error('Option --stdin requires --name <filename>.');
  }

  return parsed;
}
