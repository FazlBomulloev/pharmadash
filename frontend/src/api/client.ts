import axios from "axios";
import type {
  SessionUser,
  Market,
  MarketCreate,
  UploadResponse,
  MappingRequest,
  MappingResult,
  DashboardResponse,
  MnnListResponse,
  OverviewResponse,
  ScoringResponse,
  ScoringSettings,
  MarketSettingsResponse,
  OverviewQuery,
  ProducerDetails,
  CountryDetails,
  PharmacySource,
  PharmacySourceRun,
  PharmacyPricesResponse,
  PharmacyPricesQuery,
  PharmacyFiltersResponse,
  ScoringQuery,
  MnnSuggestion,
  SettingsPreview,
  PriceCompareItem,
  ColumnsResponse,
  DirectionDetails,
  DirectionMeta,
  DirectionRowsQuery,
  DirectionRowsResponse,
  DirectionUploadReport,
} from "../types/api";

const api = axios.create({ baseURL: "/api", withCredentials: true });

// Истёкшая сессия или перезапуск сервера не должны оставлять человека на
// экране с пустыми данными: любой 401, кроме самого входа, уводит на форму
// и запоминает, куда он шёл.
api.interceptors.response.use(
  (r) => r,
  (error) => {
    const status = error?.response?.status;
    const url: string = error?.config?.url ?? "";
    if (status === 401 && !url.startsWith("/auth/")) {
      const here = window.location.pathname + window.location.search;
      if (window.location.pathname !== "/login") {
        window.location.replace(
          `/login?from=${encodeURIComponent(here)}`,
        );
      }
    }
    return Promise.reject(error);
  },
);

export async function login(
  username: string, password: string,
): Promise<SessionUser> {
  const { data } = await api.post<SessionUser>("/auth/login", {
    username, password,
  });
  return data;
}

export async function logout(): Promise<void> {
  await api.post("/auth/logout");
}

export async function getSession(): Promise<SessionUser | null> {
  const { data } = await api.get<{ user: SessionUser | null }>("/auth/session");
  return data.user;
}

export async function getMarkets(): Promise<Market[]> {
  const { data } = await api.get<Market[]>("/markets");
  return data;
}

export async function createMarket(body: MarketCreate): Promise<Market> {
  const { data } = await api.post<Market>("/markets", body);
  return data;
}

export async function deleteMarket(id: number): Promise<void> {
  await api.delete(`/markets/${id}`);
}

export async function getMarket(id: number): Promise<Market> {
  const { data } = await api.get<Market>(`/markets/${id}`);
  return data;
}

export async function getMarketOverview(
  id: number,
  query: OverviewQuery = {},
): Promise<OverviewResponse> {
  const params: Record<string, string | number> = {};
  if (query.sector && query.sector !== "all") params.sector = query.sector;
  if (query.atc3) params.atc3 = query.atc3;
  if (query.year != null) params.year = query.year;
  const { data } = await api.get<OverviewResponse>(
    `/markets/${id}/overview`,
    { params },
  );
  return data;
}

export async function uploadFile(
  marketId: number,
  file: File,
): Promise<UploadResponse> {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post<UploadResponse>(
    `/markets/${marketId}/upload`,
    fd,
  );
  return data;
}

export async function getColumns(
  marketId: number,
  sheetName: string,
  headerRow: number,
): Promise<ColumnsResponse> {
  const { data } = await api.get(`/markets/${marketId}/columns`, {
    params: { sheet_name: sheetName, header_row: headerRow },
  });
  return data;
}

export async function getSheetPreview(
  marketId: number,
  sheetName: string,
): Promise<{ rows: string[][] }> {
  const { data } = await api.get(`/markets/${marketId}/sheet-preview`, {
    params: { sheet_name: sheetName },
  });
  return data;
}

export async function applyMapping(
  marketId: number,
  body: MappingRequest,
): Promise<MappingResult> {
  const { data } = await api.post<MappingResult>(
    `/markets/${marketId}/mapping`,
    body,
  );
  return data;
}

export async function getMnnList(
  marketId: number,
  q?: string,
): Promise<MnnListResponse> {
  const { data } = await api.get(`/markets/${marketId}/mnn-list`, {
    params: q ? { q } : {},
  });
  return data;
}

export async function getDashboard(
  marketId: number,
  mnn: string,
  filters: {
    lf?: string | null;
    dose?: string | null;
    year?: number | null;
  } = {},
): Promise<DashboardResponse> {
  const params: Record<string, string | number> = {};
  if (filters.lf) params.lf = filters.lf;
  if (filters.dose) params.dose = filters.dose;
  if (filters.year != null) params.year = filters.year;
  const { data } = await api.get(
    `/markets/${marketId}/dashboard/${encodeURIComponent(mnn)}`,
    { params },
  );
  return data;
}

export async function getMarketScoring(
  id: number,
  query: ScoringQuery = {},
  signal?: AbortSignal,
): Promise<ScoringResponse> {
  const params: Record<string, string | number | boolean> = {};
  Object.entries(query).forEach(([k, v]) => {
    if (v != null && v !== "" && v !== false) params[k] = v;
  });
  const { data } = await api.get<ScoringResponse>(
    `/markets/${id}/scoring`, { params, signal },
  );
  return data;
}

export async function suggestMnn(
  marketId: number,
  q: string,
  signal?: AbortSignal,
): Promise<MnnSuggestion[]> {
  const { data } = await api.get<{ items: MnnSuggestion[] }>(
    `/markets/${marketId}/mnn-suggest`,
    { params: q.trim() ? { q: q.trim() } : {}, signal },
  );
  return data.items;
}

export async function previewMarketSettings(
  id: number,
  body: ScoringSettings,
  signal?: AbortSignal,
): Promise<SettingsPreview> {
  const { data } = await api.post<SettingsPreview>(
    `/markets/${id}/settings/preview`, body, { signal },
  );
  return data;
}

export async function getMarketSettings(
  id: number,
): Promise<MarketSettingsResponse> {
  const { data } = await api.get<MarketSettingsResponse>(
    `/markets/${id}/settings`,
  );
  return data;
}

export async function updateMarketSettings(
  id: number,
  body: ScoringSettings,
): Promise<MarketSettingsResponse> {
  const { data } = await api.put<MarketSettingsResponse>(
    `/markets/${id}/settings`, body,
  );
  return data;
}

export async function getProducerDetails(
  marketId: number,
  name: string,
  mnn?: string | null,
): Promise<ProducerDetails> {
  const url = mnn
    ? `/markets/${marketId}/mnn/${encodeURIComponent(mnn)}/producer/${encodeURIComponent(name)}`
    : `/markets/${marketId}/producer/${encodeURIComponent(name)}`;
  const { data } = await api.get<ProducerDetails>(url);
  return data;
}

export async function getCountryDetails(
  marketId: number,
  name: string,
  mnn?: string | null,
): Promise<CountryDetails> {
  const url = mnn
    ? `/markets/${marketId}/mnn/${encodeURIComponent(mnn)}/country/${encodeURIComponent(name)}`
    : `/markets/${marketId}/country/${encodeURIComponent(name)}`;
  const { data } = await api.get<CountryDetails>(url);
  return data;
}

export async function getPharmacySources(
  marketId?: number,
): Promise<PharmacySource[]> {
  const { data } = await api.get<PharmacySource[]>("/pharmacies", {
    params: marketId == null ? {} : { market_id: marketId },
  });
  return data;
}

export async function updatePharmacySources(
  marketId: number, sources: string[],
): Promise<Market> {
  const { data } = await api.put<Market>(
    `/markets/${marketId}/pharmacy-sources`, { sources },
  );
  return data;
}

export async function triggerPharmacyRun(
  slug: string, limit?: number,
): Promise<{ ok: boolean; launched: boolean }> {
  const params: Record<string, number> = {};
  if (limit != null) params.limit = limit;
  const { data } = await api.post(`/pharmacies/${slug}/run`, null, { params });
  return data;
}

export async function getPharmacyRuns(
  slug: string, limit = 10,
): Promise<PharmacySourceRun[]> {
  const { data } = await api.get(`/pharmacies/${slug}/runs`, {
    params: { limit },
  });
  return data;
}

export async function getPharmacyPrices(
  query: PharmacyPricesQuery = {},
): Promise<PharmacyPricesResponse> {
  const params: Record<string, string | number> = {};
  Object.entries(query).forEach(([k, v]) => {
    if (v != null && v !== "") params[k] = v as string | number;
  });
  const { data } = await api.get<PharmacyPricesResponse>("/pharmacies/prices", {
    params,
  });
  return data;
}

export async function getPriceComparison(
  priceId: number,
  marketId: number,
  signal?: AbortSignal,
): Promise<PriceCompareItem[]> {
  const { data } = await api.get<{ items: PriceCompareItem[] }>(
    `/pharmacies/prices/${priceId}/compare`,
    { params: { market_id: marketId }, signal },
  );
  return data.items;
}

export async function getPharmacyFilters(
  marketId: number,
): Promise<PharmacyFiltersResponse> {
  const { data } = await api.get<PharmacyFiltersResponse>(
    "/pharmacies/filters", { params: { market_id: marketId } },
  );
  return data;
}

export async function getDirectionsMeta(): Promise<DirectionMeta> {
  const { data } = await api.get<DirectionMeta>("/directions/meta");
  return data;
}

export async function getDirectionRows(
  query: DirectionRowsQuery = {},
  signal?: AbortSignal,
): Promise<DirectionRowsResponse> {
  const params: Record<string, string | number> = {};
  Object.entries(query).forEach(([k, v]) => {
    if (v != null && v !== "") params[k] = v as string | number;
  });
  const { data } = await api.get<DirectionRowsResponse>("/directions/rows", {
    params, signal,
  });
  return data;
}

export async function uploadDirectionsFile(
  file: File,
): Promise<DirectionUploadReport> {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post<DirectionUploadReport>(
    "/directions/upload", fd,
  );
  return data;
}

export async function getDirectionDetails(
  marketId: number,
  name: string,
): Promise<DirectionDetails> {
  const { data } = await api.get<DirectionDetails>(
    `/markets/${marketId}/direction/${encodeURIComponent(name)}`,
  );
  return data;
}
