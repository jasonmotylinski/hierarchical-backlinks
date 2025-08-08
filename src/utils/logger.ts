// Set DEBUG flag to true to enable debug logging
export class Logger {
  static DEBUG = false;
  static debug(enabled: boolean, ...args: any[]) {
    if (Logger.DEBUG && enabled) console.debug(...args);
  }
}