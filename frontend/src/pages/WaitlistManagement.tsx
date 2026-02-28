import React from 'react';

const WaitlistManagement: React.FC = () => {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Waitlist Management</h1>
        <p className="text-slate-500 text-sm mt-1">Manage patients waiting for appointment slots</p>
      </div>

      <div className="text-center py-20 text-slate-400 bg-white rounded-xl border border-slate-200">
        <span className="material-symbols-outlined text-5xl mb-3 block">playlist_remove</span>
        <p className="text-sm font-medium">Waitlist Feature Unavailable</p>
        <p className="text-xs mt-2 max-w-md mx-auto text-slate-400">
          The waitlist system data will available soon..
        </p>
      </div>
    </div>
  );
};

export default WaitlistManagement;
