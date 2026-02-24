import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import ToastContainer from './components/common/ToastContainer';
import ProtectedRoute from './components/common/ProtectedRoute';
import Layout from './components/common/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Register from './pages/Register';
import PatientList from './pages/PatientList';
import PatientDetail from './pages/PatientDetail';
import PatientIdCard from './pages/PatientIdCard';
import UserManagement from './pages/UserManagement';
import StaffDirectory from './pages/StaffDirectory';
import Profile from './pages/Profile';
import HospitalSetup from './pages/HospitalSetup';

// Appointment pages
import AppointmentBooking from './pages/AppointmentBooking';
import WalkInRegistration from './pages/WalkInRegistration';
import WalkInQueue from './pages/WalkInQueue';
import DoctorSchedule from './pages/DoctorSchedule';
import DoctorAppointments from './pages/DoctorAppointments';
import MyAppointments from './pages/MyAppointments';
import AppointmentManagement from './pages/AppointmentManagement';
import WaitlistManagement from './pages/WaitlistManagement';
import AppointmentReports from './pages/AppointmentReports';
import AppointmentSettings from './pages/AppointmentSettings';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <ToastContainer />
          <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />

          {/* Protected */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/register" element={<Register />} />
            <Route path="/patients" element={<PatientList />} />
            <Route path="/patients/:id" element={<PatientDetail />} />
            <Route path="/patients/:id/id-card" element={<PatientIdCard />} />
            <Route path="/staff" element={<StaffDirectory />} />
            <Route path="/user-management" element={<UserManagement />} />
            <Route path="/hospital-setup" element={<HospitalSetup />} />
            <Route path="/profile" element={<Profile />} />

            {/* Appointment Routes */}
            <Route path="/appointments/book" element={<AppointmentBooking />} />
            <Route path="/appointments/walk-in" element={<WalkInRegistration />} />
            <Route path="/appointments/queue" element={<WalkInQueue />} />
            <Route path="/appointments/doctor-schedule" element={<DoctorSchedule />} />
            <Route path="/appointments/my-schedule" element={<DoctorAppointments />} />
            <Route path="/appointments/my-appointments" element={<MyAppointments />} />
            <Route path="/appointments/manage" element={<AppointmentManagement />} />
            <Route path="/appointments/waitlist" element={<WaitlistManagement />} />
            <Route path="/appointments/reports" element={<AppointmentReports />} />
            <Route path="/appointments/settings" element={<AppointmentSettings />} />
          </Route>

          {/* Redirects */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/change-password" element={<Navigate to="/profile" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
