// eslint-disable-next-line no-restricted-imports
import { contextBridge, ipcRenderer } from 'electron'
import { IProfileApi } from '../backend/profileManager/types'

export const profileApi: IProfileApi = {
  listProfiles: () => ipcRenderer.invoke('heroic:profile:list'),
  getActiveProfile: () => ipcRenderer.invoke('heroic:profile:getActive'),
  createProfile: (name, avatarPath) => ipcRenderer.invoke('heroic:profile:create', name, avatarPath),
  deleteProfile: (id) => ipcRenderer.invoke('heroic:profile:delete', id),
  switchProfile: (id) => ipcRenderer.invoke('heroic:profile:switch', id),
  renameProfile: (id, name) => ipcRenderer.invoke('heroic:profile:rename', id, name)
}

contextBridge.exposeInMainWorld('profileApi', profileApi)
