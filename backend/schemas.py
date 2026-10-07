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
    usd_last: float | None = None
    usd_growth: float | None = None
    categories: dict[str, int] | None = None
    bdp_loaded_at: str | None = None

    model_config = {"from_attributes": True}


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


class OverviewHeader(BaseModel):
    market_id: int
    name: str
    years: list[int]
    regions: list[str]
    language: str
    has_bdp: bool
    mnn_count: int
    producer_count: int
    tm_count: int


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
