import { styleText } from 'node:util';
import { getUsageGuide, getVersion, parseCliArgs } from './cliconfig';
import { Cli } from './climodule';

async function main(): Promise<void> {
  const opts = parseCliArgs(process.argv.slice(2));
  if (opts.version) {
    console.info(getVersion());
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
