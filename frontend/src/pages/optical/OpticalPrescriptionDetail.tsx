import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import opticalService from '../../services/opticalService';
import type { OpticalPrescription } from '../../types/optical';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { htmlStringToPdf } from '../../utils/pdf';
import { format } from 'date-fns';

const fmtPower = (v: number | string | null) => {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}`;
};
const fmtAxis = (v: number | null) => (v === null || v === undefined ? '—' : `${v}°`);
const fmtVa = (v: string | null) => v || '—';

const OpticalPrescriptionDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  // /optical/sales/new is restricted to optical/billing staff (same
  // separation of duties as Pharmacy dispensing) — doctors can view this
  // page but linking them to a route they're blocked from just bounces them
  // to the dashboard with no explanation, so hide the action instead.
  const { hasRole, isModuleEnabled } = useAuth();
  const canDispense = hasRole('super_admin', 'admin', 'optical_staff');
  const hasOpticalModule = isModuleEnabled('optical');
  const [rx, setRx] = useState<OpticalPrescription | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const loadRx = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setFetchError(false);
    opticalService.getPrescription(id)
      .then(data => { setRx(data); setFetchError(false); })
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { loadRx(); }, [loadRx]);

  const handlePrint = async () => {
    if (!id) return;
    // Open the window synchronously (before any await) so popup blockers don't kill it.
    const win = window.open('', '_blank');
    if (!win) {
      toast.error('Pop-ups are blocked — allow pop-ups for this site to print.');
      return;
    }
    try {
      const html = await opticalService.getPrescriptionPdfUrl(id);
      win.document.open();
      win.document.write(html);
      win.document.close();
      // Give fonts/images in the new window enough time to load before printing.
      setTimeout(() => { try { win.print(); } catch { /* window may have been closed */ } }, 800);
    } catch {
      win.close();
      toast.error('Failed to generate print view');
    }
  };

  const handleDownload = async () => {
    if (!id || downloading) return;
    setDownloading(true);
    try {
      const html = await opticalService.getPrescriptionPdfUrl(id);
      await htmlStringToPdf(html, `Eye_Prescription_${rx?.prescription_number || id}.pdf`);
      toast.success('Prescription downloaded');
    } catch {
      toast.error('Failed to download prescription');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
        <p className="text-sm text-slate-500">Loading prescription…</p>
      </div>
    );
  }

  if (fetchError || !rx) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
        <span className="material-symbols-outlined text-5xl text-slate-300">description_off</span>
        <div>
          <p className="text-sm font-semibold text-slate-700">Could not load prescription</p>
          <p className="text-xs text-slate-400 mt-1">The prescription may still be processing — please wait a moment and retry.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadRx}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90">
            <span className="material-symbols-outlined text-base">refresh</span> Retry
          </button>
          <button onClick={() => navigate('/optical/prescriptions')}
            className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
            Back to List
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-screen-lg">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-slate-600">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{rx.prescription_number}</h1>
            <p className="text-sm text-slate-500">{format(new Date(rx.created_at), 'dd MMM yyyy')}</p>
          </div>
          <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${rx.is_finalized ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            {rx.is_finalized ? 'Finalized' : 'Draft'}
          </span>
        </div>
        <div className="flex gap-2">
          <button onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
            <span className="material-symbols-outlined text-base">print</span> Print
          </button>
          <button onClick={handleDownload} disabled={downloading}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-primary bg-white border border-primary/30 rounded-lg hover:bg-primary/5 disabled:opacity-50">
            <span className="material-symbols-outlined text-base">download</span> {downloading ? 'Preparing…' : 'Download PDF'}
          </button>
          {canDispense && (
            rx.has_sale ? (
              <span className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg"
                title="This prescription has already been dispensed">
                <span className="material-symbols-outlined text-base">check_circle</span> Already Dispensed
              </span>
            ) : (
              <button onClick={() => navigate(`/optical/sales/new?prescription_id=${rx.id}`)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90"
                title="Sell spectacles/lenses against this prescription">
                <span className="material-symbols-outlined text-base">point_of_sale</span> Dispense
              </button>
            )
          )}
        </div>
      </div>

      {/* Contextual action hint banner */}
      {hasOpticalModule && rx.has_sale ? (
        <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800">
          <span className="material-symbols-outlined text-emerald-500 text-base mt-0.5">check_circle</span>
          <span>This prescription has already been dispensed at the Optical Store.</span>
        </div>
      ) : hasOpticalModule && (
        canDispense ? (
          <div className="flex items-start gap-3 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 text-sm text-sky-800">
            <span className="material-symbols-outlined text-sky-500 text-base mt-0.5">storefront</span>
            <span>
              This hospital has an <strong>Optical Store</strong>. Click <strong>Dispense</strong> to fulfil the spectacle/lens order against this prescription.
            </span>
          </div>
        ) : (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
            <span className="material-symbols-outlined text-amber-500 text-base mt-0.5">info</span>
            <span>Send this prescription to the optical counter for dispensing. Use <strong>Print</strong> or <strong>Download PDF</strong> to hand a copy to the patient.</span>
          </div>
        )
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
        <div>
          <p className="text-xs text-slate-400 font-medium uppercase mb-1">Patient</p>
          <p className="text-slate-900 font-medium">{rx.patient_name || '—'}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-center text-xs font-semibold text-slate-500 uppercase">
                <th className="px-3 py-2 text-left">Parameter</th>
                <th className="px-3 py-2">Right (OD)</th>
                <th className="px-3 py-2">Left (OS)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-center">
              <tr>
                <td className="px-3 py-2 text-left font-semibold text-slate-700">SPH</td>
                <td className="px-3 py-2">{fmtPower(rx.right_sph)}</td>
                <td className="px-3 py-2">{fmtPower(rx.left_sph)}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-left font-semibold text-slate-700">CYL</td>
                <td className="px-3 py-2">{fmtPower(rx.right_cyl)}</td>
                <td className="px-3 py-2">{fmtPower(rx.left_cyl)}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-left font-semibold text-slate-700">Axis</td>
                <td className="px-3 py-2">{fmtAxis(rx.right_axis)}</td>
                <td className="px-3 py-2">{fmtAxis(rx.left_axis)}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-left font-semibold text-slate-700">Add</td>
                <td className="px-3 py-2">{fmtPower(rx.right_add)}</td>
                <td className="px-3 py-2">{fmtPower(rx.left_add)}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-left font-semibold text-slate-700">Visual Acuity</td>
                <td className="px-3 py-2">{fmtVa(rx.right_va)}</td>
                <td className="px-3 py-2">{fmtVa(rx.left_va)}</td>
              </tr>
              {(rx.left_vision || rx.right_vision) && (
                <tr>
                  <td className="px-3 py-2 text-left font-semibold text-slate-700">Vision</td>
                  <td className="px-3 py-2">{fmtVa(rx.right_vision)}</td>
                  <td className="px-3 py-2">{fmtVa(rx.left_vision)}</td>
                </tr>
              )}
              {(rx.left_iop || rx.right_iop) && (
                <tr>
                  <td className="px-3 py-2 text-left font-semibold text-slate-700">IOP (Tension)</td>
                  <td className="px-3 py-2">{fmtVa(rx.right_iop)}</td>
                  <td className="px-3 py-2">{fmtVa(rx.left_iop)}</td>
                </tr>
              )}
              {(rx.left_nld || rx.right_nld) && (
                <tr>
                  <td className="px-3 py-2 text-left font-semibold text-slate-700">NLD</td>
                  <td className="px-3 py-2">{fmtVa(rx.right_nld)}</td>
                  <td className="px-3 py-2">{fmtVa(rx.left_nld)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {(rx.pd_distance || rx.pd_near || rx.pd_right || rx.pd_left) && (
          <div className="bg-blue-50 rounded-lg p-4 text-sm">
            <p className="font-semibold text-slate-700 mb-1">Pupillary Distance (PD)</p>
            <p className="text-slate-600">
              {[
                rx.pd_distance ? `Distance: ${rx.pd_distance} mm` : null,
                rx.pd_near ? `Near: ${rx.pd_near} mm` : null,
                rx.pd_right ? `Right: ${rx.pd_right} mm` : null,
                rx.pd_left ? `Left: ${rx.pd_left} mm` : null,
              ].filter(Boolean).join(' | ')}
            </p>
          </div>
        )}

        {rx.notes && (
          <div className="bg-emerald-50 rounded-lg p-4 text-sm">
            <p className="font-semibold text-slate-700 mb-1">Notes</p>
            <p className="text-slate-600 whitespace-pre-wrap">{rx.notes}</p>
          </div>
        )}

        <div className="flex justify-end pt-4 border-t border-slate-100">
          <div className="text-right text-sm">
            <p className="font-semibold text-slate-900">{rx.doctor_name || 'No doctor assigned'}</p>
            {rx.valid_until && <p className="text-slate-500">Valid until {format(new Date(rx.valid_until), 'dd MMM yyyy')}</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OpticalPrescriptionDetail;
