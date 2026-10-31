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
  const [imageStates, setImageStates] = useState(() => new Map());
  const requestedSource =
    profileAvatarUrl(profile) || profileImageEndpoint(profile?.id);
  const placeholderSource = "/profile-placeholder.png";
  const source =
    requestedSource && imageStates.get(requestedSource) !== "failed"
      ? requestedSource
      : placeholderSource;
  const showImage = imageStates.get(source) !== "failed";
  const imageLoading = showImage && imageStates.get(source) !== "loaded";

  function markLoaded() {
    setImageStates((current) => new Map(current).set(source, "loaded"));
    onImageLoad?.(source);
  }

  function markFailed() {
    setImageStates((current) => new Map(current).set(source, "failed"));
    onImageError?.(source);
  }

  return (
    <span
      className={`zrv-profile-avatar ${className}`.trim()}
      aria-hidden="true"
    >
      {showImage ? (
        <>
          {imageLoading && <span className="zrv-profile-avatar-skeleton" />}
          <img
            key={source}
            className={imageLoading ? "is-loading" : ""}
            src={source}
            alt=""
            loading="eager"
            fetchPriority="high"
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={markLoaded}
            onError={markFailed}
          />
        </>
      ) : (
        <span className="zrv-profile-avatar-initials">
          {initialsOf(displayName(profile))}
        </span>
      )}
    </span>
  );
}
