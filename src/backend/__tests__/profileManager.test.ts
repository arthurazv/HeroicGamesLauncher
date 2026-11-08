import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { ProfileManager } from '../profileManager/ProfileManager'

describe('ProfileManager', () => {
  let root: string
  let baseDir: string
  let appDataDir: string
  let pm: ProfileManager

  const live = () => path.join(appDataDir, 'heroic')

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'heroic-profiles-'))
    baseDir = path.join(root, 'store')
    appDataDir = path.join(root, 'config')
    fs.mkdirSync(appDataDir, { recursive: true })
    pm = new ProfileManager({ baseDir, appDataDir })
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  test('applyActiveProfile(): adopts existing real directory as "Main" profile and creates symlink', () => {
    fs.mkdirSync(path.join(live(), 'gog_store'), { recursive: true })
    fs.writeFileSync(
      path.join(live(), 'gog_store', 'auth.json'),
      '{"user":"player1"}'
    )

    pm.applyActiveProfile()

    const active = pm.getActiveProfile()!
    expect(active.name).toBe('Main')
    expect(fs.lstatSync(live()).isSymbolicLink()).toBe(true)
    expect(fs.readlinkSync(live())).toBe(pm.profileHeroicDir(active.id))
    expect(
      fs.readFileSync(path.join(live(), 'gog_store', 'auth.json'), 'utf-8')
    ).toBe('{"user":"player1"}')
  })

  test('applyActiveProfile(): reuses existing python script store', () => {
    const id = '13f2d1f7-1eba-494c-a9f1-72dceb771c95'
    fs.mkdirSync(path.join(baseDir, 'profiles', id, 'heroic'), {
      recursive: true
    })
    fs.writeFileSync(
      path.join(baseDir, 'profiles.json'),
      JSON.stringify([{ id, name: 'Player 2', avatar: '/x.svg' }])
    )
    fs.writeFileSync(path.join(baseDir, 'active'), id)

    pm.applyActiveProfile()

    expect(pm.listProfiles()).toHaveLength(1)
    expect(pm.getActiveProfile()?.name).toBe('Player 2')
    expect(fs.readlinkSync(live())).toBe(pm.profileHeroicDir(id))
  })

  test('switchProfile(): isolates data so each profile only sees its own auth', async () => {
    pm.applyActiveProfile()
    const p1 = pm.getActiveProfile()!
    fs.mkdirSync(path.join(live(), 'gog_store'), { recursive: true })
    fs.writeFileSync(
      path.join(live(), 'gog_store', 'auth.json'),
      'P1_AUTH_DATA'
    )

    const p2 = pm.createProfile('Player 2')
    await pm.switchProfile(p2.id) // updates "active"; relaunch is no-op in Jest
    new ProfileManager({ baseDir, appDataDir }).applyActiveProfile() // simulates new process

    expect(fs.readlinkSync(live())).toBe(pm.profileHeroicDir(p2.id))
    expect(fs.existsSync(path.join(live(), 'gog_store', 'auth.json'))).toBe(
      false
    )

    await pm.switchProfile(p1.id)
    new ProfileManager({ baseDir, appDataDir }).applyActiveProfile()
    expect(
      fs.readFileSync(path.join(live(), 'gog_store', 'auth.json'), 'utf-8')
    ).toBe('P1_AUTH_DATA')
  })

  test('createProfile(): creates heroic folder with tools symlinked to heroic_shared_tools', () => {
    pm.applyActiveProfile()
    const p = pm.createProfile('Guest')
    const tools = path.join(pm.profileHeroicDir(p.id), 'tools')

    expect(pm.listProfiles().map((x) => x.name)).toContain('Guest')
    expect(fs.lstatSync(tools).isSymbolicLink()).toBe(true)
    expect(fs.readlinkSync(tools)).toBe(
      path.join(appDataDir, 'heroic_shared_tools')
    )

    // Break the symlink
    fs.unlinkSync(tools)
    fs.symlinkSync('/nonexistent/path', tools, 'dir')

    // Heal the symlink
    pm.linkSharedTools(pm.profileHeroicDir(p.id))

    // Verify the symlink is healed
    expect(fs.readlinkSync(tools)).toBe(
      path.join(appDataDir, 'heroic_shared_tools')
    )
  })

  test('deleteProfile(): blocks deleting active/only profile and removes inactive profile from disk', () => {
    pm.applyActiveProfile()
    const active = pm.getActiveProfile()!
    expect(() => pm.deleteProfile(active.id)).toThrow()

    const p2 = pm.createProfile('Secondary')
    expect(() => pm.deleteProfile(active.id)).toThrow()
    expect(pm.deleteProfile(p2.id)).toBe(true)
    expect(pm.listProfiles()).toHaveLength(1)
    expect(fs.existsSync(path.join(baseDir, 'profiles', p2.id))).toBe(false)
  })
})
