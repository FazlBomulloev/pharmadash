from pydantic import BaseModel


class MarketCreate(BaseModel):
    name: str
    years: list[int]


class MarketOut(BaseModel):
    id: int
    name: str
    years: list[int]
    regions: list[str] | None
    created_at: str
    mnn_count: int | None = None

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
    market_status: str
    trend: dict


class Zone2Data(BaseModel):
    ret_share: float | None
    hos_share: float | None
    top_competitors: list[dict]
    top3_share: float | None
    hhi: float | None
    leader_share: float | None
    forms: list[dict]
    strengths: list[dict]
    countries: list[dict]
    znvlp: str
    grls: str


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
