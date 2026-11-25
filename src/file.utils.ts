import * as fs from 'node:fs';
import * as path from 'node:path';
import Config from './config';

export default class FileUtils {
  public static mkdirp(targetDir: string): void {
    const resolved = path.resolve(targetDir);
    fs.mkdirSync(resolved, { recursive: true });
    console.info(`${Config.TAG} Result file ${resolved}`);
  }
}
