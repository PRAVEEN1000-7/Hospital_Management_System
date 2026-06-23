import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import opticalService from '../../services/opticalService';
import type { OpticalPrescription } from '../../types/optical';
import { useToast } from '../../contexts/ToastContext';
import { htmlStringToPdf } from '../../utils/pdf';
import { format } from 'date-fns';

const fmtPower = (v: number | null) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}`);
const fmtAxis = (v: number | null) => (v === null || v === undefined ? '—' : `${v}°`);
const fmtVa = (v: string | null) => v || '—';

const OpticalPrescriptionDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [rx, setRx] = useState<OpticalPrescription | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!id) return;
    opticalService.getPrescription(id)
      .then(setRx)
      .catch(() => navigate('/optical/prescriptions'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const handlePrint = async () => {
    if (!id) return;
    try {
      const html = await opticalService.getPrescriptionPdfUrl(id);
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
        setTimeout(() => win.print(), 500);
      }
    } catch {
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

  if (loading || !rx) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-screen-lg">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/optical/prescriptions')} className="text-slate-400 hover:text-slate-600">
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
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
        <div>
          <p className="text-xs text-slate-400 font-medium uppercase mb-1">Patient</p>
          <p className="text-slate-900 font-medium">{rx.patient_name || '—'}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-center text-xs font-semibold text-slate-500 uppercase">
                <th className="px-3 py-2 text-left">Eye</th>
                <th className="px-3 py-2">SPH</th>
                <th className="px-3 py-2">CYL</th>
                <th className="px-3 py-2">Axis</th>
                <th className="px-3 py-2">Add</th>
                <th className="px-3 py-2">Visual Acuity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-center">
              <tr>
                <td className="px-3 py-2 text-left font-semibold text-slate-700">Right (OD)</td>
                <td className="px-3 py-2">{fmtPower(rx.right_sph)}</td>
                <td className="px-3 py-2">{fmtPower(rx.right_cyl)}</td>
                <td className="px-3 py-2">{fmtAxis(rx.right_axis)}</td>
                <td className="px-3 py-2">{fmtPower(rx.right_add)}</td>
                <td className="px-3 py-2">{fmtVa(rx.right_va)}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-left font-semibold text-slate-700">Left (OS)</td>
                <td className="px-3 py-2">{fmtPower(rx.left_sph)}</td>
                <td className="px-3 py-2">{fmtPower(rx.left_cyl)}</td>
                <td className="px-3 py-2">{fmtAxis(rx.left_axis)}</td>
                <td className="px-3 py-2">{fmtPower(rx.left_add)}</td>
                <td className="px-3 py-2">{fmtVa(rx.left_va)}</td>
              </tr>
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
            <p className="font-semibold text-slate-900">{rx.doctor_name || 'Prescribing Doctor'}</p>
            {rx.valid_until && <p className="text-slate-500">Valid until {format(new Date(rx.valid_until), 'dd MMM yyyy')}</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OpticalPrescriptionDetail;
