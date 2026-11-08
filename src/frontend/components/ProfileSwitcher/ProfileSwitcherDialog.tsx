import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Users, Plus, Trash2, Check, Loader2, Pencil, X } from 'lucide-react'
import { Modal, ModalHeader, ModalContent } from 'frontend/components/UI/Modal'
import Button from 'frontend/components/UI/Button'
import { Profile } from 'backend/profileManager/types'
import './index.scss'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export const ProfileSwitcherDialog: React.FC<Props> = ({ isOpen, onClose }) => {
  const { t } = useTranslation()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null)
  const [newProfileName, setNewProfileName] = useState('')
  const [isSwitching, setIsSwitching] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const loadData = async () => {
    try {
      if (window.profileApi) {
        const list = await window.profileApi.listProfiles()
        const current = await window.profileApi.getActiveProfile()
        setProfiles(list || [])
        setActiveProfile(current)
      }
    } catch (err) {
      console.error('[ProfileSwitcher] Failed to load profiles:', err)
    }
  }

  useEffect(() => {
    if (isOpen) {
      setIsSwitching(false)
      void loadData()
    }
  }, [isOpen])

  const handleSwitch = async (id: string) => {
    if (activeProfile?.id === id) return
    setIsSwitching(true)
    if (!window.profileApi) return
    try {
      await window.profileApi.switchProfile(id)
    } catch (err) {
      console.error('[ProfileSwitcher] Failed to switch profile:', err)
      setIsSwitching(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newProfileName.trim()) return
    if (!window.profileApi) return
    try {
      await window.profileApi.createProfile(newProfileName.trim())
      setNewProfileName('')
      await loadData()
    } catch (err) {
      console.error('[ProfileSwitcher] Failed to create profile:', err)
    }
  }

  const handleDelete = async (
    e: React.MouseEvent,
    id: string,
    name: string
  ) => {
    e.stopPropagation()
    if (
      window.confirm(
        t(
          'profiles.confirmDelete',
          'Are you sure you want to delete profile "{{name}}"?',
          { name }
        )
      )
    ) {
      if (!window.profileApi) return
      try {
        await window.profileApi.deleteProfile(id)
        await loadData()
      } catch (err) {
        console.error('[ProfileSwitcher] Failed to delete profile:', err)
      }
    }
  }

  const handleRename = (
    e: React.MouseEvent,
    id: string,
    currentName: string
  ) => {
    e.stopPropagation()
    setEditingId(id)
    setEditingName(currentName)
  }

  const handleSave = async (id: string, newName: string) => {
    const trimmed = newName.trim()
    const current = profiles.find((p) => p.id === id)?.name
    if (trimmed && trimmed !== current) {
      if (!window.profileApi) return
      try {
        await window.profileApi.renameProfile(id, trimmed)
        await loadData()
      } catch (err) {
        console.error('[ProfileSwitcher] Failed to rename profile:', err)
      }
    }
    handleCancel()
  }

  const handleCancel = () => {
    setEditingId(null)
    setEditingName('')
  }

  if (!isOpen) return null

  return (
    <Modal
      onClose={onClose}
      showCloseButton={true}
      size="sm"
      className="profileSwitcherModal"
    >
      <ModalHeader>
        <Users size={24} className="mr-2" />
        {t('profiles.title', 'User Profiles')}
      </ModalHeader>
      <ModalContent>
        {isSwitching ? (
          <div className="profileSwitchingOverlay">
            <Loader2 className="spinner" size={28} />
            <p>
              {t(
                'profiles.switching',
                'Switching profile and restarting Heroic...'
              )}
            </p>
          </div>
        ) : (
          <>
            <div className="profileList">
              {profiles.map((p) => {
                const isActive = p.id === activeProfile?.id
                return (
                  <div
                    key={p.id}
                    onClick={() => handleSwitch(p.id)}
                    className={`profileItem ${isActive ? 'profileItem--active' : ''}`}
                  >
                    <div className="profileItem__info">
                      <div className="profileItem__avatar">
                        {p.name.trim().charAt(0) || '?'}
                      </div>
                      <div className="profileItem__details">
                        {editingId === p.id ? (
                          <div className="profileItem__editInline">
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  void handleSave(p.id, editingName)
                                } else if (e.key === 'Escape') {
                                  handleCancel()
                                }
                              }}
                              className="profileItem__editInput"
                            />
                            <button
                              type="button"
                              onClick={() => void handleSave(p.id, editingName)}
                              className="profileItem__editSaveBtn"
                              title={t('profiles.save', 'Save')}
                            >
                              <Check size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={handleCancel}
                              className="profileItem__editCancelBtn"
                              title={t('profiles.cancel', 'Cancel')}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="profileItem__name">{p.name}</span>
                            <span className="profileItem__date">
                              {p.lastUsed
                                ? `${t('profiles.lastUsed', 'Last used')}: ${new Date(p.lastUsed).toLocaleDateString()}`
                                : t('profiles.active', 'Active')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    {isActive && (
                      <span className="profileItem__badge">
                        <Check size={12} className="mr-1" />
                        {t('profiles.active', 'Active')}
                      </span>
                    )}
                    <div className="profileItem__actions">
                      <button
                        type="button"
                        onClick={(e) => handleRename(e, p.id, p.name)}
                        className="profileItem__actionBtn"
                        title={t('profiles.rename', 'Rename profile')}
                      >
                        <Pencil size={14} />
                      </button>
                      {!isActive && profiles.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, p.id, p.name)}
                          className="profileItem__actionBtn profileItem__actionBtn--delete"
                          title={t('profiles.delete', 'Delete profile')}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <form onSubmit={handleCreate} className="profileCreateForm">
              <input
                type="text"
                placeholder={t(
                  'profiles.newPlaceholder',
                  'New profile name...'
                )}
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                className="profileCreateInput"
              />
              <Button type="submit" variant="primary">
                <Plus size={16} className="mr-1" />
                {t('profiles.create', 'Create')}
              </Button>
            </form>
          </>
        )}
      </ModalContent>
    </Modal>
  )
}
