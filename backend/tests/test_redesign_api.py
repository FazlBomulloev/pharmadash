from types import SimpleNamespace

import pytest

from backend.routers.dashboard import _producer_tms, _top_movers
from backend.routers.overview import build_movers
from backend.routers.pharmacies import cheapest_per_source
from backend.services.scoring import compute_scoring
from backend.services.scoring_query import (
    filter_items,
    paginate,
    preview_counts,
    sort_items,
    suggest_mnn,
)
from backend.services.scoring_settings import ScoringSettings


def row(mnn, usd, un=(1e5, 1e5, 1e5), producer="P1", atc="КАРДИО"):
    return SimpleNamespace(
        mnn=mnn, producer=producer, country_mfr="ГЕРМАНИЯ", sector="RETAIL",
        atc=atc, lf=None, lf_avp="TC-TAB",
        usd_y1=usd[0], usd_y2=usd[1], usd_y3=usd[2],
        un_y1=un[0], un_y2=un[1], un_y3=un[2],
    )


@pytest.fixture
def scoring():
    rows = [
        row("ALPHA", (1e6, 2e6, 3e6)),
        row("BETA", (5e6, 5e6, 5e6), atc="ОНКО"),
        row("GAMMA", (9e6, 8e6, 7e6)),
        row("TINY", (10, 10, 10)),  # отсекается стоп-фильтром объёма
    ]
    return compute_scoring(rows, ScoringSettings())


# ────────────────────── movers ──────────────────────

def test_movers_take_top_growth_then_top_decline():
    deltas = {
        f"UP{n}": {"usd_y2": 0, "usd_y3": n * 10} for n in range(1, 8)
    }
    deltas.update({
        f"DOWN{n}": {"usd_y2": n * 10, "usd_y3": 0} for n in range(1, 6)
    })
    movers = build_movers(deltas)
    assert [m["name"] for m in movers] == [
        "UP7", "UP6", "UP5", "UP4", "UP3", "DOWN3", "DOWN4", "DOWN5",
    ]
    assert movers[0]["delta"] == 70
    assert movers[-1]["delta"] == -50


def test_movers_skip_unchanged_and_survive_one_sided_market():
    deltas = {
        "FLAT": {"usd_y2": 5, "usd_y3": 5},
        "UP": {"usd_y2": 1, "usd_y3": 4},
    }
    assert [m["name"] for m in build_movers(deltas)] == ["UP"]
    assert build_movers({}) == []


def test_top_movers_ranked_by_absolute_delta():
    producers = {
        f"P{n}": {"usd_y2": 100, "usd_y3": 100 + n} for n in range(1, 12)
    }
    producers["CRASH"] = {"usd_y2": 500, "usd_y3": 0}
    top = _top_movers(producers)
    assert len(top) == 8
    assert top[-1]["name"] == "CRASH"
    assert top[0]["name"] == "P11"


def test_producer_tms_share_and_placeholder_dose_hidden():
    tms = {
        "XARELTO": {"usd": 75.0, "forms": {"TC-TAB"}, "doses": {"20 MG"}},
        "RIVA": {"usd": 25.0, "forms": {"TC-TAB"}, "doses": {"—"}},
    }
    result = _producer_tms(tms, 100.0)
    assert [t["tm"] for t in result] == ["XARELTO", "RIVA"]
    assert result[0]["share"] == 0.75
    assert result[1]["doses"] == []
    assert _producer_tms(tms, 0.0)[0]["share"] == 0


# ────────────────────── выборка скоринга ──────────────────────

def test_filter_by_category_passed_and_query(scoring):
    items = scoring["items"]
    assert [i["mnn"] for i in filter_items(items, category="stop")] == ["TINY"]
    assert "TINY" not in [i["mnn"] for i in filter_items(items, passed_only=True)]
    assert [i["mnn"] for i in filter_items(items, q=" alp ")] == ["ALPHA"]
    assert [i["mnn"] for i in filter_items(items, q="онко")] == ["BETA"]
    assert filter_items(items, q="нет такого") == []


def test_sort_puts_missing_values_last_in_both_directions(scoring):
    items = scoring["items"]
    items[0]["price"] = None
    missing = items[0]["mnn"]
    assert sort_items(items, "price", "asc")[-1]["mnn"] == missing
    assert sort_items(items, "price", "desc")[-1]["mnn"] == missing


def test_sort_by_usd_and_unknown_key_falls_back_to_rank(scoring):
    items = scoring["items"]
    by_usd = [i["mnn"] for i in sort_items(items, "usd", "desc")]
    assert by_usd == ["GAMMA", "BETA", "ALPHA", "TINY"]
    ranks = [i["rank"] for i in sort_items(items, "no_such_key", "asc")]
    assert ranks == sorted(ranks)


def test_paginate_bounds(scoring):
    items = scoring["items"]
    assert len(paginate(items, 1, 3)) == 3
    assert len(paginate(items, 2, 3)) == 1
    assert paginate(items, 99, 3) == []
    assert len(paginate(items, 0, 0)) == 1  # страница и размер не меньше 1


def test_suggest_empty_query_returns_best_passed(scoring):
    names = [s["mnn"] for s in suggest_mnn(scoring["items"], "")]
    assert "TINY" not in names
    assert len(names) == 3
    totals = [s["total"] for s in suggest_mnn(scoring["items"], None)]
    assert totals == sorted(totals, reverse=True)


def test_suggest_matches_name_substring_or_class_prefix(scoring):
    items = scoring["items"]
    assert [s["mnn"] for s in suggest_mnn(items, "amm")] == ["GAMMA"]
    assert [s["mnn"] for s in suggest_mnn(items, "онк")] == ["BETA"]
    # стоп-фильтр не скрывает МНН из поиска по названию
    assert [s["mnn"] for s in suggest_mnn(items, "tiny")] == ["TINY"]
    assert suggest_mnn(items, "zzz") == []
    assert len(suggest_mnn(items, "a", limit=1)) == 1


def test_preview_counts_zones_and_stop_reasons(scoring):
    counts = preview_counts(scoring)
    assert counts["total"] == 4
    assert counts["passed"] == 3
    assert counts["stop"]["min_sales"] == 1
    assert counts["stop"]["max_price"] == 0
    assert sum(counts["zones"].values()) == 3
    assert "stop" not in counts["zones"]


# ────────────────────── сравнение цен ──────────────────────

def price(id_, source, value):
    return SimpleNamespace(id=id_, source=source, price=value, url=None)


def test_cheapest_per_source_keeps_current_position():
    current = price(1, "rigla", 500.0)
    rows = [
        current,
        price(2, "rigla", 450.0),   # дешевле в той же аптеке — не подменяет
        price(3, "ozerki", 470.0),
        price(4, "ozerki", 430.0),
        price(5, "eapteka", None),  # без цены — пропускается
    ]
    result = cheapest_per_source(rows, current)
    assert [(r["source"], r["price"]) for r in result] == [
        ("ozerki", 430.0), ("rigla", 500.0),
    ]
    assert [r["is_current"] for r in result] == [False, True]


def test_cheapest_per_source_current_without_price():
    current = price(1, "rigla", None)
    assert cheapest_per_source([current], current) == []


# ────────────────────── запуск парсеров ──────────────────────

class FakeProcess:
    pid = 4242

    def __init__(self):
        self.exit_code = None

    def poll(self):
        return self.exit_code


def test_parser_runs_in_separate_process(monkeypatch):
    from backend.services.pharmacies import runner

    launched = []

    def fake_popen(command, **kwargs):
        launched.append(command)
        return FakeProcess()

    monkeypatch.setattr(runner.subprocess, "Popen", fake_popen)
    monkeypatch.setattr(runner, "_active_runs", {})

    assert runner.launch_background("rigla", limit=5) is True
    assert launched[0][1:] == [
        "-m", "backend.services.pharmacies.worker", "rigla", "--limit", "5",
    ]
    assert runner.is_running("rigla") is True
    # повторный запуск, пока воркер жив, не плодит второй процесс
    assert runner.launch_background("rigla") is False
    assert len(launched) == 1

    runner._active_runs["rigla"].exit_code = 0
    assert runner.is_running("rigla") is False
    assert runner.launch_background("rigla") is True


def test_parser_unknown_source_does_not_spawn(monkeypatch):
    from backend.services.pharmacies import runner

    monkeypatch.setattr(runner, "_active_runs", {})
    monkeypatch.setattr(
        runner.subprocess, "Popen",
        lambda *a, **k: pytest.fail("процесс не должен запускаться"),
    )
    with pytest.raises(KeyError):
        runner.launch_background("no-such-pharmacy")
