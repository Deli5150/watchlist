import pkg from '../package.json'

/** WatchLine's version (package.json is the one place it's set; app.config.ts and the desktop build read it too). */
export const VERSION: string = pkg.version
