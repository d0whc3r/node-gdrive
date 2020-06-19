import { Cli } from './climodule';

(async () => {
  await new Cli().parseOptions();
})();
