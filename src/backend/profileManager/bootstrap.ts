/**
 * Side-effect module. Must be the FIRST import of backend/main.ts so the
 * active profile is applied before any Heroic module resolves or opens files
 * under <appData>/heroic (config, store auth, Chromium cookies...).
 */
import { ProfileManager } from './ProfileManager'

if (process.env.CI !== 'e2e') {
  try {
    ProfileManager.getInstance().applyActiveProfile()
  } catch (error) {
    console.error('[ProfileManager] Failed to apply active profile:', error)
  }
}
