import {
  BrowserRouter, Navigate, Route, Routes, useLocation,
} from "react-router-dom";
import Layout from "./components/layout/Layout";
import MarketsPage from "./pages/MarketsPage";
import AdminPage from "./pages/AdminPage";
import MarketDashboardPage from "./pages/MarketDashboardPage";
import MarketOverviewPage from "./pages/MarketOverviewPage";
import PharmaciesPage from "./pages/PharmaciesPage";
import MarketScoringPage from "./pages/MarketScoringPage";
import MarketSettingsPage from "./pages/MarketSettingsPage";
import DirectionsRefPage from "./pages/DirectionsRefPage";
import LoginPage from "./pages/LoginPage";
import { SessionContext, useSession, useSessionState } from "./hooks/useSession";

function Guard() {
  const { user, pending } = useSession();
  const location = useLocation();

  // Пока первый ответ не пришёл — нейтральный экран, иначе у вошедшего
  // мигнёт форма входа.
  if (pending) return <div className="min-h-(--screen-h) bg-canvas" />;
  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }
  return <Layout />;
}

function LoginRoute() {
  const { user, pending } = useSession();
  if (pending) return <div className="min-h-(--screen-h) bg-ink" />;
  if (user) return <Navigate to="/" replace />;
  return <LoginPage />;
}

export default function App() {
  const session = useSessionState();

  return (
    <SessionContext value={session}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route element={<Guard />}>
            <Route path="/" element={<MarketsPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/directions" element={<DirectionsRefPage />} />
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
    </SessionContext>
  );
}
