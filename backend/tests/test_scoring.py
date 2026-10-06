from types import SimpleNamespace

import pytest

from backend.services.scoring import (
    CATEGORY_MISS,
    CATEGORY_PRIORITY,
    CATEGORY_STOP,
    CATEGORY_WATCH,
    STOP_MAX_PRICE,
    STOP_MAX_PRODUCERS,
    STOP_MIN_SALES,
    channel_score,
    competition_score,
    compute_scoring,
    hhi_score,
    percentile_scores,
)
from backend.services.scoring_settings import ScoringSettings


@pytest.fixture
def settings() -> ScoringSettings:
    return ScoringSettings()


def row(mnn, usd=(0, 0, 0), un=(0, 0, 0), producer="P1", country="РОССИЯ",
        sector="RETAIL", atc="КАРДИО", lf_avp="TC-TAB"):
    return SimpleNamespace(
        mnn=mnn, producer=producer, country_mfr=country, sector=sector,
        atc=atc, lf=None, lf_avp=lf_avp,
        usd_y1=usd[0], usd_y2=usd[1], usd_y3=usd[2],
        un_y1=un[0], un_y2=un[1], un_y3=un[2],
    )


def by_mnn(result):
    return {i["mnn"]: i for i in result["items"]}


# ────────────────────── граничные точки ──────────────────────

@pytest.mark.parametrize("producers, expected", [
    (0, 0.5), (1, 0.5), (2, 1.0), (15, 1.0), (16, 0.9),
    (20, 0.5), (25, 0.5),
])
def test_competition_boundaries(settings, producers, expected):
    assert competition_score(producers, settings) == pytest.approx(expected)


@pytest.mark.parametrize("share, expected", [
    (0.0, 1.0), (0.20, 1.0), (0.45, 0.6), (0.70, 0.2), (1.0, 0.2),
])
def test_channel_boundaries(settings, share, expected):
    assert channel_score(share, settings) == pytest.approx(expected)


def test_channel_without_data_is_neutral(settings):
    assert channel_score(None, settings) == settings.neutral_score


@pytest.mark.parametrize("hhi, expected", [
    (10_000, 0.0), (5_000, 0.5), (0, 1.0),
])
def test_hhi_boundaries(settings, hhi, expected):
    assert hhi_score(hhi, settings) == pytest.approx(expected)


def test_percentile_basic():
    scores = percentile_scores({"a": 10, "b": 20, "c": 30})
    assert scores == {"a": 0.0, "b": 0.5, "c": 1.0}


def test_percentile_equal_values_share_score():
    scores = percentile_scores({"a": 10, "b": 10, "c": 30, "d": 30})
    assert scores["a"] == scores["b"] == 0.0
    assert scores["c"] == scores["d"] == pytest.approx(2 / 3)


def test_percentile_skips_empty_and_single_value():
    assert percentile_scores({"a": 5, "b": None}) == {"a": 1.0, "b": None}


# ────────────────────── метрики ──────────────────────

def test_metrics(settings):
    rows = [
        row("A", usd=(100, 150, 400), un=(10, 15, 20),
            producer="P1", country="РОССИЯ", sector="RETAIL"),
        row("A", usd=(0, 50, 600), un=(0, 5, 30),
            producer="P2", country="ГЕРМАНИЯ", sector="HOSPITAL",
            lf_avp="I-AMP"),
    ]
    a = by_mnn(compute_scoring(rows, settings))["A"]
    assert a["sales"] == [100, 200, 1000]
    assert a["price"] == pytest.approx(1000 / 50)
    assert a["cagr_usd"] == pytest.approx((1000 / 100) ** 0.5 - 1)
    assert a["cagr_units"] == pytest.approx((50 / 10) ** 0.5 - 1)
    assert a["import_share"] == pytest.approx(0.6)
    assert a["hospital_share"] == pytest.approx(0.6)
    assert a["producers"] == 2
    assert a["hhi"] == pytest.approx(40 ** 2 + 60 ** 2)
    # ЛФ взвешиваются по $ Y: таблетки 1,0 × 400 + инъекции 0,3 × 600
    assert a["form_score"] == pytest.approx((400 * 1.0 + 600 * 0.3) / 1000)


def test_missing_data_gives_null_metrics_and_neutral_scores(settings):
    rows = [
        row("EMPTY", usd=(0, 0, 0), un=(0, 0, 0)),
        row("OTHER", usd=(10, 10, 10), un=(1, 1, 1)),
    ]
    empty = by_mnn(compute_scoring(rows, settings))["EMPTY"]
    for metric in ("price", "cagr_usd", "cagr_units", "import_share",
                   "hospital_share", "hhi"):
        assert empty[metric] is None
    assert empty["producers"] == 0
    for criterion in ("import_share", "cagr_usd", "price", "demand",
                      "hhi", "channel"):
        assert empty["scores"][criterion] == settings.neutral_score


def test_class_is_taken_by_max_sales_and_mapped_to_direction(settings):
    rows = [
        row("A", usd=(1, 1, 10), un=(1, 1, 1), atc="ГИНО"),
        row("A", usd=(1, 1, 90), un=(1, 1, 1), atc="ОНКО"),
        row("B", usd=(1, 1, 5), un=(1, 1, 1), atc="НЕИЗВЕСТНЫЙ"),
    ]
    items = by_mnn(compute_scoring(rows, settings))
    assert items["A"]["cls"] == "ОНКО"
    assert items["A"]["direction"] == "Онкология"
    assert items["A"]["scores"]["class_barrier"] == 0.3
    assert items["B"]["direction"] == "Терапия"
    assert items["B"]["scores"]["class_barrier"] == 1.0


def test_volume_percentile_is_within_class(settings):
    rows = [
        row("K1", usd=(1, 1, 100), un=(1, 1, 1), atc="КАРДИО"),
        row("K2", usd=(1, 1, 300), un=(1, 1, 1), atc="КАРДИО"),
        # в своём классе лидер, хотя по всей выборке — самый маленький
        row("G1", usd=(1, 1, 10), un=(1, 1, 1), atc="ГИНО"),
    ]
    items = by_mnn(compute_scoring(rows, settings))
    assert items["K1"]["scores"]["volume"] == 0.0
    assert items["K2"]["scores"]["volume"] == 1.0
    assert items["G1"]["scores"]["volume"] == 1.0


# ────────────────────── итог, ранг, категория ──────────────────────

def _market(n=12):
    rows = []
    for k in range(1, n + 1):
        rows.append(row(
            f"M{k}",
            usd=(1_000_000 * k, 1_100_000 * k, 1_000_000 * k * (1 + k / 10)),
            un=(100_000, 100_000, 100_000 + 5_000 * k),
            producer=f"P{k % 3}",
            country="РОССИЯ" if k % 2 else "ИНДИЯ",
            sector="RETAIL" if k % 3 else "HOSPITAL",
            atc="КАРДИО" if k % 2 else "ОНКО",
            lf_avp="TC-TAB" if k % 4 else "I-AMP",
        ))
    return rows


def test_total_spans_zero_to_hundred(settings):
    totals = [i["total"] for i in compute_scoring(_market(), settings)["items"]]
    assert max(totals) == pytest.approx(100)
    assert min(totals) == pytest.approx(0)


def test_rank_follows_total_and_ties_share_rank(settings):
    rows = [
        row("A", usd=(10, 10, 10), un=(1, 1, 1)),
        row("B", usd=(10, 10, 10), un=(1, 1, 1)),
        row("C", usd=(10, 10, 90), un=(1, 1, 1), country="ИНДИЯ"),
    ]
    result = compute_scoring(rows, settings)
    items = by_mnn(result)
    assert [i["rank"] for i in result["items"]] == [1, 2, 2]
    assert items["C"]["rank"] == 1
    assert items["A"]["total"] == items["B"]["total"]


def test_sales_sum_matches_selection(settings):
    rows = _market()
    result = compute_scoring(rows, settings)
    assert result["summary"]["sales"][2] == pytest.approx(
        sum(r.usd_y3 for r in rows)
    )
    assert sum(i["sales"][2] for i in result["items"]) == pytest.approx(
        sum(r.usd_y3 for r in rows)
    )


def test_stop_filter_changes_category_but_not_score(settings):
    rows = [
        row("SMALL", usd=(1, 1, 100_000), un=(1, 1, 10_000),
            country="ИНДИЯ"),
        row("PRICEY", usd=(1, 1, 5_000_000), un=(1, 1, 1_000),
            country="ИНДИЯ"),
        row("OK", usd=(1, 1, 2_000_000), un=(1, 1, 100_000)),
    ] + [
        row("CROWDED", usd=(1, 1, 100_000), un=(1, 1, 10_000),
            producer=f"P{k}")
        for k in range(21)
    ]
    result = compute_scoring(rows, settings)
    items = by_mnn(result)
    assert items["SMALL"]["stop_reasons"] == [STOP_MIN_SALES]
    assert items["PRICEY"]["stop_reasons"] == [STOP_MAX_PRICE]
    assert items["CROWDED"]["stop_reasons"] == [STOP_MAX_PRODUCERS]
    assert items["OK"]["passed"]
    for name in ("SMALL", "PRICEY", "CROWDED"):
        assert items[name]["category"] == CATEGORY_STOP
        assert items[name]["rank"] >= 1
        assert 0 <= items[name]["total"] <= 100
    assert result["summary"]["passed"] == 1
    assert result["summary"]["categories"][CATEGORY_STOP] == 3


def test_stopped_mnn_still_take_part_in_percentiles(settings):
    rows = [
        row("TINY", usd=(1, 1, 10), un=(1, 1, 10)),
        row("BIG", usd=(1, 1, 5_000_000), un=(1, 1, 100_000)),
    ]
    items = by_mnn(compute_scoring(rows, settings))
    assert not items["TINY"]["passed"]
    # BIG — лучший из двух именно потому, что TINY остался в выборке
    assert items["BIG"]["scores"]["volume"] == 1.0
    assert items["TINY"]["scores"]["volume"] == 0.0


def test_category_thresholds_come_from_settings():
    rows = _market()
    default = compute_scoring(rows, ScoringSettings())
    strict = compute_scoring(rows, ScoringSettings.model_validate({
        "thresholds": {"priority": 100, "watch": 100},
        "stop": {"min_sales_usd": 0, "max_price_usd": 1e9,
                 "max_producers": 1000},
    }))
    assert strict["summary"]["categories"][CATEGORY_PRIORITY] == 1
    assert strict["summary"]["categories"][CATEGORY_WATCH] == 0
    assert strict["summary"]["categories"][CATEGORY_MISS] == len(
        strict["items"]
    ) - 1
    assert default["summary"]["total"] == strict["summary"]["total"]


def test_weights_are_normalised_by_their_sum():
    rows = _market()
    base = compute_scoring(rows, ScoringSettings())
    doubled_weights = {
        k: v * 2 for k, v in ScoringSettings().weights.model_dump().items()
    }
    doubled = compute_scoring(
        rows, ScoringSettings.model_validate({"weights": doubled_weights}),
    )
    assert [i["raw"] for i in base["items"]] == pytest.approx(
        [i["raw"] for i in doubled["items"]]
    )


# ────────────────────── фильтр по ЛФ ──────────────────────

def test_single_form_filter_equals_mnn_times_form(settings):
    rows = [
        row("A", usd=(100, 100, 400), un=(10, 10, 20), lf_avp="TC-TAB"),
        row("A", usd=(50, 50, 900), un=(5, 5, 9), lf_avp="I-AMP",
            producer="P2", country="ИНДИЯ", sector="HOSPITAL"),
        row("B", usd=(100, 100, 300), un=(10, 10, 30), lf_avp="TC-TAB"),
        row("B", usd=(10, 10, 10), un=(1, 1, 1), lf_avp="D-GEL"),
    ]
    filtered = compute_scoring(
        [r for r in rows if r.lf_avp == "TC-TAB"], settings,
    )
    # «МНН × эта ЛФ»: те же продажи, но МНН уже несут только эту форму
    manual = compute_scoring([
        row("A", usd=(100, 100, 400), un=(10, 10, 20)),
        row("B", usd=(100, 100, 300), un=(10, 10, 30)),
    ], settings)
    for got, expected in zip(filtered["items"], manual["items"]):
        assert got["mnn"] == expected["mnn"]
        assert got["sales"] == expected["sales"]
        assert got["scores"] == pytest.approx(expected["scores"])
        assert got["total"] == pytest.approx(expected["total"])
        assert got["rank"] == expected["rank"]
        assert got["category"] == expected["category"]
    a = by_mnn(filtered)["A"]
    assert a["sales"][2] == 400
    assert a["form_score"] == 1.0  # балл единственной выбранной ЛФ
    assert a["import_share"] == 0.0
