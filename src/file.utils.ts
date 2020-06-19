import * as path from 'path';
import * as fs from 'fs';
import Config from './config';

export default class FileUtils {
  public static mkdirp(targetDir: string): void {
    const sep = path.sep;
    const initDir = path.isAbsolute(targetDir) ? sep : '';
    const fileResult = targetDir.split(sep).reduce((parentDir, childDir) => {
      const curDir = path.resolve(parentDir, childDir);
      if (!fs.existsSync(curDir)) {
        fs.mkdirSync(curDir);
      }

      return curDir;
    }, initDir);
    console.info(`${Config.TAG} Result file ${fileResult}`);
  }
}
