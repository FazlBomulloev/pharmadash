from pydantic import BaseModel


class MarketCreate(BaseModel):
    name: str
    years: list[int]
    language: str = "ru"


class MarketOut(BaseModel):
    id: int
    name: str
    years: list[int]
    language: str = "ru"
    regions: list[str] | None
    created_at: str
    mnn_count: int | None = None
    has_pc: bool = False
    has_grls: bool = False
    fx_rate_usd_rub: float | None = None
    fx_rate_date: str | None = None

    model_config = {"from_attributes": True}


class MarketFxUpdate(BaseModel):
    fx_rate_usd_rub: float
    fx_rate_date: str | None = None


class FieldMappingItem(BaseModel):
    system_field: str
    file_column: str


class MappingRequest(BaseModel):
    sheet_name: str
    header_row: int
    mappings: list[FieldMappingItem]


class UploadResponse(BaseModel):
    sheets: list[str]
    columns: dict[str, list[str]]


class PreviewRow(BaseModel):
    values: dict[str, str | float | None]


class PreviewResponse(BaseModel):
    rows: list[PreviewRow]
    total_rows: int


class TableQuery(BaseModel):
    offset: int = 0
    limit: int = 50
    search: str | None = None
    sort_by: str | None = None
    sort_dir: str = "asc"
    filters: dict[str, str] | None = None


class AvpRow(BaseModel):
    id: int
    mnn: str
    lf_avp: str
    total_usd_y1: float
    total_usd_y2: float
    total_usd_y3: float
    total_un_y1: float
    total_un_y2: float
    total_un_y3: float
    hos_usd_y3: float
    ret_usd_y3: float
    competitors_total: int
    competitors_hos: int
    competitors_ret: int
    usd_growth: float | None
    un_growth: float | None
    region_usd: dict | None = None
    region_un: dict | None = None
    region_competitors: dict | None = None
    region_shares: dict | None = None

    model_config = {"from_attributes": True}


class KapRow(BaseModel):
    id: int
    mnn: str
    lf_avp: str
    atc: str | None
    competitors_count: int
    main_competitor_ret: str | None
    main_competitor_total: str | None
    un_hos_y1: float
    un_hos_y2: float
    un_hos_y3: float
    un_ret_y1: float
    un_ret_y2: float
    un_ret_y3: float
    usd_hos_y1: float
    usd_hos_y2: float
    usd_hos_y3: float
    usd_ret_y1: float
    usd_ret_y2: float
    usd_ret_y3: float
    un_growth: float | None
    usd_growth: float | None
    bg_count: int
    g_count: int
    bg_share: float | None
    region_shares: dict | None = None
    region_competitors: dict | None = None

    model_config = {"from_attributes": True}


class TableResponse(BaseModel):
    rows: list[AvpRow] | list[KapRow]
    total: int
    offset: int
    limit: int


class KpiZone1(BaseModel):
    usd_last_year: float
    un_last_year: float
    usd_growth: float | None
    un_growth: float | None
    asp_last_year: float | None
    asp_growth: float | None
    active_competitors: int
    total_producers: int = 0
    competitor_threshold_usd: float | None = None
    market_status: str
    trend: dict


class Zone2Data(BaseModel):
    ret_share: float | None
    hos_share: float | None
    top_competitors: list[dict]
    total_producers: int = 0
    top3_share: float | None
    hhi: float | None
    leader_share: float | None
    forms: list[dict]
    strengths: list[dict]
    countries: list[dict]
    znvlp: str
    grls: str
    grls_active_count: int = 0
    grls_registrants: int = 0
    jnvlp_flag: bool = False
    pc_flag: bool = False
    pc_stats: dict | None = None


class Zone3Data(BaseModel):
    total_score: float
    economic_score: float
    structure_score: float
    regulatory_score: float
    recommendation: str
    recommendation_color: str
    drivers: list[dict]
    red_flags: list[dict]
    next_checks: list[str]


class DashboardResponse(BaseModel):
    mnn: str
    zone1: KpiZone1
    zone2: Zone2Data
    zone3: Zone3Data


class ThresholdsOut(BaseModel):
    thresholds: dict


# --- Dictionary schemas ---

class DictionaryAliasOut(BaseModel):
    id: int
    alias: str
    language: str | None

    model_config = {"from_attributes": True}


class DictionaryEntryOut(BaseModel):
    id: int
    field_type: str
    value_en: str | None
    value_ru: str | None
    canonical: str
    notes: str | None
    aliases: list[DictionaryAliasOut]

    model_config = {"from_attributes": True}


class DictionaryEntryCreate(BaseModel):
    field_type: str
    value_en: str | None = None
    value_ru: str | None = None
    canonical: str | None = None
    aliases: list[str] = []
    notes: str | None = None


class DictionaryEntryUpdate(BaseModel):
    value_en: str | None = None
    value_ru: str | None = None
    canonical: str | None = None
    notes: str | None = None


class DictionarySuggestion(BaseModel):
    value: str
    suggestion: str | None
    suggestion_entry_id: int | None
    similarity: float


class UnrecognizedField(BaseModel):
    field_type: str
    values: list[str]


# --- Market Overview schemas ---

class OverviewHeader(BaseModel):
    market_id: int
    name: str
    years: list[int]
    regions: list[str]
    language: str
    fx_rate_usd_rub: float | None
    fx_rate_date: str | None
    has_bdp: bool
    has_pc: bool
    has_grls: bool
    mnn_count: int
    producer_count: int
    tm_count: int
    grls_active_count: int
    pc_rows_count: int


class OverviewVolume(BaseModel):
    usd_y1: float
    usd_y2: float
    usd_y3: float
    un_y1: float
    un_y2: float
    un_y3: float
    usd_growth: float | None
    un_growth: float | None
    usd_cagr_2y: float | None
    un_cagr_2y: float | None
    asp_y2: float | None
    asp_y3: float | None
    asp_growth: float | None
    ret_share: float | None
    hos_share: float | None
    bg_share: float | None
    g_share: float | None
    years_labels: list[str]


class OverviewPortfolio(BaseModel):
    top_mnn: list[dict]
    top_producers: list[dict]
    hhi: float | None
    top3_share: float | None
    atc_distribution: list[dict]
    countries: list[dict]


class OverviewGrls(BaseModel):
    active_count: int
    registrants_count: int
    registrations_by_year: list[dict]
    expiring_1y: int
    expiring_2y: int
    expiring_3y: int
    foreign_share: float | None
    jnvlp_money_share: float | None
    jnvlp_mnn_count: int


class OverviewPc(BaseModel):
    mnn_coverage_pct: float | None
    money_coverage_pct: float | None
    unit_price_usd_stats: dict | None
    indexation_by_year: list[dict]
    top_owners: list[dict]


class OverviewDecision(BaseModel):
    distribution: dict
    top_opportunities: list[dict]
    top_avoid: list[dict]


class OverviewResponse(BaseModel):
    header: OverviewHeader
    volume: OverviewVolume
    portfolio: OverviewPortfolio
    grls: OverviewGrls | None
    pc: OverviewPc | None
    decision: OverviewDecision


# --- Drill-down schemas (Producer / Country) ---

class ProducerKpi(BaseModel):
    usd_y1: float
    usd_y2: float
    usd_y3: float
    un_y1: float
    un_y2: float
    un_y3: float
    usd_growth: float | None
    un_growth: float | None
    usd_cagr_2y: float | None
    asp_y3: float | None
    asp_growth: float | None
    share_of_market: float | None
    top_country: str | None = None
    years_labels: list[str]


class MnnPortfolioItem(BaseModel):
    mnn: str
    tm: str | None = None
    form: str | None = None
    usd_y3: float
    share_in_market: float
    share_in_producer: float
    growth: float | None
    competitors_in_mnn: int
    bg_g_flag: str | None = None


class TmBreakdownItem(BaseModel):
    tm: str
    form: str
    usd_y3: float
    un_y3: float
    share_in_producer: float
    bg_g_flag: str | None = None


class SectorSplit(BaseModel):
    ret_usd: float
    hos_usd: float
    ret_share: float | None
    hos_share: float | None


class RegionItem(BaseModel):
    region: str
    usd_y3: float
    share_in_producer: float


class ProducerDetails(BaseModel):
    name: str
    kpi: ProducerKpi
    mnn_portfolio: list[MnnPortfolioItem] | None = None
    tm_breakdown: list[TmBreakdownItem]
    sector_split: SectorSplit
    top_regions: list[RegionItem]


class CountryKpi(BaseModel):
    usd_y1: float
    usd_y2: float
    usd_y3: float
    un_y1: float
    un_y2: float
    un_y3: float
    usd_growth: float | None
    un_growth: float | None
    share_y1: float | None
    share_y2: float | None
    share_y3: float | None
    share_of_market: float | None
    producers_count: int
    mnns_count: int
    years_labels: list[str]


class CountryProducer(BaseModel):
    name: str
    usd_y3: float
    share_in_country: float
    share_in_market: float
    growth: float | None


class CountryMnnItem(BaseModel):
    mnn: str
    usd_y3: float
    share_in_country: float
    growth: float | None


class CountryFormItem(BaseModel):
    form: str
    usd_y3: float
    share_in_country: float
    tms: list[dict]


class CountryDetails(BaseModel):
    name: str
    kpi: CountryKpi
    producers: list[CountryProducer]
    mnn_portfolio: list[CountryMnnItem] | None = None
    forms_breakdown: list[CountryFormItem]
