import { NativeModule, requireOptionalNativeModule } from 'expo'

// Android-only (see android/…/WatchlistUpdaterModule.kt); null on iPhone, which can't install apps itself.
declare class WatchlistUpdaterModule extends NativeModule {
  canInstall(): boolean
  openInstallSettings(): boolean
  install(path: string): boolean
}

export default requireOptionalNativeModule<WatchlistUpdaterModule>('WatchlistUpdater')
