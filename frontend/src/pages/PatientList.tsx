import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import patientService from '../services/patientService';
import type { Patient } from '../types/patient';
import { format } from 'date-fns';

const PatientList: React.FC = () => {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  const fetchPatients = useCallback(async () => {
    setLoading(true);
    try {
      const response = await patientService.getPatients(page, limit, search);
      setPatients(response.data);
      setTotalPages(response.total_pages);
      setTotal(response.total);
    } catch (err) {
      console.error('Failed to fetch patients:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`Are you sure you want to delete patient "${name}"?`)) return;
    try {
      await patientService.deletePatient(id);
      fetchPatients();
    } catch (err) {
      console.error('Failed to delete patient:', err);
    }
  };

  const getInitials = (p: Patient) => {
    return `${p.first_name?.[0] || ''}${p.last_name?.[0] || ''}`.toUpperCase();
  };

  const startRecord = (page - 1) * limit + 1;
  const endRecord = Math.min(page * limit, total);

  // Generate visible page numbers
  const getPageNumbers = () => {
    const pages: (number | '...')[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('...');
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
      if (page < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div>
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Patient Directory</h1>
          <p className="text-slate-500 text-sm">Manage and track all patient records in one place.</p>
        </div>
        <button
          onClick={() => navigate('/register')}
          className="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
        >
          <span className="material-icons text-lg">person_add</span>
          <span>Register New Patient</span>
        </button>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Total Patients</p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold">{total.toLocaleString()}</span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Current Page</p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold">{patients.length}</span>
            <span className="text-slate-400 text-xs pb-1">records</span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Total Pages</p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold">{totalPages}</span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Search Active</p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold">{search ? 'Yes' : 'No'}</span>
          </div>
        </div>
      </div>

      {/* Search Toolbar */}
      <form onSubmit={handleSearch} className="bg-white rounded-xl border border-slate-200 mb-6 p-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-6 relative">
            <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-background-light border-none rounded-lg focus:ring-2 focus:ring-primary/40 text-sm"
              placeholder="Search by name, ID, or phone..."
            />
          </div>
          <div className="lg:col-span-4"></div>
          <div className="lg:col-span-2 flex justify-end gap-2">
            <button
              type="submit"
              className="flex-1 lg:flex-none px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors active:scale-95"
            >
              Search
            </button>
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}
                className="px-3 py-2 bg-slate-100 rounded-lg text-sm text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </form>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
          </div>
        ) : patients.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            <span className="material-icons text-4xl text-slate-300 mb-3">person_search</span>
            <p className="text-lg font-medium">No patients found</p>
            <p className="text-sm mt-1">Try adjusting your search or add a new patient.</p>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Patient ID</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Gender</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Blood</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Registered</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {patients.map((patient) => (
                  <tr key={patient.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <span className="text-sm font-semibold font-mono text-slate-400">{patient.prn}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm uppercase">
                          {getInitials(patient)}
                        </div>
                        <div>
                          <p
                            className="text-sm font-bold text-primary hover:underline cursor-pointer"
                            onClick={() => navigate(`/patients/${patient.id}`)}
                          >
                            {patient.full_name || `${patient.title} ${patient.first_name} ${patient.last_name}`}
                          </p>
                          <p className="text-xs text-slate-500">{patient.email || `${patient.country_code} ${patient.mobile_number}`}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm">{patient.gender}</span>
                    </td>
                    <td className="px-6 py-4 hidden sm:table-cell">
                      {patient.blood_group ? (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-100 text-red-700 uppercase tracking-wide">
                          {patient.blood_group}
                        </span>
                      ) : (
                        <span className="text-sm text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 hidden lg:table-cell">
                      <span className="text-sm">{format(new Date(patient.created_at), 'MMM dd, yyyy')}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => navigate(`/patients/${patient.id}`)}
                          className="p-1.5 hover:bg-primary/10 rounded-lg text-slate-400 hover:text-primary transition-colors"
                          title="View"
                        >
                          <span className="material-icons text-lg">visibility</span>
                        </button>
                        <button
                          onClick={() => handleDelete(patient.id, patient.full_name || patient.first_name)}
                          className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <span className="material-icons text-lg">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 flex flex-col md:flex-row items-center justify-between border-t border-slate-200 gap-4">
            <p className="text-sm text-slate-500">
              Showing <span className="font-bold text-slate-900">{startRecord}</span> to{' '}
              <span className="font-bold text-slate-900">{endRecord}</span> of{' '}
              <span className="font-bold text-slate-900">{total.toLocaleString()}</span> results
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 border border-slate-200 rounded-lg text-slate-400 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <span className="material-icons text-lg">chevron_left</span>
              </button>
              {getPageNumbers().map((pg, i) =>
                pg === '...' ? (
                  <span key={`dots-${i}`} className="px-2 text-slate-400">...</span>
                ) : (
                  <button
                    key={pg}
                    onClick={() => setPage(pg as number)}
                    className={`w-10 h-10 rounded-lg text-sm font-bold transition-colors ${
                      page === pg
                        ? 'bg-primary text-white'
                        : 'border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {pg}
                  </button>
                )
              )}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <span className="material-icons text-lg">chevron_right</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PatientList;
