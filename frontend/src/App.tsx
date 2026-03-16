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

// Prescription pages
import PrescriptionList from './pages/PrescriptionList';
import PrescriptionBuilder from './pages/PrescriptionBuilder';
import PrescriptionDetail from './pages/PrescriptionDetail';

// Inventory pages
import InventoryDashboard from './pages/inventory/InventoryDashboard';
import SuppliersPage from './pages/inventory/SuppliersPage';
import PurchaseOrdersPage from './pages/inventory/PurchaseOrdersPage';
import NewPurchaseOrderPage from './pages/inventory/NewPurchaseOrderPage';
import GRNsPage from './pages/inventory/GRNsPage';
import NewGRNPage from './pages/inventory/NewGRNPage';
import StockMovementsPage from './pages/inventory/StockMovementsPage';
import AdjustmentsPage from './pages/inventory/AdjustmentsPage';
import CycleCountsPage from './pages/inventory/CycleCountsPage';

const App: React.FC = () => {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
            <Route path="/patients" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'receptionist', 'nurse', 'pharmacist', 'cashier', 'optical_staff', 'inventory_manager']}>
                <PatientList />
              </ProtectedRoute>
            } />
            <Route path="/patients/:id" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'receptionist', 'nurse', 'pharmacist', 'cashier', 'optical_staff', 'inventory_manager']}>
                <PatientDetail />
              </ProtectedRoute>
            } />
            <Route path="/patients/:id/id-card" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'receptionist']}>
                <PatientIdCard />
              </ProtectedRoute>
            } />
            <Route path="/profile" element={<Profile />} />

            {/* ── Admin / Super-admin only ── */}
            <Route path="/register" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'receptionist']}><Register /></ProtectedRoute>
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
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'doctor', 'receptionist', 'report_viewer']}>
                <AppointmentReports />
              </ProtectedRoute>
            } />
            <Route path="/appointments/settings" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                <AppointmentSettings />
              </ProtectedRoute>
            } />

            {/* ── Prescription Routes ── */}
            <Route path="/prescriptions" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'doctor', 'nurse', 'pharmacist']}>
                <PrescriptionList />
              </ProtectedRoute>
            } />
            <Route path="/prescriptions/new" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'doctor']}>
                <PrescriptionBuilder />
              </ProtectedRoute>
            } />
            <Route path="/prescriptions/:id" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'doctor', 'nurse', 'pharmacist']}>
                <PrescriptionDetail />
              </ProtectedRoute>
            } />
            <Route path="/prescriptions/:id/edit" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'doctor']}>
                <PrescriptionBuilder />
              </ProtectedRoute>
            } />

            {/* ── Inventory Routes ── */}
            <Route path="/inventory" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'inventory_manager']}>
                <InventoryDashboard />
              </ProtectedRoute>
            } />
            <Route path="/inventory/suppliers" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'inventory_manager']}>
                <SuppliersPage />
              </ProtectedRoute>
            } />
            <Route path="/inventory/purchase-orders" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'inventory_manager']}>
                <PurchaseOrdersPage />
              </ProtectedRoute>
            } />
            <Route path="/inventory/purchase-orders/new" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'inventory_manager']}>
                <NewPurchaseOrderPage />
              </ProtectedRoute>
            } />
            <Route path="/inventory/grns" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'inventory_manager']}>
                <GRNsPage />
              </ProtectedRoute>
            } />
            <Route path="/inventory/grns/new" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'inventory_manager']}>
                <NewGRNPage />
              </ProtectedRoute>
            } />
            <Route path="/inventory/stock-movements" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'inventory_manager']}>
                <StockMovementsPage />
              </ProtectedRoute>
            } />
            <Route path="/inventory/adjustments" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'inventory_manager']}>
                <AdjustmentsPage />
              </ProtectedRoute>
            } />
            <Route path="/inventory/cycle-counts" element={
              <ProtectedRoute allowedRoles={['super_admin', 'admin', 'inventory_manager']}>
                <CycleCountsPage />
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
