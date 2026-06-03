import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/layout/Layout";
import MarketsPage from "./pages/MarketsPage";
import AdminPage from "./pages/AdminPage";
import MarketAvpPage from "./pages/MarketAvpPage";
import MarketKapPage from "./pages/MarketKapPage";
import MarketDashboardPage from "./pages/MarketDashboardPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<MarketsPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route
            path="/market/:marketId/dashboard"
            element={<MarketDashboardPage />}
          />
          <Route
            path="/market/:marketId/avp"
            element={<MarketAvpPage />}
          />
          <Route
            path="/market/:marketId/kap"
            element={<MarketKapPage />}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
