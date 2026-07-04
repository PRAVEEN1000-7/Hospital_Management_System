import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { SuperAdminProvider } from './contexts/SuperAdminContext';
import { DashboardRefreshProvider } from './contexts/DashboardRefreshContext';
import { NotificationProvider } from './contexts/NotificationContext';
import ToastContainer from './components/common/ToastContainer';
import NotificationContainer from './components/common/NotificationContainer';
import ProtectedRoute from './components/common/ProtectedRoute';
import Layout from './components/common/Layout';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';

// Super Admin imports
import SuperAdminLayout from './components/SuperAdmin/SuperAdminLayout';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import SuperAdminHospitals from './pages/SuperAdminHospitals';
import SuperAdminCreateHospital from './pages/SuperAdminCreateHospital';
import SuperAdminHospitalDetail from './pages/SuperAdminHospitalDetail';
import SuperAdminHospitalEdit from './pages/SuperAdminHospitalEdit';
import SuperAdminPlans from './pages/SuperAdminPlans';
import SuperAdminProfile from './pages/SuperAdminProfile';
import SuperAdminAudit from './pages/SuperAdminAudit';
import SuperAdminMedicines from './pages/SuperAdminMedicines';
import MultiTenantControl from './pages/MultiTenantControl';
import Dashboard from './pages/Dashboard';
import Register from './pages/Register';
import PatientList from './pages/PatientList';
import PatientDetail from './pages/PatientDetail';
import PatientIdCard from './pages/PatientIdCard';
import UserManagement from './pages/UserManagement';
import StaffDirectory from './pages/StaffDirectory';
import Profile from './pages/Profile';
import HospitalSetup from './pages/HospitalSetup';
import HospitalSettings from './pages/HospitalSettings';
import Subscription from './pages/Subscription';

// Appointment pages
import AppointmentBooking from './pages/AppointmentBooking';
import WalkInRegistration from './pages/WalkInRegistration';
import WalkInQueue from './pages/WalkInQueue';
import PublicQueueDisplay from './pages/PublicQueueDisplay';
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
import PharmacyQueue from './pages/pharmacy/PharmacyQueue';

// Optical Store pages
import OpticalDashboard from './pages/optical/OpticalDashboard';
import OpticalProductList from './pages/optical/OpticalProductList';
import OpticalProductDetail from './pages/optical/OpticalProductDetail';
import OpticalProductForm from './pages/optical/OpticalProductForm';
import OpticalBatchForm from './pages/optical/OpticalBatchForm';
import OpticalPrescriptions from './pages/optical/OpticalPrescriptions';
import OpticalPrescriptionDetail from './pages/optical/OpticalPrescriptionDetail';
import OpticalSales from './pages/optical/OpticalSales';
import NewOpticalSale from './pages/optical/NewOpticalSale';
import OpticalStockAdjustments from './pages/optical/OpticalStockAdjustments';
import OpticalQueue from './pages/optical/OpticalQueue';
import OpticalPendingPrescriptions from './pages/optical/OpticalPendingPrescriptions';

// Inventory pages
import InventoryDashboard from './pages/inventory/InventoryDashboard';
import SuppliersPage from './pages/inventory/SuppliersPage';
import PurchaseOrdersPage from './pages/inventory/PurchaseOrdersPage';
import NewPurchaseOrderPage from './pages/inventory/NewPurchaseOrderPage';
import GRNsPage from './pages/inventory/GRNsPage';
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

const DefaultRedirect: React.FC = () => {
  const { user } = useAuth();
  return <Navigate to={user?.roles?.includes('super_admin') ? '/superadmin' : '/dashboard'} replace />;
};

// Wrapper component to get auth context values for NotificationProvider
const AppWithNotifications: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  return (
    <NotificationProvider
      userId={user?.id}
      userRole={user?.roles?.[0]}
      userRoles={user?.roles}
    >
      {children}
    </NotificationProvider>
  );
};

const App: React.FC = () => {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <ToastProvider>
          <ConfirmProvider>
            <DashboardRefreshProvider>
              <AppWithNotifications>
                <ToastContainer />
                <NotificationContainer />
                <Routes>
            {/* Public */}
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            {/* Public Queue Display kiosk — no auth, no Layout/sidebar. Scoped to one
                hospital by its public code (BRD v1.1 §3). */}
            <Route path="/public/queue/:hospitalCode" element={<PublicQueueDisplay />} />

            {/* Super Admin routes — separate layout, no module gating */}
            <Route
              element={
                <ProtectedRoute allowedRoles={['super_admin']}>
                  <SuperAdminProvider>
                    <SuperAdminLayout />
                  </SuperAdminProvider>
                </ProtectedRoute>
              }
            >
              <Route path="/superadmin">
                <Route index element={<SuperAdminDashboard />} />
                <Route path="hospitals" element={<SuperAdminHospitals />} />
                <Route path="hospitals/new" element={<SuperAdminCreateHospital />} />
                <Route path="hospitals/:id" element={<SuperAdminHospitalDetail />} />
                <Route path="hospitals/:id/edit" element={<SuperAdminHospitalEdit />} />
                <Route path="plans" element={<SuperAdminPlans />} />
                <Route path="medicines" element={<SuperAdminMedicines />} />
                <Route path="audit" element={<SuperAdminAudit />} />
                <Route path="profile" element={<SuperAdminProfile />} />
              </Route>
              <Route path="/multitenant" element={<MultiTenantControl />} />
            </Route>

            {/* Regular protected routes */}
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              {/* ── General (always accessible) ── */}
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/subscription" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                  <Subscription />
                </ProtectedRoute>
              } />

              {/* ── Admin / Super-admin only ── */}
              <Route path="/staff" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                  <StaffDirectory />
                </ProtectedRoute>
              } />
              <Route path="/user-management" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                  <UserManagement />
                </ProtectedRoute>
              } />
              <Route path="/hospital-setup" element={
                <ProtectedRoute allowedRoles={['super_admin']}>
                  <HospitalSetup />
                </ProtectedRoute>
              } />
              <Route path="/settings" element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
                  <HospitalSettings />
                </ProtectedRoute>
              } />

              {/* ── Patients module ── */}
              <Route path="/patients" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'receptionist', 'nurse', 'pharmacist', 'doctor']}
                  requiredModule="patients"
                >
                  <PatientList />
                </ProtectedRoute>
              } />
              <Route path="/patients/:id" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'receptionist', 'nurse', 'pharmacist', 'doctor']}
                  requiredModule="patients"
                >
                  <PatientDetail />
                </ProtectedRoute>
              } />
              <Route path="/patients/:id/id-card" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'receptionist']}
                  requiredModule="patients"
                >
                  <PatientIdCard />
                </ProtectedRoute>
              } />
              <Route path="/register" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'receptionist']}
                  requiredModule="patients"
                >
                  <Register />
                </ProtectedRoute>
              } />

              {/* ── Appointments module ── */}
              <Route path="/appointments/book" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'receptionist']}
                  requiredModule="appointments"
                >
                  <AppointmentBooking />
                </ProtectedRoute>
              } />
              <Route path="/appointments/walk-in" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'receptionist']}
                  requiredModule="appointments"
                >
                  <WalkInRegistration />
                </ProtectedRoute>
              } />
              <Route path="/appointments/queue" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'receptionist', 'doctor', 'nurse']}
                  requiredModule="appointments"
                >
                  <WalkInQueue />
                </ProtectedRoute>
              } />
              <Route path="/appointments/doctor-schedule" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'doctor']}
                  requiredModule="appointments"
                >
                  <DoctorSchedule />
                </ProtectedRoute>
              } />
              <Route path="/appointments/my-schedule" element={
                <ProtectedRoute
                  allowedRoles={['doctor']}
                  requiredModule="appointments"
                >
                  <DoctorAppointments />
                </ProtectedRoute>
              } />
              <Route path="/appointments/my-appointments" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin']}
                  requiredModule="appointments"
                >
                  <MyAppointments />
                </ProtectedRoute>
              } />
              <Route path="/appointments/manage" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'receptionist', 'nurse']}
                  requiredModule="appointments"
                >
                  <AppointmentManagement />
                </ProtectedRoute>
              } />
              <Route path="/appointments/waitlist" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'doctor', 'receptionist']}
                  requiredModule="appointments"
                >
                  <WaitlistManagement />
                </ProtectedRoute>
              } />
              <Route path="/appointments/reports" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin']}
                  requiredModule="appointments"
                >
                  <AppointmentReports />
                </ProtectedRoute>
              } />
              <Route path="/appointments/settings" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin']}
                  requiredModule="appointments"
                >
                  <AppointmentSettings />
                </ProtectedRoute>
              } />

              {/* ── Prescriptions module ── */}
              <Route path="/prescriptions" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'doctor', 'nurse', 'pharmacist']}
                  requiredModule="prescriptions"
                >
                  <PrescriptionList />
                </ProtectedRoute>
              } />
              <Route path="/prescriptions/new" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'doctor']}
                  requiredModule="prescriptions"
                >
                  <PrescriptionBuilder />
                </ProtectedRoute>
              } />
              <Route path="/prescriptions/:id" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'doctor', 'nurse', 'pharmacist']}
                  requiredModule="prescriptions"
                >
                  <PrescriptionDetail />
                </ProtectedRoute>
              } />
              <Route path="/prescriptions/:id/edit" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'doctor']}
                  requiredModule="prescriptions"
                >
                  <PrescriptionBuilder />
                </ProtectedRoute>
              } />

              {/* ── Pharmacy module ── */}
              <Route path="/pharmacy" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'pharmacist', 'inventory_manager']}
                  requiredModule="pharmacy"
                >
                  <PharmacyDashboard />
                </ProtectedRoute>
              } />
              <Route path="/pharmacy/medicines" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'pharmacist', 'inventory_manager']}
                  requiredModule="pharmacy"
                >
                  <MedicineList />
                </ProtectedRoute>
              } />
              <Route path="/pharmacy/medicines/new" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'pharmacist', 'inventory_manager']}
                  requiredModule="pharmacy"
                >
                  <MedicineForm />
                </ProtectedRoute>
              } />
              <Route path="/pharmacy/medicines/:id" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'pharmacist', 'inventory_manager']}
                  requiredModule="pharmacy"
                >
                  <MedicineDetail />
                </ProtectedRoute>
              } />
              <Route path="/pharmacy/medicines/:id/edit" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'pharmacist', 'inventory_manager']}
                  requiredModule="pharmacy"
                >
                  <MedicineForm />
                </ProtectedRoute>
              } />
              <Route path="/pharmacy/batches/new" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'pharmacist', 'inventory_manager']}
                  requiredModule="pharmacy"
                >
                  <BatchForm />
                </ProtectedRoute>
              } />
              <Route path="/pharmacy/sales" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'pharmacist', 'cashier', 'inventory_manager']}
                  requiredModule="pharmacy"
                >
                  <SalesList />
                </ProtectedRoute>
              } />
              <Route path="/pharmacy/sales/new" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'pharmacist', 'cashier']}
                  requiredModule="pharmacy"
                >
                  <NewSale />
                </ProtectedRoute>
              } />
              <Route path="/pharmacy/stock-adjustments" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'pharmacist', 'inventory_manager']}
                  requiredModule="pharmacy"
                >
                  <StockAdjustments />
                </ProtectedRoute>
              } />
              <Route path="/pharmacy/queue" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'pharmacist', 'cashier', 'inventory_manager']}
                  requiredModule="pharmacy"
                  requireEyeHospitalFeature
                >
                  <PharmacyQueue />
                </ProtectedRoute>
              } />
              <Route path="/pharmacy/pending-prescriptions" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'pharmacist', 'inventory_manager']}
                  requiredModule="pharmacy"
                >
                  <PendingPrescriptions />
                </ProtectedRoute>
              } />
              <Route path="/pharmacy/dispense/:prescriptionId" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'pharmacist', 'inventory_manager']}
                  requiredModule="pharmacy"
                >
                  <DispensingScreen />
                </ProtectedRoute>
              } />
              <Route path="/pharmacy/dispensing/:dispensingId/billing" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'pharmacist', 'cashier', 'inventory_manager']}
                  requiredModule="pharmacy"
                >
                  <DispensingBilling />
                </ProtectedRoute>
              } />

              {/* ── Optical Store module ── */}
              <Route path="/optical" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'doctor', 'optical_staff']}
                  requiredModule="optical"
                >
                  <OpticalDashboard />
                </ProtectedRoute>
              } />
              <Route path="/optical/products" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'doctor', 'optical_staff']}
                  requiredModule="optical"
                >
                  <OpticalProductList />
                </ProtectedRoute>
              } />
              <Route path="/optical/products/new" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'optical_staff']}
                  requiredModule="optical"
                >
                  <OpticalProductForm />
                </ProtectedRoute>
              } />
              <Route path="/optical/products/:id" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'doctor', 'optical_staff']}
                  requiredModule="optical"
                >
                  <OpticalProductDetail />
                </ProtectedRoute>
              } />
              <Route path="/optical/products/:id/edit" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'optical_staff']}
                  requiredModule="optical"
                >
                  <OpticalProductForm />
                </ProtectedRoute>
              } />
              <Route path="/optical/batches/new" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'optical_staff']}
                  requiredModule="optical"
                >
                  <OpticalBatchForm />
                </ProtectedRoute>
              } />
              <Route path="/optical/prescriptions/pending" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'optical_staff']}
                  requiredModule="optical"
                >
                  <OpticalPendingPrescriptions />
                </ProtectedRoute>
              } />
              <Route path="/optical/prescriptions" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'doctor', 'optical_staff']}
                  requiredModule="optical"
                >
                  <OpticalPrescriptions />
                </ProtectedRoute>
              } />
              <Route path="/optical/prescriptions/:id" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'doctor', 'optical_staff']}
                >
                  <OpticalPrescriptionDetail />
                </ProtectedRoute>
              } />
              <Route path="/optical/sales" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'doctor', 'optical_staff']}
                  requiredModule="optical"
                >
                  <OpticalSales />
                </ProtectedRoute>
              } />
              <Route path="/optical/sales/new" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'optical_staff']}
                  requiredModule="optical"
                >
                  <NewOpticalSale />
                </ProtectedRoute>
              } />
              <Route path="/optical/stock-adjustments" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'optical_staff']}
                  requiredModule="optical"
                >
                  <OpticalStockAdjustments />
                </ProtectedRoute>
              } />
              <Route path="/optical/queue" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'optical_staff']}
                  requiredModule="optical"
                >
                  <OpticalQueue />
                </ProtectedRoute>
              } />

              {/* ── Inventory module ── */}
              <Route path="/inventory" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'inventory_manager', 'pharmacist']}
                  requiredModule="inventory"
                >
                  <InventoryDashboard />
                </ProtectedRoute>
              } />
              <Route path="/inventory/low-stock" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'inventory_manager', 'pharmacist']}
                  requiredModule="inventory"
                >
                  <LowStockAlertsPage />
                </ProtectedRoute>
              } />
              <Route path="/inventory/suppliers" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'inventory_manager', 'pharmacist']}
                  requiredModule="inventory"
                >
                  <SuppliersPage />
                </ProtectedRoute>
              } />
              <Route path="/inventory/purchase-orders" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'inventory_manager', 'pharmacist']}
                  requiredModule="inventory"
                >
                  <PurchaseOrdersPage />
                </ProtectedRoute>
              } />
              <Route path="/inventory/purchase-orders/new" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'inventory_manager', 'pharmacist']}
                  requiredModule="inventory"
                >
                  <NewPurchaseOrderPage />
                </ProtectedRoute>
              } />
              <Route path="/inventory/grns" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'inventory_manager', 'pharmacist']}
                  requiredModule="inventory"
                >
                  <GRNsPage />
                </ProtectedRoute>
              } />
              <Route path="/inventory/grns/new" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'inventory_manager', 'pharmacist']}
                  requiredModule="inventory"
                >
                  <GRNReceiptForm />
                </ProtectedRoute>
              } />
              <Route path="/inventory/grns/:grnId" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'inventory_manager', 'pharmacist']}
                  requiredModule="inventory"
                >
                  <GRNReceiptForm />
                </ProtectedRoute>
              } />
              <Route path="/inventory/stock-movements" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'inventory_manager', 'pharmacist']}
                  requiredModule="inventory"
                >
                  <StockMovementsReportPage />
                </ProtectedRoute>
              } />
              <Route path="/inventory/adjustments" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'inventory_manager']}
                  requiredModule="inventory"
                >
                  <AdjustmentsPage />
                </ProtectedRoute>
              } />
              <Route path="/inventory/cycle-counts" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'inventory_manager']}
                  requiredModule="inventory"
                >
                  <CycleCountsPage />
                </ProtectedRoute>
              } />
              <Route path="/inventory/cycle-counts/new" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'inventory_manager']}
                  requiredModule="inventory"
                >
                  <CycleCountDetailPage />
                </ProtectedRoute>
              } />
              <Route path="/inventory/cycle-counts/:ccId" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'inventory_manager']}
                  requiredModule="inventory"
                >
                  <CycleCountDetailPage />
                </ProtectedRoute>
              } />

              {/* ── Billing module ── */}
              <Route path="/billing/invoices" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'cashier', 'pharmacist', 'receptionist', 'doctor']}
                  requiredModule="billing"
                >
                  <InvoiceList />
                </ProtectedRoute>
              } />
              <Route path="/billing/invoices/new" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'cashier', 'pharmacist', 'receptionist']}
                  requiredModule="billing"
                >
                  <InvoiceCreate />
                </ProtectedRoute>
              } />
              <Route path="/billing/invoices/:id" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'cashier', 'pharmacist', 'receptionist', 'doctor']}
                  requiredModule="billing"
                >
                  <InvoiceDetail />
                </ProtectedRoute>
              } />
              <Route path="/billing/payments" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'cashier', 'pharmacist', 'receptionist', 'doctor']}
                  requiredModule="billing"
                >
                  <PaymentList />
                </ProtectedRoute>
              } />
              <Route path="/billing/refunds" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'cashier', 'pharmacist']}
                  requiredModule="billing"
                >
                  <RefundList />
                </ProtectedRoute>
              } />
              <Route path="/billing/settlements" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin', 'cashier', 'pharmacist']}
                  requiredModule="billing"
                >
                  <SettlementList />
                </ProtectedRoute>
              } />
              <Route path="/billing/insurance-claims" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin']}
                  requiredModule="billing"
                >
                  <InsuranceClaims />
                </ProtectedRoute>
              } />
              <Route path="/billing/credit-notes" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin']}
                  requiredModule="billing"
                >
                  <CreditNotes />
                </ProtectedRoute>
              } />
              <Route path="/billing/insurance-providers" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin']}
                  requiredModule="billing"
                >
                  <InsuranceProviders />
                </ProtectedRoute>
              } />

              {/* ── Analytics module ── */}
              <Route path="/analytics" element={
                <ProtectedRoute
                  allowedRoles={['super_admin', 'admin']}
                  requiredModule="analytics"
                >
                  <AnalyticsDashboard />
                </ProtectedRoute>
              } />

            </Route>

            {/* Redirects */}
            <Route path="/" element={<DefaultRedirect />} />
            <Route path="/change-password" element={<Navigate to="/profile" replace />} />
            <Route path="*" element={<DefaultRedirect />} />
            </Routes>
              </AppWithNotifications>
            </DashboardRefreshProvider>
          </ConfirmProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;