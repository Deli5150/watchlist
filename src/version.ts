import pkg from '../package.json'

/** WatchList's version (package.json is the one place it's set; app.config.ts and the desktop build read it too). */
export const VERSION: string = pkg.version
