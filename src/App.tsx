import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import ProtectedRoute from "./components/ProtectedRoute";
import AppShell from "./components/AppShell";
import LoginPage from "./routes/auth/LoginPage";
import SignupPage from "./routes/auth/SignupPage";
import DashboardPage from "./routes/dashboard/DashboardPage";
import ClientsPage from "./routes/clients/ClientsPage";
import ClientDetailPage from "./routes/clients/ClientDetailPage";
import DevisPage from "./routes/devis/DevisPage";
import FacturesPage from "./routes/factures/FacturesPage";
import CataloguePage from "./routes/catalogue/CataloguePage";
import RelancesPage from "./routes/relances/RelancesPage";
import ComptabilitePage from "./routes/comptabilite/ComptabilitePage";
import SettingsPage from "./routes/settings/SettingsPage";
import BillingPage from "./routes/billing/BillingPage";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/clients/:id" element={<ClientDetailPage />} />
            <Route path="/catalogue" element={<CataloguePage />} />
            <Route path="/devis" element={<DevisPage />} />
            <Route path="/factures" element={<FacturesPage />} />
            <Route path="/relances" element={<RelancesPage />} />
            <Route path="/comptabilite" element={<ComptabilitePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/billing" element={<BillingPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
