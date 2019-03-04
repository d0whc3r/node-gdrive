export default class Config {
  public static TOKEN_FILE = process.env.TOKEN_FILE || './secrets/token.json';
  public static CREDENTIALS_FILE = process.env.CREDENTIALS_FILE || './secrets/credentials.json';
}
