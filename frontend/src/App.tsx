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

// Pharmacy pages
import PharmacyDashboard from './pages/pharmacy/PharmacyDashboard';
import MedicineList from './pages/pharmacy/MedicineList';
import MedicineDetail from './pages/pharmacy/MedicineDetail';
import MedicineForm from './pages/pharmacy/MedicineForm';
import BatchForm from './pages/pharmacy/BatchForm';
import SalesList from './pages/pharmacy/SalesList';
import NewSale from './pages/pharmacy/NewSale';
import StockAdjustments from './pages/pharmacy/StockAdjustments';
import PendingPrescriptions from './pages/pharmacy/PendingPrescriptions';
import DispensingScreen from './pages/pharmacy/DispensingScreen';
import DispensingBilling from './pages/pharmacy/DispensingBilling';

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

// Billing pages
import InvoiceList from './pages/InvoiceList';
import InvoiceCreate from './pages/InvoiceCreate';
import InvoiceDetail from './pages/InvoiceDetail';
import PaymentList from './pages/PaymentList';
import RefundList from './pages/RefundList';
import SettlementList from './pages/SettlementList';
import InsuranceClaims from './pages/InsuranceClaims';
import CreditNotes from './pages/CreditNotes';
import InsuranceProviders from './pages/InsuranceProviders';

// Inventory additional pages
import LowStockAlertsPage from './pages/inventory/LowStockAlertsPage';
import GRNReceiptForm from './pages/inventory/GRNReceiptForm';
import StockMovementsReportPage from './pages/inventory/StockMovementsReportPage';
import CycleCountDetailPage from './pages/inventory/CycleCountDetailPage';

// Analytics
import AnalyticsDashboard from './pages/analytics/AnalyticsDashboard';

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
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'receptionist', 'nurse', 'pharmacist', 'doctor']}>
                  <PatientList />
                </ProtectedRoute>
              } />
              <Route path="/patients/:id" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'receptionist', 'nurse', 'pharmacist', 'doctor']}>
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
                <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
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

              {/* ── Pharmacy Routes ── */}
              <Route path="/pharmacy" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'pharmacist', 'inventory_manager']}>
                  <PharmacyDashboard />
                </ProtectedRoute>
              } />
              <Route path="/pharmacy/medicines" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'pharmacist', 'inventory_manager']}>
                  <MedicineList />
                </ProtectedRoute>
              } />
              <Route path="/pharmacy/medicines/new" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'pharmacist', 'inventory_manager']}>
                  <MedicineForm />
                </ProtectedRoute>
              } />
              <Route path="/pharmacy/medicines/:id" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'pharmacist', 'inventory_manager']}>
                  <MedicineDetail />
                </ProtectedRoute>
              } />
              <Route path="/pharmacy/medicines/:id/edit" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'pharmacist', 'inventory_manager']}>
                  <MedicineForm />
                </ProtectedRoute>
              } />
              <Route path="/pharmacy/batches/new" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'pharmacist', 'inventory_manager']}>
                  <BatchForm />
                </ProtectedRoute>
              } />
              <Route path="/pharmacy/sales" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'pharmacist', 'cashier']}>
                  <SalesList />
                </ProtectedRoute>
              } />
              <Route path="/pharmacy/sales/new" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'pharmacist', 'cashier']}>
                  <NewSale />
                </ProtectedRoute>
              } />
              <Route path="/pharmacy/stock-adjustments" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'pharmacist', 'inventory_manager']}>
                  <StockAdjustments />
                </ProtectedRoute>
              } />
              <Route path="/pharmacy/pending-prescriptions" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'pharmacist', 'inventory_manager']}>
                  <PendingPrescriptions />
                </ProtectedRoute>
              } />
              <Route path="/pharmacy/dispense/:prescriptionId" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'pharmacist', 'inventory_manager']}>
                  <DispensingScreen />
                </ProtectedRoute>
              } />
              <Route path="/pharmacy/dispensing/:dispensingId/billing" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'pharmacist', 'cashier', 'inventory_manager']}>
                  <DispensingBilling />
                </ProtectedRoute>
              } />

              {/* ── Inventory Routes ── */}
              <Route path="/inventory" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'inventory_manager', 'pharmacist']}>
                  <InventoryDashboard />
                </ProtectedRoute>
              } />
              <Route path="/inventory/low-stock" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'inventory_manager', 'pharmacist']}>
                  <LowStockAlertsPage />
                </ProtectedRoute>
              } />
              <Route path="/inventory/suppliers" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'inventory_manager', 'pharmacist']}>
                  <SuppliersPage />
                </ProtectedRoute>
              } />
              <Route path="/inventory/purchase-orders" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'inventory_manager', 'pharmacist']}>
                  <PurchaseOrdersPage />
                </ProtectedRoute>
              } />
              <Route path="/inventory/purchase-orders/new" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'inventory_manager', 'pharmacist']}>
                  <NewPurchaseOrderPage />
                </ProtectedRoute>
              } />
              <Route path="/inventory/grns" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'inventory_manager', 'pharmacist']}>
                  <GRNsPage />
                </ProtectedRoute>
              } />
              <Route path="/inventory/grns/new" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'inventory_manager', 'pharmacist']}>
                  <GRNReceiptForm />
                </ProtectedRoute>
              } />
              <Route path="/inventory/grns/:grnId" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'inventory_manager', 'pharmacist']}>
                  <GRNReceiptForm />
                </ProtectedRoute>
              } />
              <Route path="/inventory/stock-movements" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'inventory_manager', 'pharmacist']}>
                  <StockMovementsReportPage />
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
              <Route path="/inventory/cycle-counts/new" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'inventory_manager']}>
                  <CycleCountDetailPage />
                </ProtectedRoute>
              } />
              <Route path="/inventory/cycle-counts/:ccId" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'inventory_manager']}>
                  <CycleCountDetailPage />
                </ProtectedRoute>
              } />

              {/* ── Billing Routes ── */}
              <Route path="/billing/invoices" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'cashier', 'pharmacist', 'receptionist', 'doctor']}>
                  <InvoiceList />
                </ProtectedRoute>
              } />
              <Route path="/billing/invoices/new" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'cashier', 'pharmacist']}>
                  <InvoiceCreate />
                </ProtectedRoute>
              } />
              <Route path="/billing/invoices/:id" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'cashier', 'pharmacist', 'receptionist', 'doctor']}>
                  <InvoiceDetail />
                </ProtectedRoute>
              } />
              <Route path="/billing/payments" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'cashier', 'pharmacist', 'receptionist', 'doctor']}>
                  <PaymentList />
                </ProtectedRoute>
              } />
              <Route path="/billing/refunds" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'cashier', 'pharmacist']}>
                  <RefundList />
                </ProtectedRoute>
              } />
              <Route path="/billing/settlements" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin', 'cashier', 'pharmacist']}>
                  <SettlementList />
                </ProtectedRoute>
              } />
              <Route path="/billing/insurance-claims" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                  <InsuranceClaims />
                </ProtectedRoute>
              } />
              <Route path="/billing/credit-notes" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                  <CreditNotes />
                </ProtectedRoute>
              } />
              <Route path="/billing/insurance-providers" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                  <InsuranceProviders />
                </ProtectedRoute>
              } />

              {/* ── Analytics ── */}
              <Route path="/analytics" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                  <AnalyticsDashboard />
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
