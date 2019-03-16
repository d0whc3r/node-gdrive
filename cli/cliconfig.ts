import commandLineArgs = require('command-line-args');
import commandLineUsage = require('command-line-usage');
import { OptionDefinition, Section } from 'command-line-usage';
import { CommandLineOptions } from 'command-line-args';

const optionDefinitions: OptionDefinition[] = [
  {
    name: 'list',
    alias: 'l',
    multiple: false,
    type: Boolean,
    description: 'List all files and folders',
  },
  {
    name: 'backup',
    alias: 'b',
    typeLabel: '{underline file*} ',
    multiple: true,
    type: String,
    description: 'Backup files',
  },
  {
    name: 'zip',
    alias: 'z',
    typeLabel: '{underline zipname.zip}',
    multiple: false,
    type: String,
    description: 'Zip backup files',
  },
  {
    name: 'replace',
    alias: 'r',
    multiple: false,
    type: Boolean,
    description: 'Replace files if already exists when backup upload',
  },
  {
    name: 'create',
    alias: 'c',
    multiple: false,
    defaultValue: true,
    type: Boolean,
    description: 'Create destination upload folder (default = true)',
  },
  {
    name: 'folder',
    alias: 'f',
    typeLabel: '{underline foldername}',
    multiple: false,
    type: String,
    description: 'Folder name to upload file/s',
  },
  {
    name: 'delete',
    alias: 'd',
    typeLabel: '{underline foldername=duration}',
    multiple: true,
    type: String,
    description: 'Clean files older than duration in foldername',
  },
  {
    name: 'mysql',
    alias: 'm',
    multiple: false,
    type: Boolean,
    description: 'Mysql backup using environment variables to connect mysql server ($MYSQL_USER, $MYSQL_PASSWORD, $MYSQL_DATABASE, $MYSQL_HOST, $MYSQL_PORT)',
  },
  {
    name: 'help',
    alias: 'h',
    description: 'Print this usage guide.',
    type: Boolean,
  },
];

export interface GDriveOptions extends CommandLineOptions {
  help?: boolean;
  list?: boolean;
  backup?: string | string[];
  folder?: string;
  zip?: string;
  create?: boolean;
  replace?: boolean;
  delete?: string;
  mysql?: boolean;
}

let options: GDriveOptions = {} as GDriveOptions;
try {
  options = commandLineArgs(optionDefinitions);
} catch (e) {
  console.error('[-] Error:', e.message);
  process.exit(1);
}

if (options.help || !Object.keys(options).length) {
  const ex = 'gdrive';
  const sections: Section[] = [
    {
      header: `Help for ${ex}`,
      content: `Usage of npm {italic ${ex}} in command line.`,
    },
    {
      header: 'Options',
      optionList: optionDefinitions,
    },
    {
      header: 'Examples',
      content: [
        {
          desc: '1. List files.',
          example: `$ ${ex} -l`,
        },
        {
          desc: '2. Backup multiple files to "backupFolder" folder.',
          example: `$ ${ex} -b src/index.ts -b images/logo.png -f backupFolder`,
        },
        {
          desc: '3. Backup files using wildcard to "backup" folder.',
          example: `$ ${ex} -b src/* -b images/* -f backup`,
        },
        {
          desc: '4. Backup files using wildcard and zip into "zipped" folder folder will be created if it doesn\'t exists.',
          example: `$ ${ex} -b src/* -b images/* -z -f zipped.zip -c`,
        },
        {
          desc: '5. Backup files using wildcard and zip using "allfiles.zip" as filename into "zipped" folder folder will be created if it doesn\'t exists and zipfile will be replaced if it exists',
          example: `$ ${ex} -b src/* -b images/* -z allfiles.zip -f zipped -c -r`,
        },
        {
          desc: '6. Delete files in "uploads" folder older than 2days and files in "monthly" folder older than 1month',
          example: `$ ${ex} -d uploads=2d -d monthly=1M`,
        },
        {
          desc: '7. Delete files in "uploads" folder older than 1minute',
          example: `$ ${ex} -f uploads -d 1m`,
        },
        {
          desc: '8. Generate mysql dump file zip it and upload to "mysql-backup" folder',
          example: `$ ${ex} -f mysql-backup -m -z`,
        },
      ],
    },
  ];
  console.log(commandLineUsage(sections));
  process.exit(1);
}

export { options };
