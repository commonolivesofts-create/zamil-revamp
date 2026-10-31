import { useState } from "react";
import {
  displayName,
  initialsOf,
  profileAvatarUrl,
  profileImageEndpoint,
} from "@/features/dashboard/dashboardExperience.js";

// The avatar is decorative: the person's name is always rendered next to it.
// A working image is used when the session provides one; otherwise the themed
// initials fallback keeps the identity readable without any remote request.
export default function ProfileAvatar({
  profile,
  className = "",
  onImageLoad,
  onImageError,
}) {
  const [failedSource, setFailedSource] = useState("");
  const requestedSource =
    profileAvatarUrl(profile) || profileImageEndpoint(profile?.id);
  const source =
    requestedSource && failedSource !== requestedSource
      ? requestedSource
      : "/profile-placeholder.png";
  const showImage = source !== failedSource;

  return (
    <span
      className={`zrv-profile-avatar ${className}`.trim()}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          key={source}
          src={source}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => onImageLoad?.(source)}
          onError={() => {
            setFailedSource(source);
            onImageError?.(source);
          }}
        />
      ) : (
        <span className="zrv-profile-avatar-initials">
          {initialsOf(displayName(profile))}
        </span>
      )}
    </span>
  );
}
