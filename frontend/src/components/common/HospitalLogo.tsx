import React, { useState, useEffect } from 'react';
import userService from '../../services/userService';

interface HospitalLogoProps {
  /** The hospital's logo URL (relative /uploads path or absolute URL). */
  logoUrl?: string | null;
  /** Hospital name — used to derive initials when no logo is set. */
  name?: string | null;
  /** Sizing / shape classes for the tile (e.g. "w-9 h-9 rounded-lg"). */
  className?: string;
  /** Font-size class for the fallback initials. */
  textClassName?: string;
}

const initialsOf = (name?: string | null): string =>
  (name || 'H')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/**
 * Hospital brand mark, rendered identically everywhere it appears.
 * Shows the uploaded hospital logo, and falls back to the hospital name's
 * initials (never a generic static icon) when no logo is set.
 */
const HospitalLogo: React.FC<HospitalLogoProps> = ({
  logoUrl,
  name,
  className = '',
  textClassName = 'text-sm',
}) => {
  const [failed, setFailed] = useState(false);

  // Reset the error state whenever the logo URL changes (e.g. after upload/remove).
  useEffect(() => {
    setFailed(false);
  }, [logoUrl]);

  const src = !failed ? userService.getPhotoUrl(logoUrl || null) : null;

  return (
    <div className={`bg-primary text-white flex items-center justify-center overflow-hidden ${className}`}>
      {src ? (
        <img
          src={src}
          alt={name || 'Hospital logo'}
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={`font-bold leading-none ${textClassName}`}>{initialsOf(name)}</span>
      )}
    </div>
  );
};

export default HospitalLogo;
