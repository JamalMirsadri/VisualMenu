import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { PlatformSettingsProvider } from './context/PlatformSettingsContext';
import { ProtectedRoute } from './components/admin/ProtectedRoute';
import { AdminLayout } from './components/admin/AdminLayout';
import { AdminLoginPage } from './pages/admin/AdminLoginPage';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminFloorPage } from './pages/admin/AdminFloorPage';
import { AdminOrdersPage } from './pages/admin/AdminOrdersPage';
import { AdminKitchenPage } from './pages/admin/AdminKitchenPage';
import { AdminTablesPage } from './pages/admin/AdminTablesPage';
import { AdminCategoriesPage } from './pages/admin/AdminCategoriesPage';
import { AdminFoodsPage } from './pages/admin/AdminFoodsPage';
import { AdminMediaPage } from './pages/admin/AdminMediaPage';
import { AdminMenuPreviewPage } from './pages/admin/AdminMenuPreviewPage';
import { AdminRestaurantPage } from './pages/admin/AdminRestaurantPage';
import { AdminQrPage } from './pages/admin/AdminQrPage';
import { AdminPaymentsPage } from './pages/admin/AdminPaymentsPage';
import { AdminPaymentSettingsPage } from './pages/admin/AdminPaymentSettingsPage';
import { AdminCashPage } from './pages/admin/AdminCashPage';
import { AdminCustomersPage } from './pages/admin/AdminCustomersPage';
import { CustomerOrderTrackingPage } from './pages/customer/CustomerOrderTrackingPage';
import { MenuPage } from './pages/MenuPage';
import { PlatformRoute } from './components/platform/PlatformRoute';
import { PlatformLayout } from './components/platform/PlatformLayout';
import { PlatformDashboardPage } from './pages/platform/PlatformDashboardPage';
import { PlatformRestaurantsPage } from './pages/platform/PlatformRestaurantsPage';
import { PlatformRestaurantDetailPage } from './pages/platform/PlatformRestaurantDetailPage';
import { PlatformCreateRestaurantPage } from './pages/platform/PlatformCreateRestaurantPage';
import { PlatformUsersPage } from './pages/platform/PlatformUsersPage';
import { PlatformAuditPage } from './pages/platform/PlatformAuditPage';
import { PlatformSettingsPage } from './pages/platform/PlatformSettingsPage';
import { OwnerOnboardingPage } from './pages/owner/OwnerOnboardingPage';
import { StaffOnboardingPage } from './pages/staff/StaffOnboardingPage';
import { AdminStaffPage } from './pages/admin/AdminStaffPage';
import { AdminSubscriptionPage } from './pages/admin/AdminSubscriptionPage';
import { AdminNotificationsPage } from './pages/admin/AdminNotificationsPage';
import { SubscriptionRequiredPage } from './pages/admin/SubscriptionRequiredPage';
import { PlatformSubscriptionPlansPage } from './pages/platform/PlatformSubscriptionPlansPage';
import { PlatformMessagesPage } from './pages/platform/PlatformMessagesPage';
import { PlatformQrTemplatesPage } from './pages/platform/PlatformQrTemplatesPage';
import { AdminQrPrintPage } from './pages/admin/AdminQrPrintPage';
import { AdminAnalyticsPage } from './pages/admin/AdminAnalyticsPage';
import { PermissionRoute } from './components/common/PermissionRoute';
import { FeatureGate } from './components/admin/FeatureGate';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <PlatformSettingsProvider>
        <AuthProvider>
          <Routes>
          {/* Customer Menu QR Routes */}
          <Route path="/menu/:slug" element={<MenuPage />} />
          <Route path="/menu/:slug/table/:tableNumber" element={<MenuPage />} />

          {/* Customer Live Order Tracking */}
          <Route path="/order/:publicOrderToken" element={<CustomerOrderTrackingPage />} />

          {/* Owner & Staff Onboarding Invitation Routes */}
          <Route path="/owner/onboarding/:token" element={<OwnerOnboardingPage />} />
          <Route path="/staff/onboarding/:token" element={<StaffOnboardingPage />} />

          {/* Admin Login Route */}
          <Route path="/admin/login" element={<AdminLoginPage />} />

          {/* Subscription Required Gate Page */}
          <Route
            path="/admin/subscription-required"
            element={
              <ProtectedRoute allowExpired={true}>
                <SubscriptionRequiredPage />
              </ProtectedRoute>
            }
          />

          {/* Protected Admin Management Panel */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<PermissionRoute permission="VIEW_DASHBOARD"><AdminDashboard /></PermissionRoute>} />
            <Route path="floor" element={<PermissionRoute permission="VIEW_TABLES"><AdminFloorPage /></PermissionRoute>} />
            <Route path="orders" element={<PermissionRoute permission="VIEW_ORDERS"><AdminOrdersPage /></PermissionRoute>} />
            <Route path="kitchen" element={<PermissionRoute permission="VIEW_KITCHEN"><AdminKitchenPage /></PermissionRoute>} />
            <Route path="payments" element={<PermissionRoute permission="VIEW_PAYMENTS"><AdminPaymentsPage /></PermissionRoute>} />
            <Route path="cash" element={<PermissionRoute permission="CONFIRM_CASH_PAYMENT"><AdminCashPage /></PermissionRoute>} />
            <Route path="customers" element={<PermissionRoute permission="VIEW_CUSTOMERS"><AdminCustomersPage /></PermissionRoute>} />
            <Route path="tables" element={<PermissionRoute permission="VIEW_TABLES"><AdminTablesPage /></PermissionRoute>} />
            <Route path="categories" element={<PermissionRoute permission="MANAGE_CATEGORIES"><AdminCategoriesPage /></PermissionRoute>} />
            <Route path="foods" element={<PermissionRoute permission="MANAGE_FOODS"><AdminFoodsPage /></PermissionRoute>} />
            <Route path="media" element={<PermissionRoute permission="VIEW_MEDIA"><AdminMediaPage /></PermissionRoute>} />
            <Route path="menu-preview" element={<PermissionRoute permission="VIEW_MENU"><AdminMenuPreviewPage /></PermissionRoute>} />
            <Route path="staff" element={<PermissionRoute permission="VIEW_STAFF"><AdminStaffPage /></PermissionRoute>} />
            <Route path="users" element={<PermissionRoute permission="VIEW_STAFF"><AdminStaffPage /></PermissionRoute>} />
            <Route path="subscription" element={<AdminSubscriptionPage />} />
            <Route path="notifications" element={<AdminNotificationsPage />} />
            <Route path="restaurants" element={<Navigate to="/admin/restaurant" replace />} />
            <Route path="restaurant" element={<PermissionRoute permission="MANAGE_RESTAURANT_SETTINGS"><AdminRestaurantPage /></PermissionRoute>} />
            <Route path="payment-settings" element={<PermissionRoute permission="MANAGE_RESTAURANT_SETTINGS"><AdminPaymentSettingsPage /></PermissionRoute>} />
            <Route path="qr" element={<PermissionRoute permission="VIEW_QR_CODES"><AdminQrPage /></PermissionRoute>} />
            <Route path="qr-print" element={<PermissionRoute permission="VIEW_QR_CODES"><AdminQrPrintPage /></PermissionRoute>} />
            <Route path="analytics" element={<FeatureGate feature="ADVANCED_ANALYTICS"><AdminAnalyticsPage /></FeatureGate>} />
          </Route>

          {/* Platform SaaS Management Panel */}
          <Route
            path="/platform"
            element={
              <PlatformRoute>
                <PlatformLayout />
              </PlatformRoute>
            }
          >
            <Route index element={<PlatformDashboardPage />} />
            <Route path="restaurants" element={<PlatformRestaurantsPage />} />
            <Route path="restaurants/create" element={<PlatformCreateRestaurantPage />} />
            <Route path="restaurants/:id" element={<PlatformRestaurantDetailPage />} />
            <Route path="subscriptions/plans" element={<PlatformSubscriptionPlansPage />} />
            <Route path="messages" element={<PlatformMessagesPage />} />
            <Route path="qr-templates" element={<PlatformQrTemplatesPage />} />
            <Route path="users" element={<PlatformUsersPage />} />
            <Route path="audit" element={<PlatformAuditPage />} />
            <Route path="settings" element={<PlatformSettingsPage />} />
          </Route>

          {/* Root Redirects to demo restaurant */}
          <Route path="/" element={<Navigate to="/menu/demo-restaurant" replace />} />
          <Route path="*" element={<Navigate to="/menu/demo-restaurant" replace />} />
          </Routes>
        </AuthProvider>
      </PlatformSettingsProvider>
    </BrowserRouter>
  );
};


export default App;
