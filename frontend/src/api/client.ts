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
  ReferenceMappingResult,
  DictionaryType,
  DictionaryEntry,
  DictionaryEntryCreate,
  DictionarySuggestion,
  DictionaryImportResult,
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
  filters: { lf?: string | null; dose?: string | null } = {},
): Promise<DashboardResponse> {
  const params: Record<string, string> = {};
  if (filters.lf) params.lf = filters.lf;
  if (filters.dose) params.dose = filters.dose;
  const { data } = await api.get(
    `/markets/${marketId}/dashboard/${encodeURIComponent(mnn)}`,
    { params },
  );
  return data;
}

// ─────────────────── References (PC, GRLS) ───────────────────

export async function uploadReference(
  marketId: number, source: "pc" | "grls", file: File,
): Promise<UploadResponse> {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post(
    `/markets/${marketId}/references/${source}/upload`, fd,
  );
  return data;
}

export async function getReferenceColumns(
  marketId: number, source: "pc" | "grls",
  sheetName: string, headerRow: number,
) {
  const { data } = await api.get(
    `/markets/${marketId}/references/${source}/columns`,
    { params: { sheet_name: sheetName, header_row: headerRow } },
  );
  return data;
}

export async function applyReferenceMapping(
  marketId: number, source: "pc" | "grls", body: MappingRequest,
): Promise<ReferenceMappingResult> {
  const { data } = await api.post(
    `/markets/${marketId}/references/${source}/mapping`, body,
  );
  return data;
}

export async function getReferenceStatus(
  marketId: number, source: "pc" | "grls",
) {
  const { data } = await api.get(`/markets/${marketId}/references/${source}`);
  return data;
}

export async function deleteReference(
  marketId: number, source: "pc" | "grls",
) {
  await api.delete(`/markets/${marketId}/references/${source}`);
}

// ─────────────────── Dictionary ───────────────────

export async function getDictTypes(): Promise<DictionaryType[]> {
  const { data } = await api.get("/dictionary/types");
  return data;
}

export async function getDictEntries(params: {
  field_type?: string; search?: string;
  offset?: number; limit?: number;
} = {}) {
  const { data } = await api.get("/dictionary", { params });
  return data;
}

export async function createDictEntry(body: DictionaryEntryCreate): Promise<DictionaryEntry> {
  const { data } = await api.post("/dictionary", body);
  return data;
}

export async function updateDictEntry(id: number, body: Partial<DictionaryEntry>): Promise<DictionaryEntry> {
  const { data } = await api.patch(`/dictionary/${id}`, body);
  return data;
}

export async function deleteDictEntry(id: number): Promise<void> {
  await api.delete(`/dictionary/${id}`);
}

export async function addDictAlias(entryId: number, alias: string, language?: string) {
  await api.post(`/dictionary/${entryId}/aliases`, null, {
    params: { alias, language },
  });
}

export async function deleteDictAlias(aliasId: number) {
  await api.delete(`/dictionary/aliases/${aliasId}`);
}

export async function suggestDict(
  field_type: string, values: string[],
): Promise<DictionarySuggestion[]> {
  const { data } = await api.post("/dictionary/suggest", values, {
    params: { field_type },
  });
  return data;
}

export async function uploadDictImport(file: File): Promise<UploadResponse> {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post("/dictionary/import/upload", fd);
  return data;
}

export async function getDictImportColumns(sheetName: string, headerRow: number) {
  const { data } = await api.get("/dictionary/import/columns", {
    params: { sheet_name: sheetName, header_row: headerRow },
  });
  return data;
}

export async function applyDictImport(
  field_type: string, body: MappingRequest, overwrite = false,
): Promise<DictionaryImportResult> {
  const { data } = await api.post("/dictionary/import/apply", body, {
    params: { field_type, overwrite },
  });
  return data;
}
