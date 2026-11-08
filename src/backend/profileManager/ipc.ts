// eslint-disable-next-line no-restricted-imports
import { ipcMain } from 'electron'
import { ProfileManager } from './ProfileManager'

export function registerProfileIpc(): void {
  const pm = ProfileManager.getInstance()

  ipcMain.handle('heroic:profile:list', () => pm.listProfiles())
  ipcMain.handle('heroic:profile:getActive', () => pm.getActiveProfile())
  ipcMain.handle(
    'heroic:profile:create',
    (_, name: string, avatarPath?: string) => pm.createProfile(name, avatarPath)
  )
  ipcMain.handle('heroic:profile:delete', (_, id: string) =>
    pm.deleteProfile(id)
  )
  ipcMain.handle('heroic:profile:switch', async (_, id: string) =>
    pm.switchProfile(id)
  )

  ipcMain.handle('heroic:profile:rename', (_, id: string, name: string) =>
    pm.renameProfile(id, name)
  )
}
