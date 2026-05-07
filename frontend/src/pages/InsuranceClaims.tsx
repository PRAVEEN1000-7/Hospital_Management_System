import React from 'react';
import { useNavigate } from 'react-router-dom';

const APIS = [
  { method: 'POST',  endpoint: '/api/v1/insurance-claims',              desc: 'Submit a new claim against a patient invoice' },
  { method: 'GET',   endpoint: '/api/v1/insurance-claims',              desc: 'List all claims with status filters' },
  { method: 'GET',   endpoint: '/api/v1/insurance-claims/{id}',         desc: 'Get full details of a single claim' },
  { method: 'GET',   endpoint: '/api/v1/insurance-claims/{id}/status',  desc: 'Check current claim status from insurer' },
  { method: 'PATCH', endpoint: '/api/v1/insurance-claims/{id}/approve', desc: 'Internal approval before submission to insurer' },
  { method: 'POST',  endpoint: '/api/v1/insurance-claims/{id}/settle',  desc: 'Record insurer settlement and match payment' },
  { method: 'POST',  endpoint: '/api/v1/insurance-claims/{id}/resubmit',desc: 'Resubmit a rejected claim with corrections' },
  { method: 'POST',  endpoint: '/api/v1/pre-authorizations',            desc: 'Request pre-auth before a procedure or admission' },
  { method: 'GET',   endpoint: '/api/v1/insurance-policies',            desc: 'Patient-linked policies with coverage and co-pay info' },
];

const METHOD_COLOR: Record<string, string> = {
  GET:   'text-blue-600 bg-blue-50',
  POST:  'text-green-600 bg-green-50',
  PATCH: 'text-amber-600 bg-amber-50',
  DELETE:'text-red-600 bg-red-50',
};

const InsuranceClaims: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/billing/invoices')}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Insurance Claims</h1>
          <p className="text-sm text-slate-400">API reference — coming soon</p>
        </div>
      </div>

      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
        {APIS.map((a, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <span className={`text-[11px] font-bold font-mono w-12 text-center rounded px-1.5 py-0.5 shrink-0 ${METHOD_COLOR[a.method] ?? ''}`}>{a.method}</span>
            <span className="text-xs font-mono text-slate-700 shrink-0">{a.endpoint}</span>
            <span className="text-xs text-slate-400 ml-auto text-right">{a.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default InsuranceClaims;
