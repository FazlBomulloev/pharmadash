"""«Настройки рынка» для скоринга.

Значения по умолчанию заданы здесь и только здесь; расчёт в
scoring.py читает все числа из экземпляра ScoringSettings.
"""
import json

from pydantic import BaseModel, Field, model_validator

Score = float  # балл критерия, 0…1


class Weights(BaseModel):
    volume: float = Field(22, ge=0)
    import_share: float = Field(18, ge=0)
    cagr_usd: float = Field(9, ge=0)
    competition: float = Field(5, ge=0)
    price: float = Field(6, ge=0)
    demand: float = Field(6, ge=0)
    hhi: float = Field(13, ge=0)
    form: float = Field(7, ge=0)
    channel: float = Field(8, ge=0)
    class_barrier: float = Field(6, ge=0)

    @model_validator(mode="after")
    def _non_zero(self):
        if sum(self.model_dump().values()) <= 0:
            raise ValueError("Сумма весов должна быть больше нуля")
        return self


class StopFilters(BaseModel):
    min_sales_usd: float = Field(750_000, ge=0)
    max_price_usd: float = Field(200, gt=0)
    max_producers: int = Field(20, ge=1)


class Thresholds(BaseModel):
    priority: float = Field(80, ge=0, le=100)
    watch: float = Field(65, ge=0, le=100)

    @model_validator(mode="after")
    def _ordered(self):
        if self.watch > self.priority:
            raise ValueError(
                "Порог «Смотреть» не может быть выше порога «Приоритет»"
            )
        return self


class CompetitionSettings(BaseModel):
    single_producer_score: Score = Field(0.5, ge=0, le=1)
    no_penalty_until: int = Field(15, ge=1)
    min_score: Score = Field(0.5, ge=0, le=1)


class ChannelSettings(BaseModel):
    hospital_low: float = Field(0.20, ge=0, le=1)
    hospital_high: float = Field(0.70, ge=0, le=1)
    min_score: Score = Field(0.2, ge=0, le=1)

    @model_validator(mode="after")
    def _ordered(self):
        if self.hospital_low >= self.hospital_high:
            raise ValueError(
                "Нижняя граница доли госпиталя должна быть меньше верхней"
            )
        return self


class ScoreDictionary(BaseModel):
    """Справочник «значение → балл»; default — для всего остального."""
    default: Score = Field(ge=0, le=1)
    map: dict[str, Score]

    @model_validator(mode="after")
    def _in_range(self):
        for key, value in self.map.items():
            if not 0 <= value <= 1:
                raise ValueError(f"Балл для «{key}» должен быть от 0 до 1")
        return self


class DirectionDictionary(BaseModel):
    default: str = Field(min_length=1)
    map: dict[str, str]


def _default_form_scores() -> ScoreDictionary:
    injections_inhalations = (
        "I-INF", "I-VIAL", "I-PFS", "I-AMP", "I-CART", "I-PWD",
        "EY-INJ", "LUNG-INH", "NS-INH",
    )
    oral_and_topical = (
        "TC-TAB", "TC-CAP", "LOZ",
        "ORAL SOL", "ORAL SUSP", "ORAL PWD", "ORAL DRP", "ORAL SPR",
        "ORAL PAST", "ORAL OIL", "SYR",
        "D-GEL", "D-OINT", "D-SOL", "D-CRM", "D-SPR", "D-PWD",
        "D-PAST", "D-OIL", "D-OTH FRM",
    )
    scores = {code: 0.3 for code in injections_inhalations}
    scores.update({code: 1.0 for code in oral_and_topical})
    # глазные, вагинальные и все прочие формы — балл по умолчанию
    return ScoreDictionary(default=0.6, map=scores)


def _default_class_barriers() -> ScoreDictionary:
    high = (
        "ОНКО", "ИММУНО", "ИММУНОСУПРЕССАНТ", "ВАКЦИНА",
        "ГЕМАТОЛОГИЯ", "ГЕНЕТИКА",
    )
    medium = (
        "ДИАГНОЗ", "П-ВИРУС",
        "ПАРЕНТЕРАЛЬНЫЙ ПИТАТЕЛЬНЫЙ/АМИНОКИСЛОТНЫЙ РАСТВОР",
    )
    scores = {name: 0.3 for name in high}
    scores.update({name: 0.6 for name in medium})
    return ScoreDictionary(default=1.0, map=scores)


def _default_directions() -> DirectionDictionary:
    return DirectionDictionary(
        default="Терапия",
        map={
            "КАРДИО": "Кардиология",
            "ГИНО": "Гинекология",
            "ОНКО": "Онкология",
            "НЕЙРО": "Неврология",
            "ЖКТ": "Гастроэнтерология",
            "ПЕЧЕНЬ": "Гастроэнтерология",
            "ПРОКТО": "Гастроэнтерология",
            "ДИАБЕТ": "Эндокринология",
            "ЭНДО": "Эндокринология",
            "ГОРМОН": "Эндокринология",
            "ДЕРМ": "Дерматология",
            "ГЛАЗНЫЕ": "Офтальмология",
            "УРОЛОГИЯ": "Урология",
            "ПОЧКИ": "Урология",
            "ЛОР": "ЛОР",
            "УШНЫЕ": "ЛОР",
            "БА": "Пульмонология",
            "ПУЛЬМОНОЛОГИЯ": "Пульмонология",
            "РЕВМАТОЛОГИЯ": "Ревматология",
            "КРОВЬ": "Гематология",
            "ГЕМАТОЛОГИЯ": "Гематология",
            "ИММУНО": "Иммунология",
            "ИММУНОСУПРЕССАНТ": "Иммунология",
            "АЛЛЕР": "Аллергология",
            "ДЕНТА": "Стоматология",
        },
    )


class ScoringSettings(BaseModel):
    weights: Weights = Field(default_factory=Weights)
    stop: StopFilters = Field(default_factory=StopFilters)
    thresholds: Thresholds = Field(default_factory=Thresholds)
    neutral_score: Score = Field(0.5, ge=0, le=1)
    competition: CompetitionSettings = Field(
        default_factory=CompetitionSettings,
    )
    channel: ChannelSettings = Field(default_factory=ChannelSettings)
    form_scores: ScoreDictionary = Field(
        default_factory=_default_form_scores,
    )
    class_barriers: ScoreDictionary = Field(
        default_factory=_default_class_barriers,
    )
    directions: DirectionDictionary = Field(
        default_factory=_default_directions,
    )
    # страны, производство в которых не считается импортом
    home_countries: list[str] = Field(
        default_factory=lambda: ["РОССИЯ"],
    )


def load_settings(raw_json: str | None) -> ScoringSettings:
    """Настройки рынка: сохранённые значения поверх значений по умолчанию."""
    if not raw_json:
        return ScoringSettings()
    return ScoringSettings.model_validate(json.loads(raw_json))


def dump_settings(settings: ScoringSettings) -> str:
    return json.dumps(settings.model_dump(), ensure_ascii=False)
