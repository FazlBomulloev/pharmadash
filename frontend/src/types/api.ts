export interface Market {
  id: number;
  name: string;
  years: number[];
  regions: string[] | null;
  created_at: string;
  mnn_count?: number | null;
}

export interface MarketCreate {
  name: string;
  years: number[];
}

export interface UploadResponse {
  sheets: string[];
  columns: Record<string, string[]>;
}

export interface FieldMappingItem {
  system_field: string;
  file_column: string;
}

export interface MappingRequest {
  sheet_name: string;
  header_row: number;
  mappings: FieldMappingItem[];
}

export interface MappingResult {
  ok: boolean;
  bdp_count: number;
  avp_count: number;
  kap_count: number;
  regions: string[];
}

export interface AvpRow {
  id: number;
  mnn: string;
  lf_avp: string;
  total_usd_y1: number;
  total_usd_y2: number;
  total_usd_y3: number;
  total_un_y1: number;
  total_un_y2: number;
  total_un_y3: number;
  hos_usd_y3: number;
  ret_usd_y3: number;
  competitors_total: number;
  competitors_hos: number;
  competitors_ret: number;
  usd_growth: number | null;
  un_growth: number | null;
  region_usd: Record<string, Record<string, number>> | null;
  region_un: Record<string, Record<string, number>> | null;
  region_competitors: Record<string, number> | null;
  region_shares: Record<string, number> | null;
}

export interface KapRow {
  id: number;
  mnn: string;
  lf_avp: string;
  atc: string | null;
  competitors_count: number;
  main_competitor_ret: string | null;
  main_competitor_total: string | null;
  un_hos_y1: number;
  un_hos_y2: number;
  un_hos_y3: number;
  un_ret_y1: number;
  un_ret_y2: number;
  un_ret_y3: number;
  usd_hos_y1: number;
  usd_hos_y2: number;
  usd_hos_y3: number;
  usd_ret_y1: number;
  usd_ret_y2: number;
  usd_ret_y3: number;
  un_growth: number | null;
  usd_growth: number | null;
  bg_count: number;
  g_count: number;
  bg_share: number | null;
  region_shares: Record<string, number> | null;
  region_competitors: Record<string, number> | null;
}

export interface TableResponse<T> {
  rows: T[];
  total: number;
  offset: number;
  limit: number;
  years: number[];
  regions: string[];
}

export interface TrendData {
  years: string[];
  usd: number[];
  un: number[];
}

export interface KpiZone1 {
  usd_last_year: number;
  un_last_year: number;
  usd_growth: number | null;
  un_growth: number | null;
  asp_last_year: number | null;
  asp_growth: number | null;
  active_competitors: number;
  market_status: string;
  trend: TrendData;
}

export interface Competitor {
  corporation: string;
  usd_last_year: number;
  share: number;
  un_last_year: number;
  asp: number | null;
  usd_growth: number | null;
  un_growth: number | null;
}

export interface NamedShare {
  name: string;
  usd: number;
  share: number;
}

export interface Zone2Data {
  ret_share: number | null;
  hos_share: number | null;
  top_competitors: Competitor[];
  top3_share: number | null;
  hhi: number | null;
  leader_share: number | null;
  forms: NamedShare[];
  strengths: NamedShare[];
  countries: NamedShare[];
  znvlp: string;
  grls: string;
}

export interface DriverFlag {
  text: string;
  impact: string;
}

export interface Zone3Data {
  total_score: number;
  economic_score: number;
  structure_score: number;
  regulatory_score: number;
  recommendation: string;
  recommendation_color: string;
  drivers: DriverFlag[];
  red_flags: DriverFlag[];
  next_checks: string[];
  details?: Record<string, Record<string, number>>;
}

export interface DashboardResponse {
  mnn: string;
  years: number[];
  regions: string[];
  zone1: KpiZone1;
  zone2: Zone2Data;
  zone3: Zone3Data;
}

export interface MnnListResponse {
  mnns: string[];
}
