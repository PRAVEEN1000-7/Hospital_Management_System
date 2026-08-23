import React, { useEffect, useState } from 'react';
import hospitalService from '../../services/hospitalService';
import userService from '../../services/userService';

interface DocumentWatermarkProps {
  /** Pass the hospital's logo_url directly when the page already has it
   * (e.g. InvoiceDetail already fetches HospitalDetails) to avoid a
   * duplicate /hospital request. When omitted, this fetches it itself. */
  logoUrl?: string | null;
}

// Module-level cache so pages that don't pass `logoUrl` (optical/lab detail
// screens, which have no other reason to fetch hospital branding) don't
// re-request it on every navigation within the same session.
let cachedHospitalLogoUrl: string | null | undefined;

/**
 * Faint, centered hospital-logo watermark for a document's on-screen "View"
 * — mirrors the watermark already baked into the backend's Print/Download
 * HTML for prescriptions/optical/lab (same 0.06 opacity, 55%/420px sizing),
 * so the view matches what actually gets printed instead of only showing
 * the logo once printed or downloaded.
 *
 * Render as a child of the printable "document" card, and give that card
 * `relative z-0` (not just `relative`) — z-0 makes the card establish its
 * own stacking context, so this watermark's negative z-index is scoped to
 * sit just above the card's own background and below its real content,
 * rather than being compared against the whole app's stacking order (sidebar,
 * headers, modals) where an opaque ancestor could paint over it entirely.
 */
const DocumentWatermark: React.FC<DocumentWatermarkProps> = ({ logoUrl }) => {
  const [resolvedUrl, setResolvedUrl] = useState<string | null | undefined>(logoUrl);

  useEffect(() => {
    if (logoUrl !== undefined) {
      setResolvedUrl(logoUrl);
      return;
    }
    if (cachedHospitalLogoUrl !== undefined) {
      setResolvedUrl(cachedHospitalLogoUrl);
      return;
    }
    hospitalService.getHospitalDetails()
      .then(res => {
        cachedHospitalLogoUrl = res.logo_url || null;
        setResolvedUrl(cachedHospitalLogoUrl);
      })
      .catch(() => {
        cachedHospitalLogoUrl = null;
        setResolvedUrl(null);
      });
  }, [logoUrl]);

  const src = resolvedUrl ? userService.getPhotoUrl(resolvedUrl) : null;
  if (!src) return null;

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className="pointer-events-none select-none absolute top-1/2 left-1/2 w-[55%] max-w-[420px]"
      style={{ transform: 'translate(-50%, -50%)', opacity: 0.06, zIndex: -1 }}
    />
  );
};

export default DocumentWatermark;
