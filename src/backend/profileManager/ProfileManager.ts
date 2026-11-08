import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as crypto from 'crypto'
import { app } from 'electron'
import { Profile } from './types'

/**
 * Profile store layout (compatible with heroic-profile-manager.py):
 *
 *   <baseDir>/profiles.json          -> Profile[]
 *   <baseDir>/active                 -> active profile id
 *   <baseDir>/profiles/<id>/heroic   -> full Heroic config dir for that profile
 *
 * The live Heroic dir (<appData>/heroic, e.g. ~/.config/heroic) is a symlink
 * to the active profile's `heroic` folder. It is (re)pointed only at startup,
 * before any other Heroic module touches it (see bootstrap.ts).
 */
export interface ProfileManagerOptions {
  baseDir?: string
  appDataDir?: string
}

const APP_FOLDER = 'heroic'
const SHARED_TOOLS_FOLDER = 'heroic_shared_tools'

function defaultBaseDir(): string {
  const dataHome =
    process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
  return path.join(dataHome, 'heroic-profiles')
}

function defaultAppDataDir(): string {
  try {
    return app.getPath('appData')
  } catch {
    return path.join(os.homedir(), '.config')
  }
}

function lstatSafe(p: string): fs.Stats | null {
  try {
    return fs.lstatSync(p)
  } catch {
    return null
  }
}

function moveSync(src: string, dst: string): void {
  try {
    fs.renameSync(src, dst)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e
    fs.cpSync(src, dst, { recursive: true, verbatimSymlinks: true })
    fs.rmSync(src, { recursive: true, force: true })
  }
}

export class ProfileManager {
  private static instance: ProfileManager | null = null

  readonly baseDir: string
  readonly profilesDir: string
  readonly manifestPath: string
  readonly activePath: string
  readonly liveDir: string
  readonly sharedToolsDir: string

  constructor(opts: ProfileManagerOptions = {}) {
    const appDataDir = opts.appDataDir || defaultAppDataDir()
    this.baseDir = opts.baseDir || defaultBaseDir()
    this.profilesDir = path.join(this.baseDir, 'profiles')
    this.manifestPath = path.join(this.baseDir, 'profiles.json')
    this.activePath = path.join(this.baseDir, 'active')
    this.liveDir = path.join(appDataDir, APP_FOLDER)
    this.sharedToolsDir = path.join(appDataDir, SHARED_TOOLS_FOLDER)
  }

  static getInstance(): ProfileManager {
    if (!ProfileManager.instance) ProfileManager.instance = new ProfileManager()
    return ProfileManager.instance
  }

  static resetInstance(): void {
    ProfileManager.instance = null
  }

  profileHeroicDir(id: string): string {
    return path.join(this.profilesDir, id, APP_FOLDER)
  }

  /**
   * Makes <appData>/heroic point at the active profile.
   * MUST run before any Heroic module reads or writes the config dir.
   */
  applyActiveProfile(): void {
    fs.mkdirSync(this.profilesDir, { recursive: true })
    fs.mkdirSync(this.sharedToolsDir, { recursive: true })

    let profiles = this.readManifest()
    let activeId = this.readActive()

    if (profiles.length === 0) {
      profiles = [this.newEntry('Main')]
      this.writeManifest(profiles)
    }
    if (!activeId || !profiles.some((p) => p.id === activeId)) {
      activeId = profiles[0].id
      this.writeActive(activeId)
    }

    const target = this.profileHeroicDir(activeId)

    // First run without the old script: ~/.config/heroic is a real folder.
    // Adopt it as the active profile's data (or back it up if the profile
    // already has data) so nothing is lost.
    const liveStat = lstatSafe(this.liveDir)
    if (liveStat && !liveStat.isSymbolicLink()) {
      const targetHasData =
        fs.existsSync(target) && fs.readdirSync(target).length > 0
      if (targetHasData) {
        moveSync(this.liveDir, `${this.liveDir}.backup-${Date.now()}`)
      } else {
        fs.rmSync(target, { recursive: true, force: true })
        fs.mkdirSync(path.dirname(target), { recursive: true })
        moveSync(this.liveDir, target)
      }
    }

    fs.mkdirSync(target, { recursive: true })
    this.linkSharedTools(target)
    this.pointLiveDirTo(target)
  }

  private pointLiveDirTo(target: string): void {
    const stat = lstatSafe(this.liveDir)
    const symlinkType = process.platform === 'win32' ? 'junction' : 'dir'
    if (
      stat?.isSymbolicLink() &&
      path.resolve(fs.readlinkSync(this.liveDir)) === path.resolve(target)
    ) {
      return
    }
    if (stat && process.platform === 'win32') {
      fs.rmSync(this.liveDir, { recursive: true, force: true })
      fs.symlinkSync(target, this.liveDir, symlinkType)
    } else {
      const tmpLink = `${this.liveDir}.profile-tmp-${process.pid}`
      if (lstatSafe(tmpLink)) fs.unlinkSync(tmpLink)
      fs.symlinkSync(target, tmpLink, symlinkType)
      fs.renameSync(tmpLink, this.liveDir)
    }
  }

  /** Makes <profile>/tools a symlink to the shared Wine/Proton folder. */
  linkSharedTools(profileHeroicDir: string): void {
    fs.mkdirSync(this.sharedToolsDir, { recursive: true })
    const toolsPath = path.join(profileHeroicDir, 'tools')
    const stat = lstatSafe(toolsPath)
    const symlinkType = process.platform === 'win32' ? 'junction' : 'dir'
    if (stat?.isSymbolicLink()) {
      if (
        path.resolve(fs.readlinkSync(toolsPath)) ===
        path.resolve(this.sharedToolsDir)
      )
        return
      fs.unlinkSync(toolsPath)
    }
    if (stat?.isDirectory()) {
      for (const item of fs.readdirSync(toolsPath)) {
        const dst = path.join(this.sharedToolsDir, item)
        if (!fs.existsSync(dst)) moveSync(path.join(toolsPath, item), dst)
      }
      fs.rmSync(toolsPath, { recursive: true, force: true })
    }
    fs.symlinkSync(this.sharedToolsDir, toolsPath, symlinkType)
  }

  listProfiles(): Profile[] {
    return this.readManifest()
  }

  getActiveProfile(): Profile | null {
    const activeId = this.readActive()
    return this.readManifest().find((p) => p.id === activeId) || null
  }

  createProfile(name: string, avatar?: string): Profile {
    const profiles = this.readManifest()
    const entry = this.newEntry(name.trim() || 'New Player', avatar)
    const dir = this.profileHeroicDir(entry.id)
    fs.mkdirSync(dir, { recursive: true })
    this.linkSharedTools(dir)
    profiles.push(entry)
    this.writeManifest(profiles)
    return entry
  }

  renameProfile(id: string, name: string): Profile {
    const profiles = this.readManifest()
    const p = profiles.find((x) => x.id === id)
    if (!p) throw new Error(`Profile ${id} not found.`)
    p.name = name.trim() || p.name
    this.writeManifest(profiles)
    return p
  }

  deleteProfile(id: string): boolean {
    const profiles = this.readManifest()
    if (profiles.length <= 1) {
      throw new Error('Cannot delete the only existing profile.')
    }
    if (this.readActive() === id) {
      throw new Error('Cannot delete the currently active profile.')
    }
    const idx = profiles.findIndex((p) => p.id === id)
    if (idx === -1) return false
    profiles.splice(idx, 1)
    this.writeManifest(profiles)
    fs.rmSync(path.join(this.profilesDir, id), { recursive: true, force: true })
    return true
  }

  /**
   * Marks the target as active and restarts Heroic. The symlink swap happens
   * in the new process (bootstrap.ts), after this one has fully exited.
   */
  switchProfile(id: string): Promise<void> {
    const profiles = this.readManifest()
    const target = profiles.find((p) => p.id === id)
    if (!target) throw new Error(`Profile ${id} not found.`)
    if (this.readActive() === id) return Promise.resolve()

    target.lastUsed = Date.now()
    this.writeManifest(profiles)
    this.writeActive(id)

    if (typeof app?.relaunch === 'function') {
      app.relaunch({ args: process.argv.slice(1) })
      app.exit(0)
    }
    return Promise.resolve()
  }

  // ---- persistence -------------------------------------------------------

  private newEntry(name: string, avatar?: string): Profile {
    const now = Date.now()
    return {
      id: crypto.randomUUID(),
      name,
      ...(avatar ? { avatar } : {}),
      createdAt: now,
      lastUsed: now
    }
  }

  private readManifest(): Profile[] {
    try {
      const data: unknown = JSON.parse(
        fs.readFileSync(this.manifestPath, 'utf-8')
      )
      return Array.isArray(data) ? (data as Profile[]) : []
    } catch {
      return []
    }
  }

  private writeManifest(profiles: Profile[]): void {
    fs.mkdirSync(this.baseDir, { recursive: true })
    const tmp = `${this.manifestPath}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(profiles, null, 2), 'utf-8')
    fs.renameSync(tmp, this.manifestPath)
  }

  private readActive(): string {
    try {
      return fs.readFileSync(this.activePath, 'utf-8').trim()
    } catch {
      return ''
    }
  }

  private writeActive(id: string): void {
    fs.mkdirSync(this.baseDir, { recursive: true })
    const tmp = `${this.activePath}.tmp`
    fs.writeFileSync(tmp, id, 'utf-8')
    fs.renameSync(tmp, this.activePath)
  }
}
