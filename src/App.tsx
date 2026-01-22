import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { EmployeeProvider } from './contexts/EmployeeContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AdminLayout } from './components/layout/AdminLayout';
import { VendorLayout } from './components/layout/VendorLayout';
import { PublicLayout } from './components/layout/PublicLayout';
import { EmployeeLayout } from './components/layout/EmployeeLayout';

// Pages
import { Login } from './pages/Login';
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
import { Integrations } from './pages/Integrations';
import { ShopifySetup } from './pages/ShopifySetup';
import { ScanInventory } from './pages/ScanInventory';

// Vendor Pages
import { VendorDashboard } from './pages/vendor/VendorDashboard';
import { VendorInventory } from './pages/vendor/VendorInventory';
import { VendorSales } from './pages/vendor/VendorSales';
import { VendorPayouts } from './pages/vendor/VendorPayouts';
import { VendorProfile } from './pages/vendor/VendorProfile';

// Employee Pages
import { EmployeeLogin } from './pages/employee/EmployeeLogin';
import { EmployeeActionSelection } from './pages/employee/EmployeeActionSelection';

// Public Pages
import { BrowsePage } from './pages/public/BrowsePage';
import { ItemDetailPage } from './pages/public/ItemDetailPage';
import { VendorPage } from './pages/public/VendorPage';
import { CategoryPage } from './pages/public/CategoryPage';

export default function App() {
    return (
        <AuthProvider>
            <EmployeeProvider>
                <Routes>
                    {/* Public Storefront Routes */}
                    <Route element={<PublicLayout />}>
                        <Route path="/" element={<BrowsePage />} />
                        <Route path="/item/:id" element={<ItemDetailPage />} />
                        <Route path="/vendor/:id" element={<VendorPage />} />
                        <Route path="/category/:category" element={<CategoryPage />} />
                    </Route>

                    {/* Login Routes */}
                    <Route path="/login" element={<Login />} />
                    <Route path="/employee/login" element={<EmployeeLogin />} />

                    {/* Employee Action Selection - Full screen, no sidebar */}
                    <Route path="/employee/action-selection" element={<EmployeeActionSelection />} />

                    {/* Employee Routes - PIN-based auth, separate from admin/vendor */}
                    <Route path="/employee" element={<EmployeeLayout />}>
                        <Route index element={<Navigate to="/employee/action-selection" replace />} />
                        <Route path="pos" element={<POS />} />
                        <Route path="customers" element={<Customers />} />
                        <Route path="labels" element={<Labels />} />
                    </Route>

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
                        <Route path="customers" element={<Customers />} />
                        <Route path="employees" element={<Employees />} />
                        <Route path="integrations" element={<Integrations />} />
                        <Route path="shopify-setup" element={<ShopifySetup />} />
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
                        <Route path="sales" element={<VendorSales />} />
                        <Route path="payouts" element={<VendorPayouts />} />
                        <Route path="profile" element={<VendorProfile />} />
                    </Route>

                    {/* Catch all - redirect to storefront */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </EmployeeProvider>
        </AuthProvider>
    );
}
