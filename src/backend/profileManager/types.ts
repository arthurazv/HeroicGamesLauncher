export interface Profile {
  id: string // UUID v4
  name: string
  avatar?: string
  createdAt?: number
  lastUsed?: number
}

export interface IProfileApi {
  listProfiles: () => Promise<Profile[]>
  getActiveProfile: () => Promise<Profile | null>
  createProfile: (name: string, avatar?: string) => Promise<Profile>
  deleteProfile: (id: string) => Promise<boolean>
  renameProfile: (id: string, name: string) => Promise<Profile>
  switchProfile: (id: string) => Promise<void>
}

declare global {
  interface Window {
    profileApi?: IProfileApi
  }
}
