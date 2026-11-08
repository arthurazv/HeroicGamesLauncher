import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Users } from 'lucide-react'
import { Icon } from 'frontend/components/UI'
import SidebarItem from 'frontend/components/UI/Sidebar/components/SidebarItem'
import { ProfileSwitcherDialog } from './ProfileSwitcherDialog'
import { Profile } from 'backend/profileManager/types'

export const ProfileSidebarItem: React.FC = () => {
  const { t } = useTranslation()
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  useEffect(() => {
    if (window.profileApi) {
      void window.profileApi
        .getActiveProfile()
        .then(setActiveProfile)
        .catch((err) => {
          console.error('[ProfileSwitcher] Failed to get active profile:', err)
        })
    }
  }, [isDialogOpen])

  return (
    <>
      <SidebarItem
        elementType="button"
        onClick={() => setIsDialogOpen(true)}
        icon={<Icon glyph={Users} />}
        label={
          activeProfile
            ? activeProfile.name
            : t('profiles.title', 'User Profiles')
        }
      />
      <ProfileSwitcherDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
      />
    </>
  )
}
