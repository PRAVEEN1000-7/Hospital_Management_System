import React from 'react';
import { useNavigate } from 'react-router-dom';

const APIS = [
  { method: 'POST',  endpoint: '/api/v1/insurance-providers',              desc: 'Register a new insurance company or TPA' },
  { method: 'GET',   endpoint: '/api/v1/insurance-providers',              desc: 'List all insurance providers' },
  { method: 'GET',   endpoint: '/api/v1/insurance-providers/{id}',         desc: 'Get a single provider\'s details' },
  { method: 'PATCH', endpoint: '/api/v1/insurance-providers/{id}',         desc: 'Update provider info or empanelment status' },
  { method: 'GET',   endpoint: '/api/v1/insurance-providers/{id}/contracts',  desc: 'View coverage agreements and rate cards' },
  { method: 'GET',   endpoint: '/api/v1/insurance-providers/{id}/procedures', desc: 'List approved procedures and billing codes' },
  { method: 'GET',   endpoint: '/api/v1/insurance-providers/{id}/analytics',  desc: 'Claim approval rates and settlement stats' },
  { method: 'GET',   endpoint: '/api/v1/insurance-providers/{id}/contacts',   desc: 'Helpdesk and escalation contacts' },
  { method: 'PATCH', endpoint: '/api/v1/insurance-providers/{id}/toggle',     desc: 'Activate or deactivate a provider' },
];

const METHOD_COLOR: Record<string, string> = {
  GET:   'text-blue-600 bg-blue-50',
  POST:  'text-green-600 bg-green-50',
  PATCH: 'text-amber-600 bg-amber-50',
  DELETE:'text-red-600 bg-red-50',
};

const InsuranceProviders: React.FC = () => {
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
          <h1 className="text-xl font-bold text-slate-900">Insurance Providers</h1>
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

export default InsuranceProviders;
