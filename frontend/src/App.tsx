import { DirectionProvider } from "@radix-ui/react-direction";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import PlaceholderPage from "./pages/PlaceholderPage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";
import NotificationsPage from "./pages/NotificationsPage";
import NotificationSettingsPage from "./pages/NotificationSettingsPage";
import CollectionsPage from "./pages/CollectionsPage";
import RentalPropertiesPage from "./pages/RentalPropertiesPage";
import SalePropertiesPage from "./pages/SalePropertiesPage";
import UnitsPage from "./pages/UnitsPage";
import ClientsPage from "./pages/ClientsPage";
import UsersPage from "./pages/UsersPage";
import RequestsPage from "./pages/RequestsPage";
import RentalContractsPage from "./pages/RentalContractsPage";
import SaleContractsPage from "./pages/SaleContractsPage";
import PublicViewPage from "./pages/PublicViewPage";
import UserGuidePage from "./pages/UserGuidePage";
import AppLayout from "./components/AppLayout";
import { useDocumentBranding } from "@/hooks/useDocumentBranding";

const queryClient = new QueryClient();

const App = () => {
  // Drive the browser-tab title (office_name) and favicon (office_logo) from settings.
  useDocumentBranding();

  return (
  // Radix primitives read their direction from this context, not from <html dir>.
  // Without it they default to "ltr" and stamp dir="ltr" on their own DOM (ScrollArea
  // roots, Select/DropdownMenu content), flipping everything inside back to LTR.
  <DirectionProvider dir="rtl">
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/view/:token" element={<PublicViewPage />} />
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/properties/rent" element={<RentalPropertiesPage />} />
            <Route path="/properties/sale" element={<SalePropertiesPage />} />
            <Route path="/properties/:id/units" element={<UnitsPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/requests" element={<Navigate to="/requests/rent" replace />} />
            <Route path="/requests/rent" element={<RequestsPage key="rent" requestType="إيجار" />} />
            <Route path="/requests/sale" element={<RequestsPage key="sale" requestType="شراء" />} />
            <Route path="/contracts/rent" element={<RentalContractsPage />} />
            <Route path="/contracts/sale" element={<SaleContractsPage />} />
            <Route path="/collections" element={<CollectionsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            {/* The feed owns /notifications; the alert settings that used to sit
                there moved one level down and are reachable from its header. */}
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/notifications/settings" element={<NotificationSettingsPage />} />
            <Route path="/guide" element={<UserGuidePage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </DirectionProvider>
  );
};

export default App;
