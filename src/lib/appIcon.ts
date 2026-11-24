import { AppState } from 'react-native'
import AppIcons from '../../modules/app-icons/src/AppIconsModule'
import { useStore } from './store'

// Android's launcher icon follows Settings → App Icon. It's switched when the app goes to the
// background: some launchers close an app whose launcher entry changes while it's open.
// (Desktop sets the dock icon straight from Settings; see desktop.setIcon.)

let pending = false

function apply(): void {
  if (!AppIcons || !pending) return
  pending = false
  const id = useStore.getState().settings.appIcon || 'default'
  try {
    if (AppIcons.current() !== id) void AppIcons.set(id).catch((e) => console.warn('[app icon]', e))
  } catch (e) {
    console.warn('[app icon]', e)
  }
}

let started = false
export function startAppIcon(): void {
  if (started || !AppIcons) return
  started = true
  // A choice made before the last time the app closed is applied too.
  pending = true
  AppState.addEventListener('change', (s) => s === 'background' && apply())
}

/** After the setting changes: switched the next time you leave the app. */
export const appIconChanged = (): void => void (pending = true)
