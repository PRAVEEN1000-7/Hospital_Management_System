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
            {/* ── General ── */}
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/patients" element={<PatientList />} />
            <Route path="/patients/:id" element={<PatientDetail />} />
            <Route path="/patients/:id/id-card" element={<PatientIdCard />} />
            <Route path="/profile" element={<Profile />} />

            {/* ── Admin / Super-admin only ── */}
            <Route path="/register" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin']}><Register /></ProtectedRoute>
            } />
            <Route path="/staff" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin']}><StaffDirectory /></ProtectedRoute>
            } />
            <Route path="/user-management" element={
              <ProtectedRoute allowedRoles={['super_admin']}><UserManagement /></ProtectedRoute>
            } />
            <Route path="/hospital-setup" element={
              <ProtectedRoute allowedRoles={['super_admin']}><HospitalSetup /></ProtectedRoute>
            } />

            {/* ── Appointment Routes ── */}
            <Route path="/appointments/book" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'receptionist']}>
                <AppointmentBooking />
              </ProtectedRoute>
            } />
            <Route path="/appointments/walk-in" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'receptionist']}>
                <WalkInRegistration />
              </ProtectedRoute>
            } />
            <Route path="/appointments/queue" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'receptionist', 'doctor', 'nurse']}>
                <WalkInQueue />
              </ProtectedRoute>
            } />
            <Route path="/appointments/doctor-schedule" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'doctor']}>
                <DoctorSchedule />
              </ProtectedRoute>
            } />
            <Route path="/appointments/my-schedule" element={
              <ProtectedRoute allowedRoles={['doctor']}>
                <DoctorAppointments />
              </ProtectedRoute>
            } />
            <Route path="/appointments/my-appointments" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                <MyAppointments />
              </ProtectedRoute>
            } />
            <Route path="/appointments/manage" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'receptionist', 'nurse']}>
                <AppointmentManagement />
              </ProtectedRoute>
            } />
            <Route path="/appointments/waitlist" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'doctor', 'receptionist']}>
                <WaitlistManagement />
              </ProtectedRoute>
            } />
            <Route path="/appointments/reports" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'doctor', 'receptionist']}>
                <AppointmentReports />
              </ProtectedRoute>
            } />
            <Route path="/appointments/settings" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                <AppointmentSettings />
              </ProtectedRoute>
            } />
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
