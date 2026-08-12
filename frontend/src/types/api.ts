export interface Market {
  id: number;
  name: string;
  years: number[];
  language: "ru" | "en";
  regions: string[] | null;
  created_at: string;
  mnn_count?: number | null;
  has_pc?: boolean;
  has_grls?: boolean;
  fx_rate_usd_rub?: number | null;
  fx_rate_date?: string | null;
}

export interface MarketFxUpdate {
  fx_rate_usd_rub: number;
  fx_rate_date?: string | null;
}

export interface MarketCreate {
  name: string;
  years: number[];
  language: "ru" | "en";
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
  regions: string[];
  unrecognized?: UnrecognizedMap;
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
  total_producers: number;
  competitor_threshold_usd: number | null;
  market_status: string;
  trend: TrendData;
}

export type BgGFlag = "BG" | "G" | "MIXED";

export interface Competitor {
  corporation: string;
  usd_last_year: number;
  share: number;
  un_last_year: number;
  asp: number | null;
  usd_growth: number | null;
  un_growth: number | null;
  bg_g_flag: BgGFlag | null;
  country: string | null;
}

export interface NamedShare {
  name: string;
  usd: number;
  share: number;
  un?: number;
  un_share?: number;
}

export interface FormConcentration {
  name: string;
  usd_total: number;
  share: number;
  hhi: number;
  top3_share: number;
  leader_share: number;
  active_competitors: number;
  producer_count: number;
}

export interface PcStats {
  min: number;
  median: number;
  max: number;
  count: number;
}

export interface RegionalDistribution {
  regions: { name: string; usd: number; share: number }[];
  gini: number | null;
  regions_count: number;
}

export interface BgGBreakdown {
  bg_share: number;
  g_share: number;
  bg_un_share: number | null;
  g_un_share: number | null;
  asp_bg: number | null;
  asp_g: number | null;
  asp_gap_pct: number | null;
  bg_share_by_year: (number | null)[];
  bg_usd_by_year: number[];
  g_usd_by_year: number[];
  asp_bg_by_year: (number | null)[];
  asp_g_by_year: (number | null)[];
}

export interface GrlsExtra {
  market_age: number | null;
  oldest_reg_year: number | null;
  expiring_1y: number;
  expiring_2y: number;
  expiring_3y: number;
  registrations_by_year: { year: number; count: number }[];
}

export interface Zone2Data {
  ret_share: number | null;
  hos_share: number | null;
  top_competitors: Competitor[];
  total_producers: number;
  top3_share: number | null;
  hhi: number | null;
  entropy_normalized: number | null;
  leader_share: number | null;
  forms: NamedShare[];
  strengths: NamedShare[];
  countries: NamedShare[];
  concentration_by_form: FormConcentration[];
  regional_distribution: RegionalDistribution | null;
  bg_g_breakdown: BgGBreakdown | null;
  grls: string;
  grls_active_count: number;
  grls_registrants: number;
  grls_extra: GrlsExtra | null;
  pc_flag: boolean;
  pc_stats: PcStats | null;
}

export interface AtcBenchmark {
  atc3: string;
  mnn_count: number;
  our: {
    usd: number;
    growth: number | null;
    hhi: number | null;
    competitors: number;
    rank_by_usd: number | null;
  };
  class_stats: {
    usd_median: number | null;
    usd_p75: number | null;
    usd_max: number | null;
    growth_median: number | null;
    hhi_median: number | null;
    competitors_median: number | null;
  };
  top_peers: { mnn: string; usd: number }[];
}

export interface DriverFlag {
  text: string;
  type?: string;
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
  details?: Record<string, unknown>;
}

export interface DashboardResponse {
  mnn: string;
  years: number[];
  available_years: number[];
  selected_year: number | null;
  regions: string[];
  available_forms: string[];
  available_doses: string[];
  forms_doses_map: Record<string, string[]>;
  doses_forms_map: Record<string, string[]>;
  applied_filter: {
    lf: string | null;
    dose: string | null;
    year: number | null;
  };
  zone1: KpiZone1;
  zone2: Zone2Data;
  atc_benchmark: AtcBenchmark[];
  zone3: Zone3Data;
}

export interface MnnListResponse {
  mnns: string[];
}

// References
export interface PcStatus {
  loaded: boolean;
  rows_count: number;
}

export interface GrlsStatus {
  loaded: boolean;
  rows_count: number;
  by_status: Record<string, number>;
}

export interface UnrecognizedMap {
  [field_type: string]: string[];
}

export interface ReferenceMappingResult {
  ok: boolean;
  pc_count?: number;
  grls_count?: number;
  unrecognized: UnrecognizedMap;
}

// Dictionary
export interface DictionaryType {
  type: string;
  label: string;
}

export interface DictionaryAlias {
  id: number;
  alias: string;
  language: string | null;
}

export interface DictionaryEntry {
  id: number;
  field_type: string;
  value_en: string | null;
  value_ru: string | null;
  canonical: string;
  notes: string | null;
  aliases: DictionaryAlias[];
}

export interface DictionaryEntryCreate {
  field_type: string;
  value_en?: string | null;
  value_ru?: string | null;
  canonical?: string | null;
  aliases?: string[];
  notes?: string | null;
}

export interface DictionarySuggestion {
  value: string;
  suggestion: string | null;
  suggestion_entry_id: number | null;
  similarity: number;
}

export interface DictionaryImportResult {
  ok: boolean;
  created: number;
  updated: number;
  skipped: number;
  total: number;
}

export interface UnrecognizedItem {
  value: string;
  normalized: string;
  count_bdp: number;
  count_pc: number;
  count_grls: number;
  total: number;
}

export interface UnrecognizedResponse {
  items: UnrecognizedItem[];
  total: number;
  shown: number;
}

export interface RecanonicalizeResponse {
  ok: boolean;
  by_source: Record<string, {
    rows: number;
    updated: number;
    matched: number;
    unmatched: number;
  }>;
  updated_total: number;
  matched_total: number;
  unmatched_total: number;
}

// Market Overview
export interface OverviewHeader {
  market_id: number;
  name: string;
  years: number[];
  available_years: number[];
  selected_year: number | null;
  regions: string[];
  language: string;
  fx_rate_usd_rub: number | null;
  fx_rate_date: string | null;
  has_bdp: boolean;
  has_pc: boolean;
  has_grls: boolean;
  mnn_count: number;
  producer_count: number;
  tm_count: number;
  grls_active_count: number;
  pc_rows_count: number;
}

export interface OverviewVolume {
  usd_y1: number;
  usd_y2: number;
  usd_y3: number;
  un_y1: number;
  un_y2: number;
  un_y3: number;
  usd_growth: number | null;
  un_growth: number | null;
  usd_cagr_2y: number | null;
  un_cagr_2y: number | null;
  asp_y2: number | null;
  asp_y3: number | null;
  asp_growth: number | null;
  ret_share: number | null;
  hos_share: number | null;
  bg_share: number | null;
  g_share: number | null;
  years_labels: string[];
}

export interface OverviewMnn {
  mnn: string;
  usd: number;
  share: number;
  growth: number | null;
}

export interface OverviewProducer {
  name: string;
  usd: number;
  share: number;
  growth: number | null;
  country: string | null;
}

export interface OverviewAtc {
  atc: string;
  usd: number;
  share: number;
}

export interface OverviewCountry {
  name: string;
  usd: number;
  un: number;
  share: number;
  un_share: number;
}

export interface OverviewPortfolio {
  top_mnn: OverviewMnn[];
  top_producers: OverviewProducer[];
  hhi: number | null;
  top3_share: number | null;
  atc_distribution: OverviewAtc[];
  countries: OverviewCountry[];
}

export interface OverviewGrls {
  active_count: number;
  registrants_count: number;
  registrations_by_year: { year: number; count: number }[];
  expiring_1y: number;
  expiring_2y: number;
  expiring_3y: number;
  foreign_share: number | null;
}

export interface OverviewPcUnitStats {
  count: number;
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
}

export interface OverviewPc {
  mnn_coverage_pct: number | null;
  money_coverage_pct: number | null;
  unit_price_usd_stats: OverviewPcUnitStats | null;
  indexation_by_year: { year: number; count: number }[];
  top_owners: { name: string; count: number }[];
}

export interface OverviewDecisionItem {
  mnn: string;
  usd: number;
  total_score: number;
  recommendation: string;
  color: string;
}

export interface OverviewDecision {
  distribution: Record<string, number>;
  top_opportunities: OverviewDecisionItem[];
  top_avoid: OverviewDecisionItem[];
}

export interface OverviewFiltersApplied {
  sector: "all" | "ret" | "hos";
  atc3: string | null;
}

export interface OverviewFilters {
  applied: OverviewFiltersApplied;
  options: {
    atc3: { atc: string; share: number }[];
  };
}

export interface OverviewResponse {
  header: OverviewHeader;
  filters: OverviewFilters;
  volume: OverviewVolume;
  portfolio: OverviewPortfolio;
  grls: OverviewGrls | null;
  pc: OverviewPc | null;
  decision: OverviewDecision;
}

export interface OverviewQuery {
  sector?: "all" | "ret" | "hos";
  atc3?: string | null;
  year?: number | null;
}

// ─────────────── Drill-down: Producer / Country ───────────────

export interface ProducerKpi {
  usd_y1: number;
  usd_y2: number;
  usd_y3: number;
  un_y1: number;
  un_y2: number;
  un_y3: number;
  usd_growth: number | null;
  un_growth: number | null;
  usd_cagr_2y: number | null;
  asp_y3: number | null;
  asp_growth: number | null;
  share_of_market: number | null;
  top_country: string | null;
  years_labels: string[];
}

export interface MnnPortfolioItem {
  mnn: string;
  tm: string | null;
  form: string | null;
  usd_y3: number;
  share_in_market: number;
  share_in_producer: number;
  growth: number | null;
  competitors_in_mnn: number;
  bg_g_flag: BgGFlag | null;
}

export interface TmBreakdownItem {
  tm: string;
  form: string;
  usd_y3: number;
  un_y3: number;
  share_in_producer: number;
  bg_g_flag: BgGFlag | null;
}

export interface SectorSplit {
  ret_usd: number;
  hos_usd: number;
  ret_share: number;
  hos_share: number;
}

export interface RegionItem {
  region: string;
  usd_y3: number;
  share_in_producer: number;
}

export interface ProducerDetails {
  name: string;
  kpi: ProducerKpi;
  mnn_portfolio?: MnnPortfolioItem[];
  tm_breakdown: TmBreakdownItem[];
  sector_split: SectorSplit;
  top_regions: RegionItem[];
}

export interface CountryKpi {
  usd_y1: number;
  usd_y2: number;
  usd_y3: number;
  un_y1: number;
  un_y2: number;
  un_y3: number;
  usd_growth: number | null;
  un_growth: number | null;
  share_y1: number | null;
  share_y2: number | null;
  share_y3: number | null;
  share_of_market: number | null;
  producers_count: number;
  mnns_count: number;
  years_labels: string[];
}

export interface CountryProducer {
  name: string;
  usd_y3: number;
  share_in_country: number;
  share_in_market: number;
  growth: number | null;
}

export interface CountryMnnItem {
  mnn: string;
  usd_y3: number;
  share_in_country: number;
  growth: number | null;
}

export interface CountryFormTm {
  tm: string;
  usd_y3: number;
  share_in_form: number;
}

export interface CountryFormItem {
  form: string;
  usd_y3: number;
  share_in_country: number;
  tms: CountryFormTm[];
}

export interface CountryDetails {
  name: string;
  kpi: CountryKpi;
  producers: CountryProducer[];
  mnn_portfolio?: CountryMnnItem[];
  forms_breakdown: CountryFormItem[];
}
