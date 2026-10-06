import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/layout/Layout";
import MarketsPage from "./pages/MarketsPage";
import AdminPage from "./pages/AdminPage";
import MarketDashboardPage from "./pages/MarketDashboardPage";
import MarketOverviewPage from "./pages/MarketOverviewPage";
import PharmaciesPage from "./pages/PharmaciesPage";
import MarketScoringPage from "./pages/MarketScoringPage";
import MarketSettingsPage from "./pages/MarketSettingsPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<MarketsPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route
            path="/market/:marketId/overview"
            element={<MarketOverviewPage />}
          />
          <Route
            path="/market/:marketId/dashboard"
            element={<MarketDashboardPage />}
          />
          <Route
            path="/market/:marketId/scoring"
            element={<MarketScoringPage />}
          />
          <Route
            path="/market/:marketId/settings"
            element={<MarketSettingsPage />}
          />
          <Route
            path="/market/:marketId/pharmacies"
            element={<PharmaciesPage />}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
