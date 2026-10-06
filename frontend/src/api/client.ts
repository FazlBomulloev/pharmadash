import axios from "axios";
import type {
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
} from "../types/api";

const api = axios.create({ baseURL: "/api" });

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
): Promise<{ columns: string[] }> {
  const { data } = await api.get(`/markets/${marketId}/columns`, {
    params: { sheet_name: sheetName, header_row: headerRow },
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

// ─────────────────── Скоринг и настройки рынка ───────────────────

export async function getMarketScoring(
  id: number,
  query: { lf?: string | null; dose?: string | null } = {},
): Promise<ScoringResponse> {
  const params: Record<string, string> = {};
  if (query.lf) params.lf = query.lf;
  if (query.dose) params.dose = query.dose;
  const { data } = await api.get<ScoringResponse>(
    `/markets/${id}/scoring`, { params },
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

// ─────────────────── Drill-down: Producer / Country ───────────────────

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

// ─────────────────── Pharmacies (БДЦ) ───────────────────

export async function getPharmacySources(): Promise<PharmacySource[]> {
  const { data } = await api.get<PharmacySource[]>("/pharmacies");
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

export async function getPharmacyFilters(): Promise<PharmacyFiltersResponse> {
  const { data } = await api.get<PharmacyFiltersResponse>("/pharmacies/filters");
  return data;
}
