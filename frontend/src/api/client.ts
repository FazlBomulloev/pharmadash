import axios from "axios";
import type {
  Market,
  MarketCreate,
  UploadResponse,
  MappingRequest,
  MappingResult,
  TableResponse,
  AvpRow,
  KapRow,
  DashboardResponse,
  MnnListResponse,
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

export async function getAvp(
  marketId: number,
  params: {
    offset?: number;
    limit?: number;
    search?: string;
    sort_by?: string;
    sort_dir?: string;
  } = {},
): Promise<TableResponse<AvpRow>> {
  const { data } = await api.get(`/markets/${marketId}/avp`, { params });
  return data;
}

export async function getKap(
  marketId: number,
  params: {
    offset?: number;
    limit?: number;
    search?: string;
    sort_by?: string;
    sort_dir?: string;
  } = {},
): Promise<TableResponse<KapRow>> {
  const { data } = await api.get(`/markets/${marketId}/kap`, { params });
  return data;
}

export function exportAvpUrl(marketId: number): string {
  return `/api/markets/${marketId}/avp/export`;
}

export function exportKapUrl(marketId: number): string {
  return `/api/markets/${marketId}/kap/export`;
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
): Promise<DashboardResponse> {
  const { data } = await api.get(
    `/markets/${marketId}/dashboard/${encodeURIComponent(mnn)}`,
  );
  return data;
}
