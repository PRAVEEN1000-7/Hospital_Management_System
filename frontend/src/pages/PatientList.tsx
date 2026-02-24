import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  const [sortBy, setSortBy] = useState('default');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [genderFilter, setGenderFilter] = useState('');
  const [bloodGroupFilter, setBloodGroupFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const limit = 10;
  const searchTimeoutRef = useRef<number | null>(null);

  const fetchPatients = useCallback(async () => {
    setLoading(true);
    try {
      const response = await patientService.getPatients(page, limit, search);
      let filteredData = [...response.data];
      
      // Apply filters
      if (genderFilter) {
        filteredData = filteredData.filter(p => p.gender?.toLowerCase() === genderFilter.toLowerCase());
      }
      if (bloodGroupFilter) {
        filteredData = filteredData.filter(p => p.blood_group === bloodGroupFilter);
      }
      if (cityFilter) {
        filteredData = filteredData.filter(p => p.city?.toLowerCase().includes(cityFilter.toLowerCase()));
      }
      if (statusFilter) {
        const isActive = statusFilter === 'active';
        filteredData = filteredData.filter(p => p.is_active === isActive);
      }
      
      // Client-side sorting
      let sortedData = [...filteredData];
      if (sortBy !== 'default') {
        sortedData.sort((a, b) => {
          let aVal: any = a[sortBy as keyof Patient];
          let bVal: any = b[sortBy as keyof Patient];
          
          // Handle null/undefined
          if (aVal === null || aVal === undefined) return sortOrder === 'asc' ? 1 : -1;
          if (bVal === null || bVal === undefined) return sortOrder === 'asc' ? -1 : 1;
          
          // Convert to comparable values
          if (sortBy === 'date_of_birth' || sortBy === 'created_at' || sortBy === 'updated_at') {
            aVal = new Date(aVal).getTime();
            bVal = new Date(bVal).getTime();
          } else if (typeof aVal === 'string') {
            aVal = aVal.toLowerCase();
            bVal = bVal.toLowerCase();
          }
          
          if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
          if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
          return 0;
        });
      }
      
      setPatients(sortedData);
      setTotalPages(response.total_pages);
      setTotal(response.total);
    } catch (err) {
      // Silent fail - patients list will remain empty
    } finally {
      setLoading(false);
    }
  }, [page, search, sortBy, sortOrder, genderFilter, bloodGroupFilter, cityFilter, statusFilter]);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  // Dynamic search with debounce
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 500);
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchInput]);

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`Are you sure you want to delete patient "${name}"?`)) return;
    try {
      await patientService.deletePatient(id);
      fetchPatients();
    } catch (err) {
      // Silent fail - deletion error will not show
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

      {/* Search & Filter Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 mb-6 p-4">
        {/* Search Row */}
        <div className="mb-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            <div className="lg:col-span-5 relative">
              <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-background-light border-none rounded-lg focus:ring-2 focus:ring-primary/40 text-sm"
                placeholder="Search by name, ID, or phone..."
              />
              {searchInput && (
                <button
                  onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <span className="material-icons text-lg">close</span>
                </button>
              )}
            </div>
            <div className="lg:col-span-4">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-3 py-2 bg-background-light border-none rounded-lg focus:ring-2 focus:ring-primary/40 text-sm font-medium text-slate-700"
              >
                <option value="default">Default Order</option>
                <option value="created_at">Registration Date</option>
                <option value="prn">PRN</option>
                <option value="first_name">First Name</option>
                <option value="last_name">Last Name</option>
                <option value="date_of_birth">Date of Birth</option>
                <option value="gender">Gender</option>
                <option value="blood_group">Blood Group</option>
                <option value="primary_phone">Phone</option>
                <option value="email">Email</option>
                <option value="city">City</option>
                <option value="updated_at">Last Updated</option>
              </select>
            </div>
            <div className="lg:col-span-3">
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                className="w-full px-3 py-2 bg-background-light border-none rounded-lg focus:ring-2 focus:ring-primary/40 text-sm font-medium text-slate-700"
                disabled={sortBy === 'default'}
              >
                <option value="asc">↑ Ascending</option>
                <option value="desc">↓ Descending</option>
              </select>
            </div>
          </div>
        </div>
        
        {/* Filter Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
          <div>
            <select
              value={genderFilter}
              onChange={(e) => { setGenderFilter(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-background-light border-none rounded-lg focus:ring-2 focus:ring-primary/40 text-sm"
            >
              <option value="">All Genders</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <select
              value={bloodGroupFilter}
              onChange={(e) => { setBloodGroupFilter(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-background-light border-none rounded-lg focus:ring-2 focus:ring-primary/40 text-sm"
            >
              <option value="">All Blood Groups</option>
              <option value="A+">A+</option>
              <option value="A-">A-</option>
              <option value="B+">B+</option>
              <option value="B-">B-</option>
              <option value="AB+">AB+</option>
              <option value="AB-">AB-</option>
              <option value="O+">O+</option>
              <option value="O-">O-</option>
            </select>
          </div>
          <div>
            <input
              type="text"
              value={cityFilter}
              onChange={(e) => { setCityFilter(e.target.value); setPage(1); }}
              placeholder="Filter by City"
              className="w-full px-3 py-2 bg-background-light border-none rounded-lg focus:ring-2 focus:ring-primary/40 text-sm"
            />
          </div>
          <div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-background-light border-none rounded-lg focus:ring-2 focus:ring-primary/40 text-sm"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        
        {/* Active Filters Display */}
        {(genderFilter || bloodGroupFilter || cityFilter || statusFilter) && (
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100">
            <span className="text-xs font-semibold text-slate-500">Active Filters:</span>
            {genderFilter && (
              <button
                onClick={() => setGenderFilter('')}
                className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium hover:bg-blue-200"
              >
                Gender: {genderFilter}
                <span className="material-icons text-sm">close</span>
              </button>
            )}
            {bloodGroupFilter && (
              <button
                onClick={() => setBloodGroupFilter('')}
                className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium hover:bg-red-200"
              >
                Blood: {bloodGroupFilter}
                <span className="material-icons text-sm">close</span>
              </button>
            )}
            {cityFilter && (
              <button
                onClick={() => setCityFilter('')}
                className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium hover:bg-green-200"
              >
                City: {cityFilter}
                <span className="material-icons text-sm">close</span>
              </button>
            )}
            {statusFilter && (
              <button
                onClick={() => setStatusFilter('')}
                className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium hover:bg-purple-200"
              >
                Status: {statusFilter}
                <span className="material-icons text-sm">close</span>
              </button>
            )}
            <button
              onClick={() => {
                setGenderFilter('');
                setBloodGroupFilter('');
                setCityFilter('');
                setStatusFilter('');
              }}
              className="text-xs text-slate-500 hover:text-slate-700 font-medium underline"
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>

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
            <table className="w-full min-w-[640px] text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">PRN</th>
                  <th className="px-4 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Gender</th>
                  <th className="px-4 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Blood</th>
                  <th className="px-4 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Registered</th>
                  <th className="px-4 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {patients.map((patient) => (
                  <tr key={patient.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-4 py-4">
                      <span className="text-sm font-semibold font-mono text-slate-400">{patient.prn}</span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm uppercase flex-shrink-0">
                          {getInitials(patient)}
                        </div>
                        <div className="min-w-0">
                          <p
                            className="text-sm font-bold text-primary hover:underline cursor-pointer truncate"
                            onClick={() => navigate(`/patients/${patient.id}`)}
                          >
                            {patient.full_name || `${patient.title} ${patient.first_name} ${patient.last_name}`}
                          </p>
                          <p className="text-xs text-slate-500 truncate">{patient.email || `${patient.country_code} ${patient.mobile_number}`}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm">{patient.gender}</span>
                    </td>
                    <td className="px-4 py-4 hidden sm:table-cell">
                      {patient.blood_group ? (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-100 text-red-700 uppercase tracking-wide">
                          {patient.blood_group}
                        </span>
                      ) : (
                        <span className="text-sm text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 hidden lg:table-cell">
                      <span className="text-sm">{format(new Date(patient.created_at), 'MMM dd, yyyy')}</span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => navigate(`/patients/${patient.id}`)}
                          className="p-1.5 hover:bg-primary/10 rounded-lg text-slate-400 hover:text-primary transition-colors"
                          title="View"
                        >
                          <span className="material-icons text-base">visibility</span>
                        </button>
                        <button
                          onClick={() => handleDelete(patient.id, patient.full_name || patient.first_name)}
                          className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <span className="material-icons text-base">delete</span>
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
