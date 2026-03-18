import React from 'react';
import { useNavigate } from 'react-router-dom';

const APIS = [
  { method: 'POST',  endpoint: '/api/v1/credit-notes',              desc: 'Issue a credit note against an invoice or standalone' },
  { method: 'GET',   endpoint: '/api/v1/credit-notes',              desc: 'List all credit notes' },
  { method: 'GET',   endpoint: '/api/v1/credit-notes/{id}',         desc: 'Get details of a single credit note' },
  { method: 'POST',  endpoint: '/api/v1/credit-notes/{id}/apply',   desc: 'Apply credit balance to reduce invoice payable' },
  { method: 'GET',   endpoint: '/api/v1/credit-notes?status=expiring', desc: 'List credit notes that are about to expire' },
  { method: 'GET',   endpoint: '/api/v1/patients/{id}/credit-balance', desc: 'Total available credit for a patient' },
  { method: 'GET',   endpoint: '/api/v1/credit-notes/{id}/pdf',     desc: 'Download or email the credit note as a PDF' },
  { method: 'GET',   endpoint: '/api/v1/reports/credit-notes',      desc: 'Reconciliation report — issued, applied, expired' },
];

const METHOD_COLOR: Record<string, string> = {
  GET:   'text-blue-600 bg-blue-50',
  POST:  'text-green-600 bg-green-50',
  PATCH: 'text-amber-600 bg-amber-50',
  DELETE:'text-red-600 bg-red-50',
};

const CreditNotes: React.FC = () => {
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
          <h1 className="text-xl font-bold text-slate-900">Credit Notes</h1>
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

export default CreditNotes;
