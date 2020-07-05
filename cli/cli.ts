import { Cli } from './climodule';

void (async () => {
  await new Cli().parseOptions();
})();
