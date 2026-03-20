import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { EmployeeProvider } from './contexts/EmployeeContext';
import { ToastProvider } from './contexts/ToastContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AdminLayout } from './components/layout/AdminLayout';
import { VendorLayout } from './components/layout/VendorLayout';
import { PublicLayout } from './components/layout/PublicLayout';
import { EmployeeLayout } from './components/layout/EmployeeLayout';

// Pages
import { Login } from './pages/Login';
import { PortalSelect } from './pages/PortalSelect';
import { EmployeePortalLogin } from './pages/employee/EmployeePortalLogin';
import { Dashboard } from './pages/Dashboard';
import { Consignors } from './pages/Consignors';
import { ConsignorDetail } from './pages/ConsignorDetail';
import { Inventory } from './pages/Inventory';
import { AddItems } from './pages/AddItems';
import { ImportCSV } from './pages/ImportCSV';
import { Labels } from './pages/Labels';
import { POS } from './pages/POS';
import { Sales } from './pages/Sales';
import { Payouts } from './pages/Payouts';
import { Customers } from './pages/Customers';
import { Employees } from './pages/Employees';
import { EmployeeRoleSettings } from './pages/EmployeeRoleSettings';
import { EmployeeSchedule } from './pages/EmployeeSchedule';
import { EmployeePayouts } from './pages/EmployeePayouts';
import { Integrations } from './pages/Integrations';
import { ShopifySetup } from './pages/ShopifySetup';
import { ScanInventory } from './pages/ScanInventory';
import { Display } from './pages/Display';
import { CategoryTaxSettings } from './pages/CategoryTaxSettings';
import { Messages } from './pages/Messages';
import { AdminProfile } from './pages/AdminProfile';
import { EmailCampaigns } from './pages/EmailCampaigns';
import { MarketingFees } from './pages/MarketingFees';
import { Invoices } from './pages/Invoices';

// Vendor Pages
import { VendorDashboard } from './pages/vendor/VendorDashboard';
import { VendorInventory } from './pages/vendor/VendorInventory';
import { VendorImportCSV } from './pages/vendor/VendorImportCSV';
import { VendorLabels } from './pages/vendor/VendorLabels';
import { VendorSales } from './pages/vendor/VendorSales';
import { VendorPayouts } from './pages/vendor/VendorPayouts';
import { VendorProfile } from './pages/vendor/VendorProfile';
import { VendorStorefront } from './pages/vendor/VendorStorefront';

// Employee Pages
import { EmployeeLogin } from './pages/employee/EmployeeLogin';
import { EmployeeActionSelection } from './pages/employee/EmployeeActionSelection';
import { EmployeeSchedule as EmployeeSelfSchedule } from './pages/employee/EmployeeSchedule';
import { EmployeePortalDashboard } from './pages/employee/EmployeePortalDashboard';

// Public Pages
import { BrowsePage } from './pages/public/BrowsePage';
import { ItemDetailPage } from './pages/public/ItemDetailPage';
import { VendorPage } from './pages/public/VendorPage';
import { CategoryPage } from './pages/public/CategoryPage';
import { CategoriesPage } from './pages/public/CategoriesPage';
import { VendorsPage } from './pages/public/VendorsPage';

export default function App() {
    return (
        <AuthProvider>
            <ToastProvider>
                <EmployeeProvider>
                    <Routes>
                    {/* Public Storefront Routes */}
                    <Route element={<PublicLayout />}>
                        <Route path="/" element={<BrowsePage />} />
                        <Route path="/categories" element={<CategoriesPage />} />
                        <Route path="/vendors" element={<VendorsPage />} />
                        <Route path="/vendor/:vendorSlug/:itemSlug" element={<ItemDetailPage />} />
                        <Route path="/item/:id" element={<ItemDetailPage />} />
                        <Route path="/vendor/:id" element={<VendorPage />} />
                        <Route path="/category/:category" element={<CategoryPage />} />
                    </Route>

                    {/* Login Routes */}
                    <Route path="/login" element={<Login />} />
                    <Route path="/portal-select" element={<PortalSelect />} />
                    <Route path="/employee/login" element={<EmployeeLogin />} />
                    <Route path="/employee/portal-login" element={<EmployeePortalLogin />} />

                    {/* Customer Display - Standalone Route */}
                    <Route path="/display" element={<Display />} />

                    {/* Employee Action Selection - Full screen, no sidebar */}
                    <Route path="/employee/action-selection" element={<EmployeeActionSelection />} />

                    {/* Employee Routes - PIN-based auth, separate from admin/vendor */}
                    <Route path="/employee" element={<EmployeeLayout />}>
                        <Route index element={<Navigate to="/employee/action-selection" replace />} />
                        <Route path="pos" element={<POS />} />
                        <Route path="schedule" element={<EmployeeSelfSchedule />} />
                        <Route path="customers" element={<Customers />} />
                        <Route path="labels" element={<Labels />} />
                        <Route path="messages" element={<Messages />} />
                    </Route>

                    {/* Employee Portal Routes - email/password auth */}
                    <Route
                        path="/employee-portal"
                        element={
                            <ProtectedRoute requiredRole="employee">
                                <EmployeePortalDashboard />
                            </ProtectedRoute>
                        }
                    />

                    {/* Admin Routes */}
                    <Route
                        path="/admin"
                        element={
                            <ProtectedRoute requiredRole="admin">
                                <AdminLayout />
                            </ProtectedRoute>
                        }
                    >
                        <Route index element={<Dashboard />} />
                        <Route path="consignors" element={<Consignors />} />
                        <Route path="consignors/:id" element={<ConsignorDetail />} />
                        <Route path="inventory" element={<Inventory />} />
                        <Route path="add-items" element={<AddItems />} />
                        <Route path="scan" element={<ScanInventory />} />
                        <Route path="import" element={<ImportCSV />} />
                        <Route path="labels" element={<Labels />} />
                        <Route path="pos" element={<POS />} />
                        <Route path="sales" element={<Sales />} />
                        <Route path="payouts" element={<Payouts />} />
                        <Route path="finances/invoices" element={<Invoices />} />
                        <Route path="finances/categories" element={<CategoryTaxSettings />} />
                        <Route path="finances/marketing-fees" element={<MarketingFees />} />
                        <Route path="customers" element={<Customers />} />
                        <Route path="employees" element={<Employees />} />
                        <Route path="employees/roles" element={<EmployeeRoleSettings />} />
                        <Route path="employees/schedule" element={<EmployeeSchedule />} />
                        <Route path="employees/payouts" element={<EmployeePayouts />} />
                        <Route path="integrations" element={<Integrations />} />
                        <Route path="shopify-setup" element={<ShopifySetup />} />
                        <Route path="messages" element={<Messages />} />
                        <Route path="email-campaigns" element={<EmailCampaigns />} />
                        <Route path="profile" element={<AdminProfile />} />
                    </Route>

                    {/* Vendor Routes */}
                    <Route
                        path="/vendor"
                        element={
                            <ProtectedRoute requiredRole="vendor">
                                <VendorLayout />
                            </ProtectedRoute>
                        }
                    >
                        <Route index element={<VendorDashboard />} />
                        <Route path="inventory" element={<VendorInventory />} />
                        <Route path="import" element={<VendorImportCSV />} />
                        <Route path="labels" element={<VendorLabels />} />
                        <Route path="sales" element={<VendorSales />} />
                        <Route path="payouts" element={<VendorPayouts />} />
                        <Route path="storefront" element={<VendorStorefront />} />
                        <Route path="profile" element={<VendorProfile />} />
                        <Route path="messages" element={<Messages />} />
                    </Route>

                    {/* Catch all - redirect to storefront */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </EmployeeProvider>
            </ToastProvider>
        </AuthProvider>
    );
}
