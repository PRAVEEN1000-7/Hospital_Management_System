import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import opticalService from '../../services/opticalService';
import type { OpticalPrescription } from '../../types/optical';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';

const OpticalPrescriptions: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  // /optical/sales/new is restricted to optical/billing staff (same
  // separation of duties as Pharmacy dispensing) — doctors can view this
  // list but linking them to a route they're blocked from just bounces them
  // to the dashboard with no explanation, so hide the action instead.
  const { hasRole } = useAuth();
  const canDispense = hasRole('super_admin', 'admin', 'optical_staff');
  const [prescriptions, setPrescriptions] = useState<OpticalPrescription[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPrescriptions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await opticalService.getPrescriptions(1, 50);
      setPrescriptions(res.data);
    } catch {
      toast.error('Failed to load eye prescriptions');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchPrescriptions(); }, [fetchPrescriptions]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Eye Prescriptions</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sphere/cylinder/axis/add power and PD measurements per patient. Created from the
            doctor's Prescription Builder ("Add Optical" option) during a consultation.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
          </div>
        ) : prescriptions.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <span className="material-symbols-outlined text-4xl mb-2 block">description</span>
            <p className="font-medium">No eye prescriptions yet</p>
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-600">Rx Number</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Date</th>
                <th className="px-4 py-3 font-semibold text-slate-600">OD (SPH/CYL/Axis)</th>
                <th className="px-4 py-3 font-semibold text-slate-600">OS (SPH/CYL/Axis)</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
                {canDispense && <th className="px-4 py-3 font-semibold text-slate-600 text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {prescriptions.map(rx => (
                <tr key={rx.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900 cursor-pointer" onClick={() => navigate(`/optical/prescriptions/${rx.id}`)}>
                    {rx.prescription_number}
                  </td>
                  <td className="px-4 py-3 text-slate-600 cursor-pointer" onClick={() => navigate(`/optical/prescriptions/${rx.id}`)}>
                    {format(new Date(rx.created_at), 'dd MMM yyyy')}
                  </td>
                  <td className="px-4 py-3 text-slate-600 cursor-pointer" onClick={() => navigate(`/optical/prescriptions/${rx.id}`)}>
                    {rx.right_sph ?? '—'} / {rx.right_cyl ?? '—'} / {rx.right_axis ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600 cursor-pointer" onClick={() => navigate(`/optical/prescriptions/${rx.id}`)}>
                    {rx.left_sph ?? '—'} / {rx.left_cyl ?? '—'} / {rx.left_axis ?? '—'}
                  </td>
                  <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(`/optical/prescriptions/${rx.id}`)}>
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${rx.is_finalized ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {rx.is_finalized ? 'Finalized' : 'Draft'}
                    </span>
                  </td>
                  {canDispense && (
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => navigate(`/optical/sales/new?prescription_id=${rx.id}`)}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-primary rounded-lg hover:bg-primary/90"
                        title="Sell spectacles/lenses against this prescription"
                      >
                        Dispense
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default OpticalPrescriptions;
