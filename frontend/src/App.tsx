import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/layout/Layout";
import MarketsPage from "./pages/MarketsPage";
import AdminPage from "./pages/AdminPage";
import MarketDashboardPage from "./pages/MarketDashboardPage";
import MarketOverviewPage from "./pages/MarketOverviewPage";
import MarketReferencePage from "./pages/MarketReferencePage";
import DictionaryPage from "./pages/DictionaryPage";
import DictionaryImportPage from "./pages/DictionaryImportPage";

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
            path="/market/:marketId/references/pc"
            element={<MarketReferencePage source="pc" />}
          />
          <Route
            path="/market/:marketId/references/grls"
            element={<MarketReferencePage source="grls" />}
          />
          <Route path="/admin/dictionary" element={<DictionaryPage />} />
          <Route path="/admin/dictionary/import" element={<DictionaryImportPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
