import React, { useState } from 'react';
import PanelCard from './shared/PanelCard';
import { useScheduledReports } from '../../hooks/useAnalyticsQueries';
import { useAnalyticsStore } from '../../stores/analyticsStore';
import reportsApi from '../../services/reportsApi';
import type { ExportFormat, SchedulePayload } from '../../types/analytics.types';

// ── Quick Export ─────────────────────────────────────────────────────────

const reportTypes = [
  'Revenue Summary',
  'OPD Report',
  'Pharmacy Sales',
  'Financial Overview',
  'Inventory Status',
];

const formats: { key: ExportFormat; label: string; icon: string }[] = [
  { key: 'pdf', label: 'PDF', icon: 'picture_as_pdf' },
  { key: 'csv', label: 'CSV', icon: 'table_chart' },
  { key: 'xlsx', label: 'Excel', icon: 'grid_on' },
];

// ── Schedule form ────────────────────────────────────────────────────────

interface ScheduleForm {
  report_type: string;
  format: ExportFormat;
  frequency: 'daily' | 'weekly' | 'monthly';
  email: string;
}

const emptyForm: ScheduleForm = {
  report_type: reportTypes[0],
  format: 'pdf',
  frequency: 'weekly',
  email: '',
};

// ── Panel ────────────────────────────────────────────────────────────────

const ScheduleExportPanel: React.FC = () => {
  const filters = useAnalyticsStore((s) => s.filters);
  const scheduled = useScheduledReports();

  const [exporting, setExporting] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<ScheduleForm>({ ...emptyForm });

  // Quick export handler
  const handleExport = async (type: string, fmt: ExportFormat) => {
    const id = `${type}-${fmt}`;
    setExporting(id);
    try {
      const blob = await reportsApi.exportReport({
        report_type: type,
        format: fmt,
        filters,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type.replace(/\s/g, '_')}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  };

  // Schedule create handler
  const handleScheduleCreate = async () => {
    if (!form.email) return;
    const payload: SchedulePayload = {
      ...form,
      filters,
    };
    await reportsApi.createScheduledReport(payload);
    scheduled.refetch();
    setShowModal(false);
    setForm({ ...emptyForm });
  };

  // Toggle scheduled report active state
  const handleToggle = async (id: string) => {
    // In dev mode this is a no-op; just refetch mock
    await reportsApi.deleteScheduledReport(id);
    scheduled.refetch();
  };

  return (
    <PanelCard
      title="Export & Scheduled Reports"
      status="development"
      isLoading={scheduled.isLoading}
    >
      <div className="grid gap-6 md:grid-cols-2">
        {/* ── Quick Export ── */}
        <div>
          <h4 className="mb-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Quick Export
          </h4>
          <div className="space-y-2">
            {reportTypes.map((type) => (
              <div
                key={type}
                className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800"
              >
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                  {type}
                </span>
                <div className="flex gap-1">
                  {formats.map((f) => (
                    <button
                      key={f.key}
                      onClick={() => handleExport(type, f.key)}
                      disabled={exporting === `${type}-${f.key}`}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800"
                      title={`Export as ${f.label}`}
                    >
                      <span className="material-symbols-outlined text-sm">{f.icon}</span>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Scheduled Reports ── */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Scheduled Reports
            </h4>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              New Schedule
            </button>
          </div>

          {scheduled.data && scheduled.data.length > 0 ? (
            <div className="space-y-2">
              {scheduled.data.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800"
                >
                  <div>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                      {r.report_type}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {r.frequency} · {r.format.toUpperCase()} · {r.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        r.is_active ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                    />
                    <button
                      onClick={() => handleToggle(r.id)}
                      className="text-[11px] text-red-500 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              No scheduled reports yet.
            </p>
          )}
        </div>
      </div>

      {/* ── Schedule Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <h3 className="mb-4 text-sm font-semibold text-slate-800 dark:text-white">
              Schedule a Report
            </h3>

            <div className="space-y-3">
              {/* Report type */}
              <div>
                <label className="mb-1 block text-xs text-slate-500">Report Type</label>
                <select
                  value={form.report_type}
                  onChange={(e) => setForm({ ...form, report_type: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  {reportTypes.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Format */}
              <div>
                <label className="mb-1 block text-xs text-slate-500">Format</label>
                <div className="flex gap-2">
                  {formats.map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setForm({ ...form, format: f.key })}
                      className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                        form.format === f.key
                          ? 'border-primary bg-blue-50 text-primary dark:bg-blue-900/20'
                          : 'border-slate-200 text-slate-500 dark:border-slate-700'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Frequency */}
              <div>
                <label className="mb-1 block text-xs text-slate-500">Frequency</label>
                <select
                  value={form.frequency}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      frequency: e.target.value as 'daily' | 'weekly' | 'monthly',
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              {/* Email */}
              <div>
                <label className="mb-1 block text-xs text-slate-500">
                  Recipient Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="admin@hospital.com"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg px-4 py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleScheduleCreate}
                disabled={!form.email}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                Create Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </PanelCard>
  );
};

export default ScheduleExportPanel;
