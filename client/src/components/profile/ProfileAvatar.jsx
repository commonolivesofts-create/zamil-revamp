import { useState } from 'react'
import { displayName, initialsOf, profileAvatarUrl } from '@/features/dashboard/dashboardExperience.js'

// The avatar is decorative: the person's name is always rendered next to it.
// A working image is used when the session provides one; otherwise the themed
// initials fallback keeps the identity readable without any remote request.
export default function ProfileAvatar({ profile, className = '' }) {
  const source = profileAvatarUrl(profile)
  const [failedSource, setFailedSource] = useState('')
  const showImage = Boolean(source) && source !== failedSource

  return (
    <span className={`zrv-profile-avatar ${className}`.trim()} aria-hidden="true">
      {showImage ? (
        <img
          src={source}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedSource(source)}
        />
      ) : (
        <span className="zrv-profile-avatar-initials">{initialsOf(displayName(profile))}</span>
      )}
    </span>
  )
}
