import React, { useState, useEffect } from 'react';
import userService from '../../services/userService';

interface UserAvatarProps {
  /** The user's avatar URL (relative /uploads path or absolute URL). */
  avatarUrl?: string | null;
  /** Full name — used to derive initials when no avatar / on load failure. */
  name?: string | null;
  /** Sizing / shape classes for the tile (e.g. "w-8 h-8 rounded-full"). */
  className?: string;
  /** Font-size class for the fallback initials. */
  textClassName?: string;
}

const initialsOf = (name?: string | null): string =>
  ((name || 'U')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()) || 'U';

/**
 * Logged-in user's avatar, rendered consistently everywhere.
 * Shows the uploaded photo and gracefully falls back to the user's initials
 * (never a broken image) when no avatar is set or the image fails to load.
 */
const UserAvatar: React.FC<UserAvatarProps> = ({
  avatarUrl,
  name,
  className = '',
  textClassName = 'text-sm',
}) => {
  const [failed, setFailed] = useState(false);

  // Reset the error state when the avatar URL changes (e.g. after a new upload).
  useEffect(() => {
    setFailed(false);
  }, [avatarUrl]);

  const src = !failed ? userService.getPhotoUrl(avatarUrl || null) : null;

  return (
    <div className={`bg-primary/10 text-primary flex items-center justify-center overflow-hidden ${className}`}>
      {src ? (
        <img
          src={src}
          alt={name || 'User'}
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={`font-bold leading-none ${textClassName}`}>{initialsOf(name)}</span>
      )}
    </div>
  );
};

export default UserAvatar;
