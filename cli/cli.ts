import { styleText } from 'node:util';
import Config from '../src/config';
import { getUsageGuide, getVersion, parseCliArgs } from './cliconfig';
import { Cli } from './climodule';
import { selfUpdate } from './updater';

async function main(): Promise<void> {
  const opts = parseCliArgs(process.argv.slice(2));
  if (opts.version) {
    console.info(getVersion());
    process.exitCode = 0;
    return;
  }
  if (opts.update) {
    const isQuiet = Boolean(opts.quiet || opts.json);
    const result = await selfUpdate({
      repo: 'd0whc3r/node-gdrive',
      binName: 'node-gdrive',
      npmPackage: '@d0whc3r/node-gdrive',
      currentVersion: getVersion(),
      tag: Config.TAG,
      dryRun: opts['dry-run'],
      logger: isQuiet ? { info: () => undefined, warn: () => undefined } : console
    });
    if (opts.json) {
      console.info(JSON.stringify(result, null, 2));
    }
    process.exitCode = 0;
    return;
  }
  if (opts.help || Object.keys(opts).length === 0) {
    console.info(getUsageGuide());
    process.exitCode = 0;
    return;
  }
  await new Cli(opts).parseOptions();
  process.exitCode = 0;
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(styleText(['bold', 'red'], `[-] Error: ${message}`));
  process.exitCode = 1;
});
