# Направления (медицинские специальности) в EPI — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Направление (медицинская специальность) становится измерением рынка: справочник МНН × ЛФ → специальности с долями назначений, карточка в обзоре, боковая панель, вкладка в дашборде МНН и страница справочника.

**Architecture:** Глобальная таблица `mnn_direction` без привязки к рынку, в памяти процесса держится как словарь `(МНН, ЛФ) → [(направление, доля)]`. Деньги раскидываются умножением USD пары на долю направления; непокрытое и недобор долей собираются в строку «Не распределено», что даёт точную сходимость с суммой рынка. Новые данные едут в уже существующих кешированных ответах обзора и дашборда, новых запросов из фронтенда не добавляется. Старый механизм направления из класса препарата удаляется целиком.

**Tech Stack:** Python 3 / FastAPI 0.115 / SQLAlchemy 2.0 async / aiosqlite / openpyxl 3.1 / pydantic 2.11; React 19 / TypeScript 6 / Vite 8 / Tailwind 4 / axios / react-router 7. Тесты: pytest + pytest-asyncio (вводятся этой работой).

**Spec:** `docs/superpowers/specs/2026-10-14-mnn-directions-design.md`

## Global Constraints

- Весь текст интерфейса, сообщения об ошибках и логи — на русском языке. Это сложившееся правило проекта, см. любой существующий роутер.
- Доля хранится как число 0 < share ≤ 1. Значение больше 1 на входе трактуется как проценты и делится на 100.
- Ключ стыка со БДП — `(UPPER(TRIM(mnn)), UPPER(TRIM(lf_avp)))`, при пустом `lf_avp` используется `lf`. Та же пара, по которой работает `form_key()` в `backend/services/bdp_keys.py`.
- Баллы скоринга не меняются ни на одну сотую. Веса, пороги и формулы в `services/scoring.py` не трогаются, кроме удаления ключа `direction` из словаря метрик.
- Миграций в проекте нет: новые таблицы создаются через `Base.metadata.create_all` в `init_db()`. Для добавления колонок в существующие таблицы есть список `_MIGRATIONS` в `backend/database.py` — в этой работе он не нужен.
- Загружается только лист `Длинный формат`. Лист `Лист1` не используется.
- Все команды бекенда запускаются из корня репозитория, модули импортируются как `backend.<...>`.
- Зависимости бекенда живут в `.venv`, а не в системном Python. Любая
  команда Python для бекенда вызывается как `./.venv/Scripts/python.exe`:
  системный интерпретатор не видит ни fastapi, ни sqlalchemy.
- В `.venv` уже стоят pytest 9.1.1, pytest-asyncio 1.4.0 и httpx 0.28.1.
  Ничего не доустанавливать и не понижать версии.
- Ожидаемые числа пройденных тестов в шагах — ориентир, а не требование.
  Круги правок добавляют тесты, поэтому фактическое число может быть больше.
  Значение имеет только одно: ноль упавших.
- Подпись «оценка по долям назначений» обязательна везде, где показываются деньги направлений. Доли в справочнике — доли назначений, а не выручки.

## Review Focus

Пять входов, которые спека подразумевает, но ни одна задача не проверяла бы по своей основной логике. Тест на каждый добавлен в задачу, владеющую кодом.

1. **Справочник пуст, а обзор рынка запрашивают.** Ожидание: карточка направлений отдаёт пустой список и строку «Не распределено» на всю сумму рынка, а не 500. Тест в задаче 2.
2. **Пара есть в справочнике, но её USD равен нулю.** Ожидание: направления не появляются с нулевыми деньгами и не делят на ноль при расчёте доли. Тест в задаче 2.
3. **Доля в файле записана как `35` вместо `0,35`.** Ожидание: трактуется как проценты, пара не получает сумму долей 3500%. Тест в задаче 4.
4. **Файл без листа `Длинный формат` и без распознаваемых колонок.** Ожидание: ответ 400 с русским текстом, а не трейсбек и не пустой справочник вместо прежнего. Тест в задаче 4.
5. **Название направления с небезопасными для URL символами** — в справочнике есть `Ортопедия/Травматология` и `Аллергология/Иммунология` со слэшем. Ожидание: эндпоинт панели находит такое направление по URL-кодированному имени. Тест в задаче 7.

---

## File Structure

Бекенд, новое:

| Файл | Ответственность |
|---|---|
| `backend/services/directions.py` | Чистое ядро: загрузка справочника в память, атрибуция USD по направлениям, агрегаты для обзора, дашборда и панели |
| `backend/services/parsers/directions_parser.py` | Чтение xlsx: поиск листа, нормализация значений, отчёт валидации |
| `backend/routers/directions.py` | Эндпоинты справочника: заливка, метаданные, постраничная таблица |
| `backend/tests/conftest.py` | Фикстуры pytest: движок и сессия на in-memory SQLite |
| `backend/tests/test_directions_attribution.py` | Тесты ядра атрибуции |
| `backend/tests/test_directions_parser.py` | Тесты парсера |
| `backend/tests/test_directions_api.py` | Тесты эндпоинтов |

Бекенд, правки: `models.py`, `main.py`, `schemas.py`, `routers/overview.py`, `routers/dashboard.py`, `routers/drilldown.py`, `services/scoring.py`, `services/scoring_settings.py`, `services/scoring_query.py`, `requirements.txt`.

Фронтенд, новое:

| Файл | Ответственность |
|---|---|
| `frontend/src/components/overview/DirectionsCard.tsx` | Карточка направлений в обзоре рынка |
| `frontend/src/components/panels/DirectionPanel.tsx` | Боковая панель разбора направления |
| `frontend/src/components/dashboard/DirectionsTab.tsx` | Вкладка «Направления» в дашборде МНН |
| `frontend/src/pages/DirectionsRefPage.tsx` | Страница справочника |

Фронтенд, правки: `App.tsx`, `components/layout/Sidebar.tsx`, `pages/MarketOverviewPage.tsx`, `pages/MarketDashboardPage.tsx`, `pages/AdminPage.tsx`, `api/client.ts`, `types/api.ts`, `components/scoring/ScoringTable.tsx`, `components/dashboard/MnnHero.tsx`, `components/overview/OverviewCards.tsx`, `pages/MarketScoringPage.tsx`.

---

## Task 1: Таблицы и инфраструктура тестов

**Files:**
- Modify: `backend/models.py` (добавить в конец файла)
- Modify: `backend/requirements.txt`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_models_directions.py`

**Interfaces:**
- Consumes: ничего
- Produces: модели `MnnDirection` (поля `id: int`, `mnn: str`, `lf: str`, `direction: str`, `share: float`) и `DirectionImport` (поля `id: int`, `filename: str`, `uploaded_at: datetime`, `rows_count: int`, `pairs_count: int`, `directions_count: int`, `report_json: str`); фикстура pytest `db` типа `AsyncSession`

- [ ] **Step 1: Зафиксировать тестовые зависимости**

Пакеты уже установлены в `.venv` — ставить ничего не нужно. Зафиксировать
фактические версии в конце `backend/requirements.txt`:

```
pytest==9.1.1
pytest-asyncio==1.4.0
```

Проверить, что версии совпадают с установленными:

```bash
cd "C:/Users/B Fazliddin/Desktop/Pharmadash" && ./.venv/Scripts/python.exe -c "import pytest, pytest_asyncio; print(pytest.__version__, pytest_asyncio.__version__)"
```

Ожидается: `9.1.1 1.4.0`. Если версии другие — записать в
`requirements.txt` фактические, а не эти.

- [ ] **Step 2: Написать падающий тест на модели**

Создать `backend/tests/__init__.py` пустым файлом.

Создать `backend/tests/conftest.py`:

```python
import pytest_asyncio
from sqlalchemy.ext.asyncio import (
    AsyncSession, async_sessionmaker, create_async_engine,
)

from backend.models import Base


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False,
    )
    async with session_factory() as session:
        yield session
    await engine.dispose()
```

Создать `backend/tests/test_models_directions.py`:

```python
import json

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from backend.models import DirectionImport, MnnDirection


@pytest.mark.asyncio
async def test_mnn_direction_roundtrip(db):
    db.add(MnnDirection(
        mnn="CLOBETASOL", lf="D-CRM",
        direction="Дерматология", share=0.85,
    ))
    await db.commit()

    rows = (await db.execute(select(MnnDirection))).scalars().all()
    assert len(rows) == 1
    assert rows[0].mnn == "CLOBETASOL"
    assert rows[0].share == 0.85


@pytest.mark.asyncio
async def test_mnn_direction_rejects_duplicate_triple(db):
    for _ in range(2):
        db.add(MnnDirection(
            mnn="CLOBETASOL", lf="D-CRM",
            direction="Дерматология", share=0.85,
        ))
    with pytest.raises(IntegrityError):
        await db.commit()


@pytest.mark.asyncio
async def test_direction_import_stores_report(db):
    db.add(DirectionImport(
        filename="Направления_01.xlsx",
        rows_count=72262, pairs_count=20414, directions_count=35,
        report_json=json.dumps({"skipped": 0}, ensure_ascii=False),
    ))
    await db.commit()

    row = (await db.execute(select(DirectionImport))).scalars().one()
    assert row.rows_count == 72262
    assert json.loads(row.report_json)["skipped"] == 0
    assert row.uploaded_at is not None
```

- [ ] **Step 3: Запустить тест и убедиться, что падает**

```bash
cd "C:/Users/B Fazliddin/Desktop/Pharmadash" && ./.venv/Scripts/python.exe -m pytest backend/tests/test_models_directions.py -v
```

Ожидается: FAIL с `ImportError: cannot import name 'MnnDirection' from 'backend.models'`.

- [ ] **Step 4: Добавить модели**

В конец `backend/models.py` дописать:

```python
class MnnDirection(Base):
    __tablename__ = "mnn_direction"
    __table_args__ = (
        UniqueConstraint(
            "mnn", "lf", "direction", name="uq_mnn_direction_triple",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    mnn = Column(String(300), nullable=False, index=True)
    lf = Column(String(100), nullable=False, index=True)
    direction = Column(String(100), nullable=False)
    share = Column(Float, nullable=False)


class DirectionImport(Base):
    __tablename__ = "direction_import"

    id = Column(Integer, primary_key=True, autoincrement=True)
    filename = Column(String(300), nullable=False)
    uploaded_at = Column(
        DateTime, nullable=False, default=datetime.utcnow,
    )
    rows_count = Column(Integer, nullable=False, default=0)
    pairs_count = Column(Integer, nullable=False, default=0)
    directions_count = Column(Integer, nullable=False, default=0)
    report_json = Column(Text, nullable=True)
```

В блок импортов `backend/models.py` добавить `UniqueConstraint` — строка импорта из `sqlalchemy` становится:

```python
from sqlalchemy import (
    Column,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    DateTime,
    UniqueConstraint,
)
```

- [ ] **Step 5: Запустить тест и убедиться, что проходит**

```bash
cd "C:/Users/B Fazliddin/Desktop/Pharmadash" && ./.venv/Scripts/python.exe -m pytest backend/tests/test_models_directions.py -v
```

Ожидается: 3 passed.

- [ ] **Step 6: Коммит**

`pytest.ini` в корне репозитория уже создан контроллером и проверен —
`testpaths = backend/tests`, `asyncio_mode = auto`,
`asyncio_default_fixture_loop_scope = function`. Отдельный
`backend/pytest.ini` не нужен, создавать его не надо.

```bash
git add backend/models.py backend/requirements.txt backend/tests pytest.ini
git commit -m "Add mnn_direction and direction_import tables with test harness"
```

---

## Task 2: Ядро атрибуции

**Files:**
- Create: `backend/services/directions.py`
- Create: `backend/tests/test_directions_attribution.py`

**Interfaces:**
- Consumes: `MnnDirection` из задачи 1
- Produces:
  - `pair_key(mnn: str | None, lf: str | None) -> tuple[str, str]`
  - `DirectionMap = dict[tuple[str, str], list[tuple[str, float]]]`
  - `async load_direction_map(db: AsyncSession) -> DirectionMap` — с кешем в памяти
  - `invalidate_direction_map() -> None`
  - `attribute_usd(items: Iterable[Any], dmap: DirectionMap) -> tuple[dict[str, list[float]], list[float]]` — возвращает `({направление: [usd_y1, usd_y2, usd_y3]}, [остаток_y1, остаток_y2, остаток_y3])`
  - `UNALLOCATED: str` — константа `"Не распределено"`

`attribute_usd` принимает любые объекты с атрибутами `mnn`, `lf_avp`, `lf`, `usd_y1`, `usd_y2`, `usd_y3` — то есть и строки `BdpRaw`, и кортежи из `_load_market_rows`.

- [ ] **Step 1: Написать падающие тесты**

Создать `backend/tests/test_directions_attribution.py`:

```python
from types import SimpleNamespace

import pytest

from backend.services.directions import (
    UNALLOCATED,
    attribute_usd,
    invalidate_direction_map,
    load_direction_map,
    pair_key,
)
from backend.models import MnnDirection


def row(mnn, lf, usd3, usd1=0.0, usd2=0.0):
    return SimpleNamespace(
        mnn=mnn, lf_avp=lf, lf=None,
        usd_y1=usd1, usd_y2=usd2, usd_y3=usd3,
    )


def test_pair_key_normalises_case_and_spaces():
    assert pair_key(" clobetasol ", " d-crm ") == ("CLOBETASOL", "D-CRM")


def test_pair_key_handles_none():
    assert pair_key(None, None) == ("", "")


def test_full_coverage_splits_usd_by_share():
    dmap = {("A", "TC-TAB"): [("Дерматология", 0.6), ("Педиатрия", 0.4)]}
    by_dir, rest = attribute_usd([row("A", "TC-TAB", 100.0)], dmap)

    assert by_dir["Дерматология"][2] == pytest.approx(60.0)
    assert by_dir["Педиатрия"][2] == pytest.approx(40.0)
    assert rest[2] == pytest.approx(0.0)


def test_partial_shares_put_shortfall_into_rest():
    dmap = {("A", "TC-TAB"): [("Дерматология", 0.6), ("Педиатрия", 0.3)]}
    by_dir, rest = attribute_usd([row("A", "TC-TAB", 100.0)], dmap)

    assert by_dir["Дерматология"][2] == pytest.approx(60.0)
    assert rest[2] == pytest.approx(10.0)


def test_missing_pair_goes_entirely_to_rest():
    by_dir, rest = attribute_usd([row("A", "TC-TAB", 100.0)], {})

    assert by_dir == {}
    assert rest[2] == pytest.approx(100.0)


def test_reconciles_exactly_on_mixed_input():
    dmap = {
        ("A", "TC-TAB"): [("Дерматология", 0.6), ("Педиатрия", 0.4)],
        ("B", "D-CRM"): [("Терапия", 0.9)],
    }
    items = [
        row("A", "TC-TAB", 100.0, 80.0, 90.0),
        row("B", "D-CRM", 50.0, 40.0, 45.0),
        row("C", "SYR", 7.5, 7.0, 7.2),
    ]
    by_dir, rest = attribute_usd(items, dmap)

    for k in range(3):
        total_in = sum(getattr(i, f"usd_y{k + 1}") for i in items)
        total_out = sum(v[k] for v in by_dir.values()) + rest[k]
        assert total_out == pytest.approx(total_in)


def test_empty_map_sends_everything_to_rest_without_error():
    items = [row("A", "TC-TAB", 10.0), row("B", "D-CRM", 20.0)]
    by_dir, rest = attribute_usd(items, {})

    assert by_dir == {}
    assert rest[2] == pytest.approx(30.0)


def test_zero_usd_pair_produces_no_phantom_money():
    dmap = {("A", "TC-TAB"): [("Дерматология", 1.0)]}
    by_dir, rest = attribute_usd([row("A", "TC-TAB", 0.0)], dmap)

    assert by_dir.get("Дерматология", [0, 0, 0])[2] == pytest.approx(0.0)
    assert rest[2] == pytest.approx(0.0)


def test_lf_falls_back_when_lf_avp_empty():
    item = SimpleNamespace(
        mnn="A", lf_avp=None, lf="TC-TAB",
        usd_y1=0.0, usd_y2=0.0, usd_y3=100.0,
    )
    dmap = {("A", "TC-TAB"): [("Терапия", 1.0)]}
    by_dir, rest = attribute_usd([item], dmap)

    assert by_dir["Терапия"][2] == pytest.approx(100.0)
    assert rest[2] == pytest.approx(0.0)


def test_unallocated_label_is_russian():
    assert UNALLOCATED == "Не распределено"


async def test_load_direction_map_reads_rows_and_caches(db):
    invalidate_direction_map()
    db.add_all([
        MnnDirection(mnn="A", lf="TC-TAB", direction="Терапия", share=0.7),
        MnnDirection(mnn="A", lf="TC-TAB", direction="Педиатрия", share=0.3),
    ])
    await db.commit()

    dmap = await load_direction_map(db)
    assert sorted(dmap[("A", "TC-TAB")]) == [
        ("Педиатрия", 0.3), ("Терапия", 0.7),
    ]

    db.add(MnnDirection(mnn="B", lf="D-CRM", direction="Терапия", share=1.0))
    await db.commit()
    assert ("B", "D-CRM") not in await load_direction_map(db)

    invalidate_direction_map()
    assert ("B", "D-CRM") in await load_direction_map(db)
```

- [ ] **Step 2: Запустить тесты и убедиться, что падают**

```bash
cd "C:/Users/B Fazliddin/Desktop/Pharmadash" && ./.venv/Scripts/python.exe -m pytest backend/tests/test_directions_attribution.py -v
```

Ожидается: FAIL с `ModuleNotFoundError: No module named 'backend.services.directions'`.

- [ ] **Step 3: Реализовать ядро**

Создать `backend/services/directions.py`:

```python
import logging
from collections import defaultdict
from typing import Any, Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import MnnDirection

log = logging.getLogger(__name__)

UNALLOCATED = "Не распределено"

DirectionMap = dict[tuple[str, str], list[tuple[str, float]]]

_MAP_CACHE: DirectionMap | None = None


def pair_key(mnn: str | None, lf: str | None) -> tuple[str, str]:
    return ((mnn or "").strip().upper(), (lf or "").strip().upper())


def item_key(item: Any) -> tuple[str, str]:
    lf = getattr(item, "lf_avp", None) or getattr(item, "lf", None)
    return pair_key(getattr(item, "mnn", None), lf)


def invalidate_direction_map() -> None:
    global _MAP_CACHE
    _MAP_CACHE = None
    log.info("Кеш справочника направлений сброшен")


async def load_direction_map(db: AsyncSession) -> DirectionMap:
    global _MAP_CACHE
    if _MAP_CACHE is not None:
        return _MAP_CACHE

    stmt = select(
        MnnDirection.mnn, MnnDirection.lf,
        MnnDirection.direction, MnnDirection.share,
    )
    result: DirectionMap = defaultdict(list)
    for mnn, lf, direction, share in (await db.execute(stmt)).all():
        result[pair_key(mnn, lf)].append((direction, share))

    _MAP_CACHE = dict(result)
    log.info("Справочник направлений загружен: %d пар", len(_MAP_CACHE))
    return _MAP_CACHE


def attribute_usd(
    items: Iterable[Any], dmap: DirectionMap,
) -> tuple[dict[str, list[float]], list[float]]:
    by_dir: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0, 0.0])
    rest = [0.0, 0.0, 0.0]

    for item in items:
        usd = (
            item.usd_y1 or 0.0,
            item.usd_y2 or 0.0,
            item.usd_y3 or 0.0,
        )
        pairs = dmap.get(item_key(item))
        if not pairs:
            for k in range(3):
                rest[k] += usd[k]
            continue

        covered = 0.0
        for direction, share in pairs:
            covered += share
            bucket = by_dir[direction]
            for k in range(3):
                bucket[k] += usd[k] * share

        if covered < 1.0 - 1e-9:
            shortfall = 1.0 - covered
            for k in range(3):
                rest[k] += usd[k] * shortfall

    return dict(by_dir), rest
```

- [ ] **Step 4: Запустить тесты и убедиться, что проходят**

```bash
cd "C:/Users/B Fazliddin/Desktop/Pharmadash" && ./.venv/Scripts/python.exe -m pytest backend/tests/test_directions_attribution.py -v
```

Ожидается: 11 passed.

- [ ] **Step 5: Коммит**

```bash
git add backend/services/directions.py backend/tests/test_directions_attribution.py
git commit -m "Add direction attribution core with exact reconciliation"
```

---

## Task 3: Агрегаты для обзора, дашборда и панели

**Files:**
- Modify: `backend/services/directions.py`
- Modify: `backend/tests/test_directions_attribution.py`

**Interfaces:**
- Consumes: `attribute_usd`, `UNALLOCATED`, `DirectionMap`, `item_key` из задачи 2
- Produces:
  - `build_overview_directions(items, dmap, top_n: int = 15) -> list[dict]` — элементы с ключами `name: str`, `usd: float`, `share: float | None`, `shares_by_year: list[float | None]`, `growth: float | None`, `kind: str` (`"direction"` / `"other"` / `"unallocated"`)
  - `build_mnn_directions(items, dmap) -> dict` — ключи `total: dict`, `forms: list[dict]`
  - `build_direction_detail(items, dmap, name: str, market_total_y3: float) -> dict`

Обозначения в `build_mnn_directions`: `total` — ключи `usd: float`, `rows: list[dict]`; `forms` — элементы с ключами `form: str`, `usd: float`, `rows: list[dict]`, `in_reference: bool`. Элемент `rows` — ключи `name: str`, `share: float`, `usd: float`.

- [ ] **Step 1: Написать падающие тесты**

Сначала дополнить существующий верхний блок импортов в
`backend/tests/test_directions_attribution.py` — он становится таким:

```python
from backend.services.directions import (
    UNALLOCATED,
    attribute_usd,
    build_direction_detail,
    build_mnn_directions,
    build_overview_directions,
    invalidate_direction_map,
    load_direction_map,
    pair_key,
)
```

Второй блок `import` в середине файла не создавать.

Затем дописать тесты в конец файла:

```python
def test_overview_directions_sorted_with_tail_rows():
    dmap = {
        ("A", "TC-TAB"): [("Терапия", 1.0)],
        ("B", "TC-TAB"): [("Педиатрия", 1.0)],
        ("C", "TC-TAB"): [("ЛОР", 1.0)],
    }
    items = [
        row("A", "TC-TAB", 300.0, 100.0, 200.0),
        row("B", "TC-TAB", 200.0, 100.0, 100.0),
        row("C", "TC-TAB", 100.0, 100.0, 100.0),
        row("D", "SYR", 400.0, 400.0, 400.0),
    ]
    out = build_overview_directions(items, dmap, top_n=2)

    assert [o["name"] for o in out] == [
        "Терапия", "Педиатрия", "Прочие направления", UNALLOCATED,
    ]
    assert [o["kind"] for o in out] == [
        "direction", "direction", "other", "unallocated",
    ]
    assert out[0]["usd"] == pytest.approx(300.0)
    assert out[2]["usd"] == pytest.approx(100.0)
    assert out[3]["usd"] == pytest.approx(400.0)
    assert out[0]["share"] == pytest.approx(0.3)
    assert out[0]["growth"] == pytest.approx(0.5)


def test_overview_directions_omits_tail_rows_when_empty():
    dmap = {("A", "TC-TAB"): [("Терапия", 1.0)]}
    out = build_overview_directions(
        [row("A", "TC-TAB", 100.0, 100.0, 100.0)], dmap, top_n=5,
    )

    assert [o["name"] for o in out] == ["Терапия"]


def test_overview_directions_on_empty_reference():
    items = [row("A", "TC-TAB", 100.0, 100.0, 100.0)]
    out = build_overview_directions(items, {}, top_n=5)

    assert [o["name"] for o in out] == [UNALLOCATED]
    assert out[0]["share"] == pytest.approx(1.0)


def test_overview_directions_on_zero_money_market():
    out = build_overview_directions([row("A", "TC-TAB", 0.0)], {}, top_n=5)

    assert out == []


def test_mnn_directions_splits_by_form_and_rolls_up():
    dmap = {
        ("A", "D-CRM"): [("Дерматология", 0.85), ("Педиатрия", 0.15)],
        ("A", "D-OINT"): [("Дерматология", 1.0)],
    }
    items = [
        row("A", "D-CRM", 100.0),
        row("A", "D-OINT", 100.0),
        row("A", "D-SOL", 50.0),
    ]
    out = build_mnn_directions(items, dmap)

    assert out["total"]["usd"] == pytest.approx(250.0)
    derm = next(r for r in out["total"]["rows"] if r["name"] == "Дерматология")
    assert derm["usd"] == pytest.approx(185.0)
    assert derm["share"] == pytest.approx(185.0 / 250.0)

    forms = {f["form"]: f for f in out["forms"]}
    assert forms["D-CRM"]["in_reference"] is True
    assert forms["D-SOL"]["in_reference"] is False
    assert forms["D-SOL"]["rows"] == []
    assert [f["form"] for f in out["forms"]] == ["D-CRM", "D-OINT", "D-SOL"]


def test_mnn_directions_includes_unallocated_row_in_total():
    dmap = {("A", "D-CRM"): [("Дерматология", 1.0)]}
    out = build_mnn_directions(
        [row("A", "D-CRM", 100.0), row("A", "SYR", 100.0)], dmap,
    )

    rest = next(r for r in out["total"]["rows"] if r["name"] == UNALLOCATED)
    assert rest["usd"] == pytest.approx(100.0)
    assert rest["share"] == pytest.approx(0.5)


def test_direction_detail_lists_pairs_and_kpi():
    dmap = {
        ("A", "D-CRM"): [("Дерматология", 0.8), ("Педиатрия", 0.2)],
        ("B", "D-GEL"): [("Дерматология", 0.5)],
    }
    items = [
        row("A", "D-CRM", 100.0, 60.0, 80.0),
        row("B", "D-GEL", 100.0, 100.0, 100.0),
    ]
    out = build_direction_detail(items, dmap, "Дерматология", 1000.0)

    assert out["name"] == "Дерматология"
    assert out["kpi"]["usd_y3"] == pytest.approx(130.0)
    assert out["kpi"]["share_of_market"] == pytest.approx(0.13)
    assert out["kpi"]["pairs_count"] == 2
    assert out["kpi"]["mnns_count"] == 2
    assert [p["mnn"] for p in out["pairs"]] == ["A", "B"]
    assert out["pairs"][0]["usd_y3"] == pytest.approx(80.0)
    assert out["pairs"][0]["share_in_pair"] == pytest.approx(0.8)
    assert [f["form"] for f in out["forms"]] == ["D-CRM", "D-GEL"]


def test_direction_detail_unknown_name_is_empty_not_error():
    dmap = {("A", "D-CRM"): [("Дерматология", 1.0)]}
    out = build_direction_detail(
        [row("A", "D-CRM", 100.0)], dmap, "Космонавтика", 1000.0,
    )

    assert out["pairs"] == []
    assert out["kpi"]["usd_y3"] == pytest.approx(0.0)
    assert out["kpi"]["share_of_market"] == pytest.approx(0.0)
```

- [ ] **Step 2: Запустить тесты и убедиться, что падают**

```bash
cd "C:/Users/B Fazliddin/Desktop/Pharmadash" && ./.venv/Scripts/python.exe -m pytest backend/tests/test_directions_attribution.py -v
```

Ожидается: FAIL с `ImportError: cannot import name 'build_overview_directions'`.

- [ ] **Step 3: Реализовать агрегаты**

Дописать в конец `backend/services/directions.py`:

```python
OTHER = "Прочие направления"
OVERVIEW_TOP_N = 15


def _safe_div(num: float, den: float) -> float | None:
    return num / den if den else None


def _growth(cur: float, prev: float) -> float | None:
    return (cur - prev) / prev if prev else None


def _row(name: str, usd: list[float], totals: list[float], kind: str) -> dict:
    return {
        "name": name,
        "usd": usd[2],
        "share": _safe_div(usd[2], totals[2]),
        "shares_by_year": [
            _safe_div(usd[k], totals[k]) for k in range(3)
        ],
        "growth": _growth(usd[2], usd[1]),
        "kind": kind,
    }


def build_overview_directions(
    items: Iterable[Any], dmap: DirectionMap, top_n: int = OVERVIEW_TOP_N,
) -> list[dict]:
    materialised = list(items)
    by_dir, rest = attribute_usd(materialised, dmap)
    totals = [
        sum(i.usd_y1 or 0.0 for i in materialised),
        sum(i.usd_y2 or 0.0 for i in materialised),
        sum(i.usd_y3 or 0.0 for i in materialised),
    ]
    if totals[2] <= 0:
        return []

    ranked = sorted(by_dir.items(), key=lambda x: (-x[1][2], x[0]))
    out = [
        _row(name, usd, totals, "direction") for name, usd in ranked[:top_n]
    ]

    tail = ranked[top_n:]
    if tail:
        merged = [sum(usd[k] for _, usd in tail) for k in range(3)]
        out.append(_row(OTHER, merged, totals, "other"))

    if rest[2] > 0:
        out.append(_row(UNALLOCATED, rest, totals, "unallocated"))

    return out


def _share_rows(
    by_dir: dict[str, list[float]], rest: list[float], total: float,
) -> list[dict]:
    rows = [
        {
            "name": name,
            "usd": usd[2],
            "share": _safe_div(usd[2], total) or 0.0,
        }
        for name, usd in sorted(by_dir.items(), key=lambda x: (-x[1][2], x[0]))
    ]
    if rest[2] > 0:
        rows.append({
            "name": UNALLOCATED,
            "usd": rest[2],
            "share": _safe_div(rest[2], total) or 0.0,
        })
    return rows


def build_mnn_directions(items: Iterable[Any], dmap: DirectionMap) -> dict:
    materialised = list(items)

    by_form: dict[str, list[Any]] = defaultdict(list)
    for item in materialised:
        by_form[item_key(item)[1] or "—"].append(item)

    total_by_dir, total_rest = attribute_usd(materialised, dmap)
    total_usd = sum(i.usd_y3 or 0.0 for i in materialised)

    forms = []
    for form, group in sorted(
        by_form.items(), key=lambda x: (-sum(i.usd_y3 or 0.0 for i in x[1]), x[0]),
    ):
        group_by_dir, group_rest = attribute_usd(group, dmap)
        group_usd = sum(i.usd_y3 or 0.0 for i in group)
        forms.append({
            "form": form,
            "usd": group_usd,
            "in_reference": bool(group_by_dir),
            "rows": (
                _share_rows(group_by_dir, group_rest, group_usd)
                if group_by_dir else []
            ),
        })

    return {
        "total": {
            "usd": total_usd,
            "rows": _share_rows(total_by_dir, total_rest, total_usd),
        },
        "forms": forms,
    }


def build_direction_detail(
    items: Iterable[Any],
    dmap: DirectionMap,
    name: str,
    market_total_y3: float,
) -> dict:
    pairs: dict[tuple[str, str], dict] = {}
    kpi_usd = [0.0, 0.0, 0.0]
    form_usd: dict[str, float] = defaultdict(float)

    for item in items:
        key = item_key(item)
        share = next(
            (s for d, s in dmap.get(key, []) if d == name), None,
        )
        if share is None:
            continue
        usd = [
            (item.usd_y1 or 0.0) * share,
            (item.usd_y2 or 0.0) * share,
            (item.usd_y3 or 0.0) * share,
        ]
        for k in range(3):
            kpi_usd[k] += usd[k]
        form_usd[key[1] or "—"] += usd[2]

        entry = pairs.get(key)
        if entry is None:
            pairs[key] = {
                "mnn": item.mnn,
                "lf": key[1] or "—",
                "usd_y2": usd[1],
                "usd_y3": usd[2],
                "share_in_pair": share,
            }
        else:
            entry["usd_y2"] += usd[1]
            entry["usd_y3"] += usd[2]

    ranked = sorted(
        pairs.values(), key=lambda p: (-p["usd_y3"], p["mnn"], p["lf"]),
    )
    for entry in ranked:
        entry["growth"] = _growth(entry["usd_y3"], entry["usd_y2"])
        entry.pop("usd_y2")

    return {
        "name": name,
        "kpi": {
            "usd_y1": kpi_usd[0],
            "usd_y2": kpi_usd[1],
            "usd_y3": kpi_usd[2],
            "usd_growth": _growth(kpi_usd[2], kpi_usd[1]),
            "share_of_market": _safe_div(kpi_usd[2], market_total_y3) or 0.0,
            "pairs_count": len(ranked),
            "mnns_count": len({p["mnn"] for p in ranked}),
        },
        "pairs": ranked,
        "forms": [
            {"form": form, "usd_y3": usd,
             "share_in_direction": _safe_div(usd, kpi_usd[2]) or 0.0}
            for form, usd in sorted(
                form_usd.items(), key=lambda x: (-x[1], x[0]),
            )
        ],
    }
```

- [ ] **Step 4: Запустить тесты и убедиться, что проходят**

```bash
cd "C:/Users/B Fazliddin/Desktop/Pharmadash" && ./.venv/Scripts/python.exe -m pytest backend/tests/test_directions_attribution.py -v
```

Ожидается: 30 passed в этом файле (21 из задач 2 и её круга правок + 8 из задания + порог остатка).

- [ ] **Step 5: Коммит**

```bash
git add backend/services/directions.py backend/tests/test_directions_attribution.py
git commit -m "Add direction aggregates for overview, MNN dashboard and panel"
```

---

## Task 4: Парсер справочника

**Files:**
- Create: `backend/services/parsers/directions_parser.py`
- Create: `backend/tests/test_directions_parser.py`

**Interfaces:**
- Consumes: ничего из предыдущих задач
- Produces:
  - `SHEET_NAME: str` — константа `"Длинный формат"`
  - `parse_directions(file_path: Path) -> tuple[list[dict], dict]` — строки с ключами `mnn`, `lf`, `direction`, `share` и отчёт с ключами `sheet: str`, `rows_read: int`, `rows_accepted: int`, `rows_skipped: int`, `rows_duplicate: int`, `pairs_count: int`, `directions_count: int`, `forms_count: int`, `pairs_incomplete: int`, `pairs_over_100: int`
  - `DirectionsParseError(Exception)` — поднимается, когда подходящего листа нет

- [ ] **Step 1: Написать падающие тесты**

Создать `backend/tests/test_directions_parser.py`:

```python
import pytest
from openpyxl import Workbook

from backend.services.parsers.directions_parser import (
    DirectionsParseError,
    SHEET_NAME,
    parse_directions,
)


def make_file(tmp_path, sheet_title, rows, header=True):
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_title
    if header:
        ws.append(["МНН", "ЛФ", "Направление", "Процент"])
    for r in rows:
        ws.append(list(r))
    path = tmp_path / "ref.xlsx"
    wb.save(path)
    return path


def test_parses_named_sheet(tmp_path):
    path = make_file(tmp_path, SHEET_NAME, [
        ("CLOBETASOL", "D-CRM", "Дерматология", 0.85),
        ("CLOBETASOL", "D-CRM", "Педиатрия", 0.15),
    ])
    rows, report = parse_directions(path)

    assert len(rows) == 2
    assert rows[0] == {
        "mnn": "CLOBETASOL", "lf": "D-CRM",
        "direction": "Дерматология", "share": 0.85,
    }
    assert report["sheet"] == SHEET_NAME
    assert report["rows_accepted"] == 2
    assert report["pairs_count"] == 1
    assert report["directions_count"] == 2
    assert report["forms_count"] == 1
    assert report["pairs_incomplete"] == 0


def test_finds_sheet_by_columns_when_name_differs(tmp_path):
    path = make_file(tmp_path, "Данные", [
        ("CLOBETASOL", "D-CRM", "Дерматология", 1.0),
    ])
    rows, report = parse_directions(path)

    assert len(rows) == 1
    assert report["sheet"] == "Данные"


def test_raises_when_no_suitable_sheet(tmp_path):
    wb = Workbook()
    ws = wb.active
    ws.title = "Прочее"
    ws.append(["Колонка", "Другая"])
    ws.append(["значение", 1])
    path = tmp_path / "bad.xlsx"
    wb.save(path)

    with pytest.raises(DirectionsParseError) as exc:
        parse_directions(path)

    assert "Длинный формат" in str(exc.value)


def test_percent_above_one_is_divided_by_hundred(tmp_path):
    path = make_file(tmp_path, SHEET_NAME, [
        ("A", "TC-TAB", "Терапия", 35),
        ("A", "TC-TAB", "Педиатрия", 65),
    ])
    rows, report = parse_directions(path)

    assert [r["share"] for r in rows] == [0.35, 0.65]
    assert report["pairs_incomplete"] == 0


def test_skips_non_positive_and_empty_rows(tmp_path):
    path = make_file(tmp_path, SHEET_NAME, [
        ("A", "TC-TAB", "Терапия", 1.0),
        ("A", "TC-TAB", "Педиатрия", 0),
        ("A", "TC-TAB", "ЛОР", None),
        (None, None, None, None),
        ("", "TC-TAB", "Терапия", 0.5),
        ("B", "TC-TAB", "", 0.5),
    ])
    rows, report = parse_directions(path)

    assert len(rows) == 1
    assert report["rows_skipped"] == 4


def test_normalises_case_and_whitespace(tmp_path):
    path = make_file(tmp_path, SHEET_NAME, [
        (" clobetasol ", " d-crm ", "  Дерматология  ", 1.0),
    ])
    rows, _ = parse_directions(path)

    assert rows[0]["mnn"] == "CLOBETASOL"
    assert rows[0]["lf"] == "D-CRM"
    assert rows[0]["direction"] == "Дерматология"


def test_duplicate_triple_keeps_last(tmp_path):
    path = make_file(tmp_path, SHEET_NAME, [
        ("A", "TC-TAB", "Терапия", 0.4),
        ("A", "TC-TAB", "Терапия", 0.9),
    ])
    rows, report = parse_directions(path)

    assert len(rows) == 1
    assert rows[0]["share"] == 0.9
    assert report["rows_accepted"] == 1


def test_counts_pairs_with_incomplete_shares(tmp_path):
    path = make_file(tmp_path, SHEET_NAME, [
        ("A", "TC-TAB", "Терапия", 0.5),
        ("A", "TC-TAB", "Педиатрия", 0.4),
        ("B", "TC-TAB", "Терапия", 1.0),
    ])
    _, report = parse_directions(path)

    assert report["pairs_incomplete"] == 1


def test_share_above_hundred_is_clamped_out(tmp_path):
    path = make_file(tmp_path, SHEET_NAME, [
        ("A", "TC-TAB", "Терапия", 150),
    ])
    rows, report = parse_directions(path)

    assert rows == []
    assert report["rows_skipped"] == 1


def test_pair_whose_shares_exceed_hundred_is_dropped(tmp_path):
    path = make_file(tmp_path, SHEET_NAME, [
        ("A", "TC-TAB", "Терапия", 0.7),
        ("A", "TC-TAB", "Педиатрия", 0.6),
        ("B", "TC-TAB", "Терапия", 1.0),
    ])
    rows, report = parse_directions(path)

    assert [r["mnn"] for r in rows] == ["B"]
    assert report["pairs_over_100"] == 1
    assert report["pairs_count"] == 1
    assert report["rows_accepted"] == 1
```

Пара `A / TC-TAB` даёт в сумме 130% и отбрасывается целиком: при сумме долей
выше 100% ветки недобора нет, и инвариант сходимости сломался бы в сторону
раздувания рынка. USD такой пары честно уходит в «Не распределено».

- [ ] **Step 2: Запустить тесты и убедиться, что падают**

```bash
cd "C:/Users/B Fazliddin/Desktop/Pharmadash" && ./.venv/Scripts/python.exe -m pytest backend/tests/test_directions_parser.py -v
```

Ожидается: FAIL с `ModuleNotFoundError: No module named 'backend.services.parsers.directions_parser'`.

- [ ] **Step 3: Реализовать парсер**

Создать `backend/services/parsers/directions_parser.py`:

```python
import logging
from pathlib import Path

from openpyxl import load_workbook

log = logging.getLogger(__name__)

SHEET_NAME = "Длинный формат"

_REQUIRED_HEADERS = ("МНН", "ЛФ", "НАПРАВЛЕНИЕ", "ПРОЦЕНТ")


class DirectionsParseError(Exception):
    pass


def _headers(ws) -> list[str]:
    for row in ws.iter_rows(min_row=1, max_row=1, values_only=True):
        return [
            str(v).strip().upper() if v is not None else "" for v in row
        ]
    return []


def _pick_sheet(wb) -> str:
    if SHEET_NAME in wb.sheetnames:
        return SHEET_NAME
    for name in wb.sheetnames:
        head = _headers(wb[name])
        if all(h in head for h in _REQUIRED_HEADERS):
            return name
    raise DirectionsParseError(
        f"В файле нет листа «{SHEET_NAME}» и ни один лист не содержит "
        f"колонки МНН, ЛФ, Направление, Процент. "
        f"Найденные листы: {', '.join(wb.sheetnames)}"
    )


def _share(value) -> float | None:
    if value is None:
        return None
    try:
        share = float(value)
    except (TypeError, ValueError):
        return None
    if share > 1:
        share /= 100
    if share <= 0 or share > 1:
        return None
    return share


def parse_directions(file_path: Path) -> tuple[list[dict], dict]:
    wb = load_workbook(file_path, read_only=True, data_only=True)
    try:
        sheet = _pick_sheet(wb)
        ws = wb[sheet]

        accepted: dict[tuple[str, str, str], dict] = {}
        rows_read = 0
        rows_skipped = 0

        for idx, values in enumerate(ws.iter_rows(values_only=True)):
            if idx == 0:
                continue
            if not any(v is not None and str(v).strip() for v in values):
                continue
            rows_read += 1

            mnn = str(values[0] or "").strip().upper()
            lf = str(values[1] or "").strip().upper()
            direction = str(values[2] or "").strip()
            share = _share(values[3] if len(values) > 3 else None)

            if not mnn or not lf or not direction or share is None:
                rows_skipped += 1
                continue

            accepted[(mnn, lf, direction)] = {
                "mnn": mnn, "lf": lf,
                "direction": direction, "share": share,
            }
    finally:
        wb.close()

    rows = list(accepted.values())

    pair_shares: dict[tuple[str, str], float] = {}
    for r in rows:
        key = (r["mnn"], r["lf"])
        pair_shares[key] = pair_shares.get(key, 0.0) + r["share"]

    # Пара с суммой долей выше 100% ломает инвариант сходимости в сторону
    # раздувания рынка: недобора у неё нет, а переизбыток попал бы в итог
    # лишними деньгами. Отбрасываем целиком, её USD уйдёт в «Не распределено».
    over = {k for k, v in pair_shares.items() if v > 1.0 + 1e-6}
    if over:
        rows = [r for r in rows if (r["mnn"], r["lf"]) not in over]
        rows_skipped += sum(
            1 for r in accepted.values() if (r["mnn"], r["lf"]) in over
        )
        for k in over:
            pair_shares.pop(k, None)

    report = {
        "sheet": sheet,
        "rows_read": rows_read,
        "rows_accepted": len(rows),
        "rows_skipped": rows_skipped,
        "pairs_count": len(pair_shares),
        "directions_count": len({r["direction"] for r in rows}),
        "forms_count": len({r["lf"] for r in rows}),
        "pairs_incomplete": sum(
            1 for s in pair_shares.values() if abs(s - 1.0) > 1e-6
        ),
        "pairs_over_100": len(over),
    }
    log.info(
        "Справочник направлений разобран: лист «%s», принято %d строк, "
        "отброшено %d, пар %d",
        sheet, report["rows_accepted"], rows_skipped, report["pairs_count"],
    )
    if over:
        log.warning(
            "Отброшено %d пар с суммой долей выше 100%%", len(over),
        )
    return rows, report
```

- [ ] **Step 4: Запустить тесты и убедиться, что проходят**

```bash
cd "C:/Users/B Fazliddin/Desktop/Pharmadash" && ./.venv/Scripts/python.exe -m pytest backend/tests/test_directions_parser.py -v
```

Ожидается: 10 passed.

- [ ] **Step 5: Коммит**

```bash
git add backend/services/parsers/directions_parser.py backend/tests/test_directions_parser.py
git commit -m "Add directions reference xlsx parser with validation report"
```

---

## Task 5: Эндпоинты справочника

**Files:**
- Create: `backend/routers/directions.py`
- Create: `backend/tests/test_directions_api.py`
- Modify: `backend/main.py`
- Modify: `backend/schemas.py`
- Modify: `backend/config.py`

**Interfaces:**
- Consumes: `MnnDirection`, `DirectionImport` (задача 1); `invalidate_direction_map` (задача 2); `parse_directions`, `DirectionsParseError`, `SHEET_NAME` (задача 4)
- Produces: эндпоинты `POST /api/directions/upload`, `GET /api/directions/meta`, `GET /api/directions/rows`; схемы `DirectionUploadResponse`, `DirectionMetaResponse`, `DirectionRowsResponse`

- [ ] **Step 1: Написать падающие тесты**

Создать `backend/tests/test_directions_api.py`:

```python
import io

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from openpyxl import Workbook
from sqlalchemy import select

from backend.database import get_db
from backend.main import app
from backend.models import MnnDirection
from backend.services.directions import invalidate_direction_map
from backend.services.parsers.directions_parser import SHEET_NAME


def xlsx_bytes(sheet_title, rows):
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_title
    ws.append(["МНН", "ЛФ", "Направление", "Процент"])
    for r in rows:
        ws.append(list(r))
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@pytest_asyncio.fixture
async def client(db):
    app.dependency_overrides[get_db] = lambda: db
    invalidate_direction_map()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        yield c
    app.dependency_overrides.clear()
    invalidate_direction_map()


async def test_upload_replaces_reference_and_reports(client, db):
    body = xlsx_bytes(SHEET_NAME, [
        ("CLOBETASOL", "D-CRM", "Дерматология", 0.85),
        ("CLOBETASOL", "D-CRM", "Педиатрия", 0.15),
    ])
    r = await client.post(
        "/api/directions/upload",
        files={"file": ("ref.xlsx", body, "application/vnd.ms-excel")},
    )

    assert r.status_code == 200
    data = r.json()
    assert data["rows_accepted"] == 2
    assert data["pairs_count"] == 1
    assert data["directions_count"] == 2

    rows = (await db.execute(select(MnnDirection))).scalars().all()
    assert len(rows) == 2


async def test_upload_second_time_wipes_previous(client, db):
    first = xlsx_bytes(SHEET_NAME, [("A", "TC-TAB", "Терапия", 1.0)])
    await client.post(
        "/api/directions/upload",
        files={"file": ("a.xlsx", first, "application/vnd.ms-excel")},
    )
    second = xlsx_bytes(SHEET_NAME, [("B", "D-CRM", "Дерматология", 1.0)])
    await client.post(
        "/api/directions/upload",
        files={"file": ("b.xlsx", second, "application/vnd.ms-excel")},
    )

    rows = (await db.execute(select(MnnDirection))).scalars().all()
    assert [r.mnn for r in rows] == ["B"]


async def test_upload_rejects_non_xlsx(client):
    r = await client.post(
        "/api/directions/upload",
        files={"file": ("ref.csv", b"a,b,c", "text/csv")},
    )

    assert r.status_code == 400
    assert ".xlsx" in r.json()["detail"]


async def test_upload_rejects_file_without_suitable_sheet(client, db):
    wb = Workbook()
    wb.active.title = "Прочее"
    wb.active.append(["Колонка"])
    buf = io.BytesIO()
    wb.save(buf)

    r = await client.post(
        "/api/directions/upload",
        files={"file": ("bad.xlsx", buf.getvalue(),
                        "application/vnd.ms-excel")},
    )

    assert r.status_code == 400
    assert "Длинный формат" in r.json()["detail"]
    assert (await db.execute(select(MnnDirection))).scalars().all() == []


async def test_meta_returns_filters_and_counts(client):
    body = xlsx_bytes(SHEET_NAME, [
        ("A", "TC-TAB", "Терапия", 0.6),
        ("A", "TC-TAB", "Педиатрия", 0.4),
        ("B", "D-CRM", "Дерматология", 1.0),
    ])
    await client.post(
        "/api/directions/upload",
        files={"file": ("ref.xlsx", body, "application/vnd.ms-excel")},
    )

    data = (await client.get("/api/directions/meta")).json()

    assert data["rows_count"] == 3
    assert data["directions"] == ["Дерматология", "Педиатрия", "Терапия"]
    assert data["forms"] == ["D-CRM", "TC-TAB"]
    assert data["filename"] == "ref.xlsx"
    assert data["uploaded_at"] is not None


async def test_meta_on_empty_reference(client):
    data = (await client.get("/api/directions/meta")).json()

    assert data["rows_count"] == 0
    assert data["directions"] == []
    assert data["filename"] is None


async def test_rows_paginates_and_filters(client):
    body = xlsx_bytes(SHEET_NAME, [
        ("ASPIRIN", "TC-TAB", "Терапия", 0.6),
        ("ASPIRIN", "TC-TAB", "Кардиология", 0.4),
        ("CLOBETASOL", "D-CRM", "Дерматология", 1.0),
    ])
    await client.post(
        "/api/directions/upload",
        files={"file": ("ref.xlsx", body, "application/vnd.ms-excel")},
    )

    page = (await client.get(
        "/api/directions/rows", params={"page": 1, "per_page": 2},
    )).json()
    assert page["total"] == 3
    assert len(page["items"]) == 2

    by_q = (await client.get(
        "/api/directions/rows", params={"q": "clobe"},
    )).json()
    assert by_q["total"] == 1
    assert by_q["items"][0]["mnn"] == "CLOBETASOL"

    by_dir = (await client.get(
        "/api/directions/rows", params={"direction": "Кардиология"},
    )).json()
    assert by_dir["total"] == 1

    by_lf = (await client.get(
        "/api/directions/rows", params={"lf": "D-CRM"},
    )).json()
    assert by_lf["total"] == 1
```

- [ ] **Step 2: Запустить тесты и убедиться, что падают**

```bash
cd "C:/Users/B Fazliddin/Desktop/Pharmadash" && ./.venv/Scripts/python.exe -m pytest backend/tests/test_directions_api.py -v
```

Ожидается: FAIL — эндпоинтов нет, ответ 404.

- [ ] **Step 3: Добавить путь для файла справочника**

В `backend/config.py` после строки `UPLOAD_DIR = DATA_DIR / "uploads"` дописать:

```python
DIRECTIONS_FILE = UPLOAD_DIR / "directions_ref.xlsx"
```

- [ ] **Step 4: Добавить схемы**

В конец `backend/schemas.py` дописать:

```python
class DirectionUploadResponse(BaseModel):
    sheet: str
    rows_read: int
    rows_accepted: int
    rows_skipped: int
    rows_duplicate: int
    pairs_count: int
    directions_count: int
    forms_count: int
    pairs_incomplete: int
    pairs_over_100: int


class DirectionMetaResponse(BaseModel):
    filename: str | None
    uploaded_at: str | None
    rows_count: int
    pairs_count: int
    directions: list[str]
    forms: list[str]
    report: dict | None


class DirectionRowItem(BaseModel):
    mnn: str
    lf: str
    direction: str
    share: float


class DirectionRowsResponse(BaseModel):
    items: list[DirectionRowItem]
    total: int
    page: int
    per_page: int
```

- [ ] **Step 5: Реализовать роутер**

Создать `backend/routers/directions.py`:

```python
import asyncio
import json
import logging
import shutil

from fastapi import (
    APIRouter, Depends, File, HTTPException, Query, UploadFile,
)
from sqlalchemy import delete, func, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import DIRECTIONS_FILE, UPLOAD_DIR
from backend.database import get_db
from backend.models import DirectionImport, MnnDirection
from backend.routers.dashboard import invalidate_dashboard_cache
from backend.routers.overview import invalidate_overview_cache
from backend.schemas import (
    DirectionMetaResponse,
    DirectionRowsResponse,
    DirectionUploadResponse,
)
from backend.services.directions import invalidate_direction_map
from backend.services.parsers.directions_parser import (
    DirectionsParseError, parse_directions,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/directions", tags=["directions"])

INSERT_BATCH = 5000


@router.post("/upload", response_model=DirectionUploadResponse)
async def upload_directions(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename or not file.filename.endswith(".xlsx"):
        raise HTTPException(400, "Допустим только формат .xlsx")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with open(DIRECTIONS_FILE, "wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        rows, report = await asyncio.to_thread(
            parse_directions, DIRECTIONS_FILE,
        )
    except DirectionsParseError as e:
        raise HTTPException(400, str(e))

    if not rows:
        raise HTTPException(
            400,
            "В файле не найдено ни одной корректной строки. "
            "Проверьте колонки МНН, ЛФ, Направление, Процент.",
        )

    await db.execute(delete(MnnDirection))
    for start in range(0, len(rows), INSERT_BATCH):
        await db.execute(insert(MnnDirection), rows[start:start + INSERT_BATCH])

    db.add(DirectionImport(
        filename=file.filename,
        rows_count=report["rows_accepted"],
        pairs_count=report["pairs_count"],
        directions_count=report["directions_count"],
        report_json=json.dumps(report, ensure_ascii=False),
    ))
    await db.commit()

    invalidate_direction_map()
    invalidate_overview_cache()
    invalidate_dashboard_cache()
    log.info(
        "Справочник направлений обновлён из «%s»: %d строк",
        file.filename, report["rows_accepted"],
    )
    return DirectionUploadResponse(**report)


@router.get("/meta", response_model=DirectionMetaResponse)
async def directions_meta(db: AsyncSession = Depends(get_db)):
    last = (
        await db.execute(
            select(DirectionImport)
            .order_by(DirectionImport.uploaded_at.desc())
            .limit(1)
        )
    ).scalars().first()

    rows_count = (
        await db.execute(select(func.count()).select_from(MnnDirection))
    ).scalar_one()
    pairs_count = (
        await db.execute(
            select(func.count()).select_from(
                select(MnnDirection.mnn, MnnDirection.lf)
                .distinct()
                .subquery()
            )
        )
    ).scalar_one()
    directions = [
        r[0] for r in (
            await db.execute(
                select(MnnDirection.direction)
                .distinct()
                .order_by(MnnDirection.direction)
            )
        ).all()
    ]
    forms = [
        r[0] for r in (
            await db.execute(
                select(MnnDirection.lf).distinct().order_by(MnnDirection.lf)
            )
        ).all()
    ]

    return DirectionMetaResponse(
        filename=last.filename if last else None,
        uploaded_at=(
            last.uploaded_at.isoformat() if last and last.uploaded_at else None
        ),
        rows_count=rows_count,
        pairs_count=pairs_count,
        directions=directions,
        forms=forms,
        report=json.loads(last.report_json) if last and last.report_json else None,
    )


@router.get("/rows", response_model=DirectionRowsResponse)
async def directions_rows(
    q: str | None = Query(None),
    direction: str | None = Query(None),
    lf: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(30, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    filters = []
    if q and q.strip():
        filters.append(MnnDirection.mnn.ilike(f"%{q.strip().upper()}%"))
    if direction:
        filters.append(MnnDirection.direction == direction)
    if lf:
        filters.append(MnnDirection.lf == lf.strip().upper())

    total = (
        await db.execute(
            select(func.count()).select_from(MnnDirection).where(*filters)
        )
    ).scalar_one()

    rows = (
        await db.execute(
            select(MnnDirection)
            .where(*filters)
            .order_by(
                MnnDirection.mnn, MnnDirection.lf,
                MnnDirection.share.desc(),
            )
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
    ).scalars().all()

    return DirectionRowsResponse(
        items=[
            {
                "mnn": r.mnn, "lf": r.lf,
                "direction": r.direction, "share": r.share,
            }
            for r in rows
        ],
        total=total,
        page=page,
        per_page=per_page,
    )
```

- [ ] **Step 6: Подключить роутер**

В `backend/main.py` заменить блок импорта и подключения роутеров:

```python
from backend.routers import (  # noqa: E402
    markets, dashboard, overview, drilldown, pharmacies, scoring, directions,
)

app.include_router(markets.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(overview.router, prefix="/api")
app.include_router(drilldown.router, prefix="/api")
app.include_router(pharmacies.router, prefix="/api")
app.include_router(scoring.router, prefix="/api")
app.include_router(directions.router, prefix="/api")
```

- [ ] **Step 7: Запустить тесты и убедиться, что проходят**

```bash
cd "C:/Users/B Fazliddin/Desktop/Pharmadash" && ./.venv/Scripts/python.exe -m pytest backend/tests -v
```

Ожидается: 50 passed.

- [ ] **Step 8: Коммит**

```bash
git add backend/routers/directions.py backend/tests/test_directions_api.py backend/main.py backend/schemas.py backend/config.py
git commit -m "Add directions reference upload, meta and rows endpoints"
```

---

## Task 6: Удаление старого направления из скоринга

**Files:**
- Modify: `backend/services/scoring_settings.py`
- Modify: `backend/services/scoring.py:143-147`
- Modify: `backend/services/scoring_query.py:21,61`
- Modify: `backend/routers/overview.py:325`
- Create: `backend/tests/test_scoring_direction_removed.py`

**Interfaces:**
- Consumes: ничего
- Produces: `ScoringSettings` без поля `directions`; элементы скоринга без ключа `direction`

Обоснование удаления и доказательства безопасности — в спеке, раздел «Удаление старого направления».

- [ ] **Step 1: Написать падающий тест**

Создать `backend/tests/test_scoring_direction_removed.py`:

```python
import json

import pytest

from backend.services.scoring_settings import (
    ScoringSettings, dump_settings, load_settings,
)


def test_settings_have_no_directions_field():
    assert "directions" not in ScoringSettings.model_fields


def test_dump_omits_directions():
    assert "directions" not in json.loads(dump_settings(ScoringSettings()))


def test_stored_json_with_directions_still_loads():
    legacy = json.dumps({
        "directions": {"default": "Терапия", "map": {"КАРДИО": "Кардиология"}},
        "neutral_score": 0.5,
    })
    settings = load_settings(legacy)

    assert settings.neutral_score == 0.5
    assert not hasattr(settings, "directions")


def test_direction_dictionary_class_is_gone():
    import backend.services.scoring_settings as module

    assert not hasattr(module, "DirectionDictionary")
    assert not hasattr(module, "_default_directions")


def test_scoring_query_sorts_without_direction():
    from backend.services.scoring_query import _SORT_KEYS

    assert "direction" not in _SORT_KEYS
```

- [ ] **Step 2: Запустить тест и убедиться, что падает**

```bash
cd "C:/Users/B Fazliddin/Desktop/Pharmadash" && ./.venv/Scripts/python.exe -m pytest backend/tests/test_scoring_direction_removed.py -v
```

Ожидается: FAIL — `directions` пока есть в `model_fields`.

- [ ] **Step 3: Удалить из `scoring_settings.py`**

Удалить класс целиком:

```python
class DirectionDictionary(BaseModel):
    default: str = Field(min_length=1)
    map: dict[str, str]
```

Удалить функцию `_default_directions()` целиком — от строки `def _default_directions() -> DirectionDictionary:` до закрывающей `)` включительно.

Удалить из класса `ScoringSettings` поле:

```python
    directions: DirectionDictionary = Field(
        default_factory=_default_directions,
    )
```

- [ ] **Step 4: Удалить из `scoring.py`**

В `backend/services/scoring.py` в словаре `metrics[(mnn, lf)]` удалить четыре строки:

```python
            "direction": (
                settings.directions.map.get(cls, settings.directions.default)
                if cls else settings.directions.default
            ),
```

- [ ] **Step 5: Удалить из `scoring_query.py`**

В словаре `_SORT_KEYS` удалить строку:

```python
    "direction": lambda i: i["direction"],
```

В условии поиска было:

```python
        if needle and not (
            needle in i["mnn"].upper()
            or needle in i["lf"].upper()
            or needle in (i["cls"] or "").upper()
            or needle in i["direction"].upper()
        ):
```

Стало:

```python
        if needle and not (
            needle in i["mnn"].upper()
            or needle in i["lf"].upper()
            or needle in (i["cls"] or "").upper()
        ):
```

- [ ] **Step 6: Удалить из `overview.py`**

В `backend/routers/overview.py` в `_build_decision`, в словаре элемента `top`, удалить строку:

```python
                "direction": i["direction"],
```

- [ ] **Step 7: Запустить все тесты**

```bash
cd "C:/Users/B Fazliddin/Desktop/Pharmadash" && ./.venv/Scripts/python.exe -m pytest backend/tests -v
```

Ожидается: 55 passed.

- [ ] **Step 8: Проверить, что в бекенде не осталось ссылок**

```bash
cd "C:/Users/B Fazliddin/Desktop/Pharmadash" && grep -rn "direction" backend/ --include=*.py | grep -v "tests/" | grep -v "services/directions.py" | grep -v "routers/directions.py" | grep -v "directions_parser"
```

Ожидается: пустой вывод.

- [ ] **Step 9: Поднять сервер и убедиться, что скоринг отвечает**

```bash
cd "C:/Users/B Fazliddin/Desktop/Pharmadash" && ./.venv/Scripts/python.exe -m uvicorn backend.main:app --port 8010 &
sleep 6
curl -s "http://127.0.0.1:8010/api/markets/1/scoring?per_page=3" | head -c 600
```

Ожидается: JSON с элементами скоринга, без ключа `direction`, без 500. Остановить сервер после проверки.

- [ ] **Step 10: Коммит**

```bash
git add backend/services/scoring_settings.py backend/services/scoring.py backend/services/scoring_query.py backend/routers/overview.py backend/tests/test_scoring_direction_removed.py
git commit -m "Remove class-derived direction from scoring"
```

---

## Task 7: Врезки направлений в обзор, дашборд и панель

**Files:**
- Modify: `backend/routers/overview.py`
- Modify: `backend/routers/dashboard.py`
- Modify: `backend/routers/drilldown.py`
- Modify: `backend/schemas.py`
- Create: `backend/tests/test_directions_integration.py`

**Interfaces:**
- Consumes: `load_direction_map`, `build_overview_directions`, `build_mnn_directions`, `build_direction_detail` (задачи 2 и 3)
- Produces: ключ `directions` в `portfolio` ответа обзора; ключ `directions` в ответе дашборда; эндпоинт `GET /api/markets/{market_id}/direction/{direction_name}`

- [ ] **Step 1: Написать падающие тесты**

Создать `backend/tests/test_directions_integration.py`:

```python
import io
import json

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from openpyxl import Workbook

from backend.database import get_db
from backend.main import app
from backend.models import BdpRaw, Market, MnnDirection
from backend.routers.dashboard import invalidate_dashboard_cache
from backend.routers.overview import invalidate_overview_cache
from backend.services.directions import invalidate_direction_map
from backend.services.parsers.directions_parser import SHEET_NAME


def bdp(mnn, lf, usd3, usd2=0.0, usd1=0.0, atc="ДЕРМ"):
    return BdpRaw(
        market_id=1, mnn=mnn, tm=f"TM {mnn}", producer="Завод",
        sector="RET", region="Москва", atc=atc, lf=lf, lf_avp=lf,
        strength="0.05 %", country_mfr="РОССИЯ", bg_g="G",
        usd_y1=usd1, usd_y2=usd2, usd_y3=usd3,
        un_y1=1.0, un_y2=1.0, un_y3=1.0,
    )


@pytest_asyncio.fixture
async def seeded(db):
    db.add(Market(
        id=1, name="Тест", years_json=json.dumps([2023, 2024, 2025]),
        regions_json=json.dumps(["Москва"]), language="ru",
    ))
    db.add_all([
        bdp("CLOBETASOL", "D-CRM", 100.0, 80.0, 60.0),
        bdp("CLOBETASOL", "D-OINT", 50.0, 50.0, 50.0),
        bdp("NUSINERSEN", "I-VIAL", 200.0, 100.0, 50.0),
    ])
    db.add_all([
        MnnDirection(mnn="CLOBETASOL", lf="D-CRM",
                     direction="Дерматология", share=0.85),
        MnnDirection(mnn="CLOBETASOL", lf="D-CRM",
                     direction="Педиатрия", share=0.15),
        MnnDirection(mnn="CLOBETASOL", lf="D-OINT",
                     direction="Ортопедия/Травматология", share=1.0),
    ])
    await db.commit()
    return db


@pytest_asyncio.fixture
async def client(seeded):
    app.dependency_overrides[get_db] = lambda: seeded
    invalidate_direction_map()
    invalidate_overview_cache()
    invalidate_dashboard_cache()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        yield c
    app.dependency_overrides.clear()
    invalidate_direction_map()
    invalidate_overview_cache()
    invalidate_dashboard_cache()


async def test_overview_carries_directions_that_reconcile(client):
    data = (await client.get("/api/markets/1/overview")).json()
    rows = data["portfolio"]["directions"]

    assert rows, "карточка направлений пуста"
    assert sum(r["usd"] for r in rows) == pytest.approx(
        data["volume"]["usd_y3"],
    )
    assert rows[-1]["kind"] == "unallocated"
    assert rows[-1]["usd"] == pytest.approx(200.0)


async def test_overview_without_reference_is_all_unallocated(client, seeded):
    from sqlalchemy import delete

    await seeded.execute(delete(MnnDirection))
    await seeded.commit()
    invalidate_direction_map()
    invalidate_overview_cache()

    data = (await client.get("/api/markets/1/overview")).json()
    rows = data["portfolio"]["directions"]

    assert [r["kind"] for r in rows] == ["unallocated"]
    assert rows[0]["share"] == pytest.approx(1.0)


async def test_dashboard_splits_directions_by_form(client):
    data = (await client.get("/api/markets/1/dashboard/CLOBETASOL")).json()
    block = data["directions"]

    assert block["total"]["usd"] == pytest.approx(150.0)
    forms = {f["form"]: f for f in block["forms"]}
    assert forms["D-CRM"]["in_reference"] is True
    assert forms["D-CRM"]["rows"][0]["name"] == "Дерматология"


async def test_dashboard_with_form_filter_keeps_only_that_form(client):
    data = (await client.get(
        "/api/markets/1/dashboard/CLOBETASOL", params={"lf": "D-OINT"},
    )).json()

    assert [f["form"] for f in data["directions"]["forms"]] == ["D-OINT"]


async def test_dashboard_marks_pair_missing_from_reference(client):
    data = (await client.get("/api/markets/1/dashboard/NUSINERSEN")).json()
    forms = data["directions"]["forms"]

    assert forms[0]["in_reference"] is False
    assert forms[0]["rows"] == []


async def test_direction_panel_returns_pairs(client):
    data = (await client.get(
        "/api/markets/1/direction/Дерматология",
    )).json()

    assert data["name"] == "Дерматология"
    assert data["kpi"]["usd_y3"] == pytest.approx(85.0)
    assert data["pairs"][0]["mnn"] == "CLOBETASOL"
    assert data["pairs"][0]["lf"] == "D-CRM"


async def test_direction_panel_handles_slash_in_name(client):
    r = await client.get(
        "/api/markets/1/direction/"
        "%D0%9E%D1%80%D1%82%D0%BE%D0%BF%D0%B5%D0%B4%D0%B8%D1%8F"
        "%2F%D0%A2%D1%80%D0%B0%D0%B2%D0%BC%D0%B0%D1%82%D0%BE%D0%BB%D0%BE"
        "%D0%B3%D0%B8%D1%8F"
    )

    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "Ортопедия/Травматология"
    assert data["kpi"]["usd_y3"] == pytest.approx(50.0)


async def test_direction_panel_unknown_name_is_404(client):
    r = await client.get("/api/markets/1/direction/Космонавтика")

    assert r.status_code == 404
    assert "не найден" in r.json()["detail"].lower()
```

- [ ] **Step 2: Запустить тесты и убедиться, что падают**

```bash
cd "C:/Users/B Fazliddin/Desktop/Pharmadash" && ./.venv/Scripts/python.exe -m pytest backend/tests/test_directions_integration.py -v
```

Ожидается: FAIL — ключа `directions` нет, эндпоинт панели отдаёт 404 на все имена.

- [ ] **Step 3: Добавить схему элемента карточки**

В конец `backend/schemas.py` дописать:

```python
class DirectionOverviewItem(BaseModel):
    name: str
    usd: float
    share: float | None
    shares_by_year: list[float | None]
    growth: float | None
    kind: str
```

В классе `OverviewPortfolio` добавить поле:

```python
    directions: list[dict] = []
```

- [ ] **Step 4: Врезать в обзор**

В `backend/routers/overview.py` в блок импортов добавить:

```python
from backend.services.directions import (
    build_overview_directions, load_direction_map,
)
```

В функции `_compute_overview`, сразу после строки `portfolio = _build_portfolio(bdp_items, home)`, дописать:

```python
    dmap = await load_direction_map(db)
    portfolio["directions"] = build_overview_directions(bdp_items, dmap)
```

- [ ] **Step 5: Врезать в дашборд МНН**

В `backend/routers/dashboard.py` в блок импортов добавить:

```python
from backend.services.directions import (
    build_mnn_directions, load_direction_map,
)
```

В функции `dashboard`, сразу после строки `zone3 = {` … закрывающей `}` (то есть после формирования `zone3`), дописать:

```python
    dmap = await load_direction_map(db)
    directions = build_mnn_directions(items, dmap)
```

В словарь `payload` добавить ключ после `"zone3": zone3,`:

```python
        "directions": directions,
```

Выборка `items` уже учитывает фильтры формы и дозы: когда форма не выбрана, в ней все формы МНН, и `build_mnn_directions` разложит их по блокам. Когда выбрана — останется одна.

- [ ] **Step 6: Добавить эндпоинт панели**

В `backend/routers/drilldown.py` в блок импортов добавить:

```python
from backend.services.directions import (
    build_direction_detail, load_direction_map,
)
```

В конец файла дописать:

```python
@router.get("/{market_id}/direction/{direction_name:path}")
async def direction_market_scope(
    market_id: int,
    direction_name: str,
    db: AsyncSession = Depends(get_db),
):
    market = await db.get(Market, market_id)
    if not market:
        raise HTTPException(404, "Рынок не найден")

    name = direction_name.strip()
    dmap = await load_direction_map(db)
    known = {d for pairs in dmap.values() for d, _ in pairs}
    if name not in known:
        raise HTTPException(
            404, f"Направление «{name}» не найдено в справочнике",
        )

    items = (
        await db.execute(
            select(*BDP_COLS).where(BdpRaw.market_id == market_id)
        )
    ).all()
    total = await _market_total_usd_y3(db, market_id)

    detail = build_direction_detail(items, dmap, name, total)
    detail["years_labels"] = _years_labels(market)
    return detail
```

Параметр объявлен как `{direction_name:path}`, чтобы слэш внутри названия
(`Ортопедия/Травматология`) не разрезал маршрут.

- [ ] **Step 7: Запустить тесты и убедиться, что проходят**

```bash
cd "C:/Users/B Fazliddin/Desktop/Pharmadash" && ./.venv/Scripts/python.exe -m pytest backend/tests -v
```

Ожидается: 63 passed.

- [ ] **Step 8: Проверить на реальных данных**

```bash
cd "C:/Users/B Fazliddin/Desktop/Pharmadash" && ./.venv/Scripts/python.exe -m uvicorn backend.main:app --port 8010 &
sleep 6
curl -s -F "file=@C:/Users/B Fazliddin/Dropbox/Data Analytics_2025/Шаблоны/Направления/Направления_01.xlsx" http://127.0.0.1:8010/api/directions/upload
curl -s "http://127.0.0.1:8010/api/markets/1/overview" | ./.venv/Scripts/python.exe -c "
import json, sys
d = json.load(sys.stdin)
rows = d['portfolio']['directions']
total = d['volume']['usd_y3']
print(f'рынок:        {total/1e6:,.1f} млн')
print(f'сумма строк:  {sum(r[\"usd\"] for r in rows)/1e6:,.1f} млн')
for r in rows[:5]:
    print(f'  {r[\"name\"]:26} {r[\"usd\"]/1e6:10,.1f}  {r[\"share\"]*100:5.1f}%')
print(f'  {rows[-1][\"name\"]:26} {rows[-1][\"usd\"]/1e6:10,.1f}')
"
```

Ожидается: заливка возвращает `rows_accepted: 72262`, `pairs_count: 20414`,
`directions_count: 35`. Сумма строк совпадает с суммой рынка. Топ начинается с
Кардиологии около 2 185 млн $, последняя строка «Не распределено» около
1 203 млн $. Остановить сервер.

- [ ] **Step 9: Коммит**

```bash
git add backend/routers/overview.py backend/routers/dashboard.py backend/routers/drilldown.py backend/schemas.py backend/tests/test_directions_integration.py
git commit -m "Expose directions in overview, MNN dashboard and drilldown panel"
```

---

## Task 8: Типы и клиент API на фронтенде

> **Исполняется вместе с задачей 9, одним коммитом.** Удаление поля
> `direction` из типов ломает сборку в четырёх файлах, а починка стоит в
> задаче 9 — отдельный коммит задачи 8 оставил бы в истории ветки заведомо
> нерабочую сборку. Шаг 3 ниже поэтому не ожидает зелёной сборки: он
> перечисляет ожидаемые ошибки, которые закрывает задача 9.

**Files:**
- Modify: `frontend/src/types/api.ts`
- Modify: `frontend/src/api/client.ts`

**Interfaces:**
- Consumes: эндпоинты задач 5 и 7
- Produces: типы `DirectionOverviewRow`, `DirectionRowsResponse`, `DirectionMeta`, `DirectionDetails`, `MnnDirectionsBlock`; функции `getDirectionsMeta`, `getDirectionRows`, `uploadDirectionsFile`, `getDirectionDetails`

- [ ] **Step 1: Добавить типы**

В конец `frontend/src/types/api.ts` дописать:

```typescript
export type DirectionRowKind = "direction" | "other" | "unallocated";

export interface DirectionOverviewRow {
  name: string;
  usd: number;
  share: number | null;
  shares_by_year: (number | null)[];
  growth: number | null;
  kind: DirectionRowKind;
}

export interface DirectionShareRow {
  name: string;
  share: number;
  usd: number;
}

export interface MnnDirectionsForm {
  form: string;
  usd: number;
  in_reference: boolean;
  rows: DirectionShareRow[];
}

export interface MnnDirectionsBlock {
  total: { usd: number; rows: DirectionShareRow[] };
  forms: MnnDirectionsForm[];
}

export interface DirectionKpi {
  usd_y1: number;
  usd_y2: number;
  usd_y3: number;
  usd_growth: number | null;
  share_of_market: number;
  pairs_count: number;
  mnns_count: number;
}

export interface DirectionPair {
  mnn: string;
  lf: string;
  usd_y3: number;
  share_in_pair: number;
  growth: number | null;
}

export interface DirectionForm {
  form: string;
  usd_y3: number;
  share_in_direction: number;
}

export interface DirectionDetails {
  name: string;
  kpi: DirectionKpi;
  pairs: DirectionPair[];
  forms: DirectionForm[];
  years_labels: string[];
}

export interface DirectionMeta {
  filename: string | null;
  uploaded_at: string | null;
  rows_count: number;
  pairs_count: number;
  directions: string[];
  forms: string[];
  report: DirectionUploadReport | null;
}

export interface DirectionUploadReport {
  sheet: string;
  rows_read: number;
  rows_accepted: number;
  rows_skipped: number;
  rows_duplicate: number;
  pairs_count: number;
  directions_count: number;
  forms_count: number;
  pairs_incomplete: number;
  pairs_over_100: number;
}

export interface DirectionRefRow {
  mnn: string;
  lf: string;
  direction: string;
  share: number;
}

export interface DirectionRowsResponse {
  items: DirectionRefRow[];
  total: number;
  page: number;
  per_page: number;
}

export interface DirectionRowsQuery {
  q?: string | null;
  direction?: string | null;
  lf?: string | null;
  page?: number;
  per_page?: number;
}
```

В интерфейсе `OverviewPortfolio` добавить поле:

```typescript
  directions: DirectionOverviewRow[];
```

В интерфейсе `DashboardResponse` добавить поле после `zone3`:

```typescript
  directions: MnnDirectionsBlock;
```

Удалить поле `direction: string;` из интерфейсов на строках 171 и 403 (элементы скоринга и решения) и поле `directions: { default: string; map: Record<string, string> };` на строке 273 (`ScoringSettings`).

- [ ] **Step 2: Добавить функции клиента**

В блок импортов типов в `frontend/src/api/client.ts` добавить:

```typescript
  DirectionDetails,
  DirectionMeta,
  DirectionRowsQuery,
  DirectionRowsResponse,
  DirectionUploadReport,
```

В конец `frontend/src/api/client.ts` дописать:

```typescript
export async function getDirectionsMeta(): Promise<DirectionMeta> {
  const { data } = await api.get<DirectionMeta>("/directions/meta");
  return data;
}

export async function getDirectionRows(
  query: DirectionRowsQuery = {},
  signal?: AbortSignal,
): Promise<DirectionRowsResponse> {
  const params: Record<string, string | number> = {};
  Object.entries(query).forEach(([k, v]) => {
    if (v != null && v !== "") params[k] = v as string | number;
  });
  const { data } = await api.get<DirectionRowsResponse>("/directions/rows", {
    params, signal,
  });
  return data;
}

export async function uploadDirectionsFile(
  file: File,
): Promise<DirectionUploadReport> {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post<DirectionUploadReport>(
    "/directions/upload", fd,
  );
  return data;
}

export async function getDirectionDetails(
  marketId: number,
  name: string,
): Promise<DirectionDetails> {
  const { data } = await api.get<DirectionDetails>(
    `/markets/${marketId}/direction/${encodeURIComponent(name)}`,
  );
  return data;
}
```

- [ ] **Step 3: Собрать и убедиться, что типы сходятся**

```bash
cd "C:/Users/B Fazliddin/Desktop/Pharmadash/frontend" && npm run build
```

Ожидается: ошибки TypeScript ровно в тех четырёх местах, где удалённое поле
`direction` ещё используется — `ScoringTable.tsx`, `MnnHero.tsx`,
`OverviewCards.tsx`, `MarketScoringPage.tsx`. Они закрываются в задаче 9.
Если ошибок больше, исправить расхождение типов здесь.

- [ ] **Step 4: Коммита здесь нет**

Переходи к задаче 9 в том же диспатче. Коммит один, в конце задачи 9.

---

## Task 9: Удаление старого направления из интерфейса

> **Исполняется вместе с задачей 8, одним коммитом.** См. пометку у задачи 8.
> Коммит делается один раз, в конце задачи 9, и включает файлы обеих задач.

**Files:**
- Modify: `frontend/src/components/scoring/ScoringTable.tsx:36`
- Modify: `frontend/src/components/dashboard/MnnHero.tsx:81`
- Modify: `frontend/src/components/overview/OverviewCards.tsx:120`
- Modify: `frontend/src/pages/MarketScoringPage.tsx:34,301`

**Interfaces:**
- Consumes: типы без `direction` из задачи 8
- Produces: сборка фронтенда без ошибок

- [ ] **Step 1: Убрать колонку из таблицы скоринга**

В `frontend/src/components/scoring/ScoringTable.tsx` удалить строку 36:

```typescript
      { key: "direction", label: "Направление", cell: (i) => text(i.direction) },
```

- [ ] **Step 2: Убрать из заголовка дашборда МНН**

В `frontend/src/components/dashboard/MnnHero.tsx` на строке 81 убрать вывод направления. Было:

```tsx
            {item ? `${item.direction} · ` : ""}
```

Удалить это выражение целиком. Проверить соседние строки: если после удаления остаётся висящий разделитель `·` или пустой `<span>`, убрать и его.

- [ ] **Step 3: Убрать из карточки обзора**

В `frontend/src/components/overview/OverviewCards.tsx` на строке 120 было:

```tsx
                  {item.lf} · {item.direction}
```

Заменить на:

```tsx
                  {item.lf}
```

- [ ] **Step 4: Убрать со страницы скоринга**

В `frontend/src/pages/MarketScoringPage.tsx` на строке 34 убрать `"direction"` из набора:

```typescript
const TEXT_SORT = new Set(["mnn", "cls", "rank"]);
```

На строке 301 удалить вывод `{item.direction}`. Проверить окружающую разметку: если элемент, который его содержал, становится пустым, удалить и элемент.

- [ ] **Step 5: Собрать и прогнать линтер**

```bash
cd "C:/Users/B Fazliddin/Desktop/Pharmadash/frontend" && npm run build && npm run lint
```

Ожидается: сборка без ошибок, линтер без ошибок.

- [ ] **Step 6: Проверить, что ссылок не осталось**

```bash
cd "C:/Users/B Fazliddin/Desktop/Pharmadash/frontend" && grep -rn "\.direction\b\|\"direction\"\|directions:" src/ | grep -v "Direction" | grep -v "getDirection"
```

Ожидается: пустой вывод.

- [ ] **Step 7: Коммит**

```bash
git add frontend/src/types/api.ts frontend/src/api/client.ts frontend/src/components/scoring/ScoringTable.tsx frontend/src/components/dashboard/MnnHero.tsx frontend/src/components/overview/OverviewCards.tsx frontend/src/pages/MarketScoringPage.tsx
git commit -m "Add directions types and drop class-derived direction from the UI"
```

---

## Task 10: Страница справочника и блок заливки

**Files:**
- Create: `frontend/src/pages/DirectionsRefPage.tsx`
- Create: `frontend/src/components/admin/DirectionsUploadBlock.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Modify: `frontend/src/pages/AdminPage.tsx`

**Interfaces:**
- Consumes: `getDirectionsMeta`, `getDirectionRows`, `uploadDirectionsFile` (задача 8)
- Produces: маршрут `/directions`, пункт меню «Справочник направлений»

- [ ] **Step 1: Создать страницу справочника**

Создать `frontend/src/pages/DirectionsRefPage.tsx`:

```tsx
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getDirectionRows, getDirectionsMeta } from "../api/client";
import type { DirectionRowsResponse } from "../types/api";
import { useDebounce } from "../hooks/useDebounce";
import { useFetch } from "../hooks/useFetch";
import { fmtInt, fmtShare } from "../lib/format";
import { Page } from "../components/layout/Layout";
import { PageHeader } from "../components/ui/Card";
import { Pagination } from "../components/ui/Pagination";
import { Select } from "../components/ui/Select";
import { EmptyCard, ErrorNote, Loading } from "../components/ui/states";

export default function DirectionsRefPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [draft, setDraft] = useState(searchParams.get("q") ?? "");
  const q = useDebounce(draft, 300);

  const direction = searchParams.get("direction") ?? "";
  const lf = searchParams.get("lf") ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const perPage = parseInt(searchParams.get("per_page") ?? "30", 10) || 30;

  const patch = useCallback(
    (next: Record<string, string>) => {
      const out: Record<string, string> = {};
      const base = { direction, lf, page: String(page), per_page: String(perPage) };
      Object.entries({ ...base, ...next }).forEach(([k, v]) => {
        if (v && v !== "1" ) out[k] = v;
        else if (v && k !== "page") out[k] = v;
      });
      setSearchParams(out, { replace: true });
    },
    [direction, lf, page, perPage, setSearchParams],
  );

  const meta = useFetch(
    () => getDirectionsMeta(),
    [],
    "Не удалось загрузить сведения о справочнике",
  );

  const rows = useFetch<DirectionRowsResponse>(
    (signal) => getDirectionRows(
      { q, direction: direction || null, lf: lf || null, page, per_page: perPage },
      signal,
    ),
    [q, direction, lf, page, perPage],
    "Не удалось загрузить справочник",
  );

  const subtitle = useMemo(() => {
    const m = meta.data;
    if (!m || m.rows_count === 0) return "Справочник не загружен";
    const when = m.uploaded_at
      ? new Date(m.uploaded_at).toLocaleDateString("ru-RU")
      : "—";
    return `Загружен ${when} · ${fmtInt(m.rows_count)} строк · `
      + `${fmtInt(m.pairs_count)} пар МНН×ЛФ · ${m.directions.length} направлений`;
  }, [meta.data]);

  if (meta.data && meta.data.rows_count === 0) {
    return (
      <Page>
        <PageHeader title="Справочник направлений" subtitle={subtitle} />
        <EmptyCard
          title="Справочник пуст"
          description="Загрузите файл в разделе «Загрузка данных»"
        />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader title="Справочник направлений" subtitle={subtitle}>
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            patch({ page: "1" });
          }}
          placeholder="Поиск по МНН…"
          aria-label="Поиск по МНН"
          className="h-9 w-64 rounded-ctl border border-seg bg-white px-3 text-sm text-fg outline-none focus:border-line-strong"
        />
        <Select
          value={direction}
          allLabel="Все направления"
          align="right"
          width={260}
          onChange={(v) => patch({ direction: v, page: "1" })}
          options={(meta.data?.directions ?? []).map((d) => ({
            value: d, label: d,
          }))}
        />
        <Select
          value={lf}
          allLabel="Все ЛФ"
          align="right"
          onChange={(v) => patch({ lf: v, page: "1" })}
          options={(meta.data?.forms ?? []).map((f) => ({
            value: f, label: f,
          }))}
        />
      </PageHeader>

      {rows.error && <ErrorNote>{rows.error}</ErrorNote>}
      {!rows.data && rows.loading && <Loading className="h-64" />}

      {rows.data && (
        <div
          className="flex flex-col rounded-card bg-surface transition-opacity duration-200"
          style={rows.loading ? { opacity: 0.55 } : undefined}
        >
          <div className="grid grid-cols-[minmax(0,2fr)_110px_minmax(0,1fr)_80px] gap-3 px-4 pb-2 pt-4 text-[11px] text-faint">
            <span>МНН</span>
            <span>ЛФ</span>
            <span>Направление</span>
            <span className="text-right">Доля</span>
          </div>
          {rows.data.items.map((r) => (
            <div
              key={`${r.mnn}|${r.lf}|${r.direction}`}
              className="grid grid-cols-[minmax(0,2fr)_110px_minmax(0,1fr)_80px] items-center gap-3 border-t border-[#f3f3f0] px-4 py-2 text-sm"
            >
              <span className="truncate" title={r.mnn}>{r.mnn}</span>
              <span className="text-[13px] text-muted-2">{r.lf}</span>
              <span className="truncate" title={r.direction}>
                {r.direction}
              </span>
              <span className="text-right font-medium">
                {fmtShare(r.share)}
              </span>
            </div>
          ))}
          {rows.data.items.length === 0 && (
            <span className="px-4 py-6 text-sm text-faint">
              Ничего не найдено
            </span>
          )}
          <Pagination
            page={rows.data.page}
            pageSize={rows.data.per_page}
            total={rows.data.total}
            sizes={[30, 50, 100]}
            onPage={(p) => patch({ page: String(p) })}
            onPageSize={(s) => patch({ per_page: String(s), page: "1" })}
          />
        </div>
      )}
    </Page>
  );
}
```

- [ ] **Step 2: Добавить маршрут**

В `frontend/src/App.tsx` добавить импорт:

```tsx
import DirectionsRefPage from "./pages/DirectionsRefPage";
```

И маршрут внутри `<Route element={<Layout />}>`, сразу после маршрута `/admin`:

```tsx
          <Route path="/directions" element={<DirectionsRefPage />} />
```

- [ ] **Step 3: Добавить пункт меню**

В `frontend/src/components/layout/Sidebar.tsx` в нижний блок `<nav>` с подписью «Общие разделы», после ссылки на `/admin`, добавить:

```tsx
        <NavLink to="/directions" className={navClass}>
          Справочник направлений
        </NavLink>
```

- [ ] **Step 4: Создать блок заливки отдельным компонентом**

Создать `frontend/src/components/admin/DirectionsUploadBlock.tsx`. Отдельный
файл, а не экспорт из `AdminPage.tsx`: страница уже 839 строк, а экспорт
второго компонента из файла страницы в этом проекте уже ловил ошибку линтера
`react-refresh/only-export-components`.

```tsx
import { useEffect, useState } from "react";
import { Upload } from "lucide-react";
import { getDirectionsMeta, uploadDirectionsFile } from "../../api/client";
import type { DirectionUploadReport } from "../../types/api";
import { apiErrorText } from "../../lib/apiError";
import { fmtInt } from "../../lib/format";
import { Card, CardTitle } from "../ui/Card";
import { ErrorNote } from "../ui/states";

export function DirectionsUploadBlock() {
  const [report, setReport] = useState<DirectionUploadReport | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<string>("");

  useEffect(() => {
    getDirectionsMeta()
      .then((m) => setMeta(
        m.rows_count === 0
          ? "Справочник не загружен"
          : `Загружен ${
              m.uploaded_at
                ? new Date(m.uploaded_at).toLocaleDateString("ru-RU")
                : "—"
            } · ${fmtInt(m.rows_count)} строк · ${m.directions.length} направлений`,
      ))
      .catch(() => setMeta(""));
  }, [report]);

  async function pick(file: File) {
    setBusy(true);
    setError("");
    try {
      setReport(await uploadDirectionsFile(file));
    } catch (e) {
      setError(apiErrorText(e, "Не удалось загрузить справочник"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <CardTitle note={meta}>Справочник направлений</CardTitle>
      <span className="text-[13px] text-muted-2">
        Файл .xlsx с листом «Длинный формат»: колонки МНН, ЛФ, Направление,
        Процент. Новая заливка полностью заменяет прежний справочник —
        он общий для всех рынков.
      </span>
      <label className="tr-soft flex h-10 w-fit cursor-pointer items-center gap-2 rounded-ctl bg-ink px-4 text-sm font-medium text-white hover:bg-ink-hover">
        <Upload size={15} />
        {busy ? "Загрузка…" : "Выбрать файл"}
        <input
          type="file"
          accept=".xlsx"
          disabled={busy}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pick(f);
            e.target.value = "";
          }}
        />
      </label>

      {error && <ErrorNote>{error}</ErrorNote>}

      {report && (
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 rounded-ctl bg-canvas px-4 py-3 text-[13px]">
          <Stat label="Строк принято" value={fmtInt(report.rows_accepted)} />
          <Stat label="Направлений" value={fmtInt(report.directions_count)} />
          <Stat label="Пар МНН×ЛФ" value={fmtInt(report.pairs_count)} />
          <Stat label="Форм" value={fmtInt(report.forms_count)} />
          <Stat label="Отброшено строк" value={fmtInt(report.rows_skipped)} />
          <Stat label="Дубликатов" value={fmtInt(report.rows_duplicate)} />
          <Stat
            label="Пар с суммой ≠ 100%"
            value={fmtInt(report.pairs_incomplete)}
            warn={report.pairs_incomplete > 0}
          />
          <Stat
            label="Пар выше 100% (отброшено)"
            value={fmtInt(report.pairs_over_100)}
            warn={report.pairs_over_100 > 0}
          />
        </div>
      )}
    </Card>
  );
}

function Stat({
  label, value, warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <span className="flex items-baseline justify-between gap-3">
      <span className="text-faint">{label}</span>
      <b className={warn ? "font-semibold text-[#b4541f]" : "font-semibold"}>
        {value}
        {warn ? " ⚠" : ""}
      </b>
    </span>
  );
}
```

- [ ] **Step 5: Подключить блок к AdminPage**

В `frontend/src/pages/AdminPage.tsx` добавить импорт:

```tsx
import { DirectionsUploadBlock } from "../components/admin/DirectionsUploadBlock";
```

Отрендерить `<DirectionsUploadBlock />` в разметке страницы под существующим
пятишаговым визардом, вне его шагов. Больше в `AdminPage.tsx` ничего менять не
нужно.

- [ ] **Step 6: Собрать, прогнать линтер и посмотреть глазами**

```bash
cd "C:/Users/B Fazliddin/Desktop/Pharmadash/frontend" && npm run build && npm run lint
```

Затем поднять бекенд и фронтенд, открыть `/admin`, залить
`Направления_01.xlsx`, проверить отчёт: 72 262 строки, 20 414 пар,
35 направлений, 0 отброшено, 54 пары с суммой ≠ 100%. Открыть `/directions`,
проверить поиск по `CLOBETASOL`, фильтр по направлению и пагинацию.

- [ ] **Step 7: Коммит**

```bash
git add frontend/src/pages/DirectionsRefPage.tsx frontend/src/components/admin/DirectionsUploadBlock.tsx frontend/src/App.tsx frontend/src/components/layout/Sidebar.tsx frontend/src/pages/AdminPage.tsx
git commit -m "Add directions reference page and upload block"
```

---

## Task 11: Карточка направлений и боковая панель в обзоре

**Files:**
- Create: `frontend/src/components/overview/DirectionsCard.tsx`
- Create: `frontend/src/components/panels/DirectionPanel.tsx`
- Modify: `frontend/src/pages/MarketOverviewPage.tsx`

**Interfaces:**
- Consumes: `DirectionOverviewRow`, `DirectionDetails` (задача 8); `portfolio.directions` из ответа обзора (задача 7)
- Produces: `DirectionsCard`, `DirectionPanel`

- [ ] **Step 1: Создать карточку**

Создать `frontend/src/components/overview/DirectionsCard.tsx`:

```tsx
import { useState } from "react";
import clsx from "clsx";
import type { DirectionOverviewRow } from "../../types/api";
import { fmtGrowth, fmtUsd } from "../../lib/format";
import { growthTone } from "../../lib/palette";
import { HeatCell } from "../ui/bars";
import { Card, CardTitle } from "../ui/Card";

const GRID = "grid grid-cols-[minmax(0,1fr)_92px_repeat(3,56px)_64px] gap-2.5";

export function DirectionsCard({
  rows, yearLabels, selected, onPick, index,
}: {
  rows: DirectionOverviewRow[];
  yearLabels: string[];
  selected: string | null;
  onPick: (name: string) => void;
  index: number;
}) {
  const [all, setAll] = useState(false);
  const tail = rows.filter((r) => r.kind !== "direction");
  const main = rows.filter((r) => r.kind === "direction");
  const shown = all ? main : main.slice(0, 15);
  const hidden = main.length - shown.length;

  return (
    <Card index={index} className="flex flex-1 flex-col gap-1.5">
      <CardTitle
        note="оценка по долям назначений · клик — детальный анализ"
        className="pb-2"
      >
        Направления
      </CardTitle>

      {rows.length === 0 ? (
        <span className="text-sm text-faint">
          Справочник направлений не загружен
        </span>
      ) : (
        <>
          <div className={clsx(GRID, "-mx-1.5 px-1.5 text-[11px] text-faint")}>
            <span>Направление</span>
            <span className="text-right">USD</span>
            {yearLabels.map((y, i) => (
              <span key={i} className="text-center">{y}</span>
            ))}
            <span className="text-right">г/г</span>
          </div>

          {[...shown, ...tail].map((r) => {
            const clickable = r.kind === "direction";
            const body = (
              <>
                <span className="truncate" title={r.name}>{r.name}</span>
                <span className="text-right text-[13px] font-medium">
                  {fmtUsd(r.usd)}
                </span>
                {r.shares_by_year.map((s, i) => (
                  <HeatCell key={i} share={s} max={12} />
                ))}
                <span
                  className="whitespace-nowrap text-right text-[13px] font-semibold"
                  style={{ color: growthTone(r.growth) }}
                >
                  {fmtGrowth(r.growth)}
                </span>
              </>
            );
            const base = clsx(
              GRID,
              "-mx-1.5 items-center rounded-row px-1.5 py-0.5 text-left text-sm",
              r.kind === "direction" ? "text-fg" : "text-muted-2 italic",
            );
            return clickable ? (
              <button
                key={r.name}
                type="button"
                onClick={() => onPick(r.name)}
                className={clsx(
                  base, "tr-soft border-0 hover:bg-[#f4f5fa]",
                  selected === r.name ? "bg-accent-tint" : "bg-transparent",
                )}
              >
                {body}
              </button>
            ) : (
              <div key={r.name} className={base}>{body}</div>
            );
          })}

          {(hidden > 0 || all) && (
            <button
              type="button"
              onClick={() => setAll((v) => !v)}
              className="mt-1.5 w-fit border-0 bg-transparent px-1.5 py-1 text-[13px] font-medium text-accent hover:text-accent-hover"
            >
              {all ? "Свернуть" : `Показать все ${main.length}`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Создать боковую панель**

Создать `frontend/src/components/panels/DirectionPanel.tsx`:

```tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { getDirectionDetails } from "../../api/client";
import type { DirectionDetails } from "../../types/api";
import { useFetch } from "../../hooks/useFetch";
import { fmtGrowth, fmtInt, fmtShare, fmtUsd } from "../../lib/format";
import { growthTone } from "../../lib/palette";
import { ProgressBar, YearBars } from "../ui/bars";
import {
  KpiGrid, PanelSection, SidePanel, UnderlineTabs,
} from "../ui/SidePanel";
import { ErrorNote, Loading } from "../ui/states";

const THIN_BAR = "oklch(0.72 0.09 262)";

type Tab = "pairs" | "forms";

export function DirectionPanel({
  marketId, direction, onClose,
}: {
  marketId: number;
  direction: string;
  onClose: () => void;
}) {
  const { data, error, loading } = useFetch<DirectionDetails>(
    () => getDirectionDetails(marketId, direction),
    [marketId, direction],
    "Не удалось загрузить данные направления",
  );

  return (
    <SidePanel
      onClose={onClose}
      eyebrow="Направление · весь рынок · оценка по долям назначений"
      title={data?.name ?? direction}
      gap={32}
    >
      {error && <ErrorNote>{error}</ErrorNote>}
      {!data && loading && <Loading className="h-40" />}
      {data && <Body data={data} marketId={marketId} />}
    </SidePanel>
  );
}

function Body({
  data, marketId,
}: {
  data: DirectionDetails;
  marketId: number;
}) {
  const [tab, setTab] = useState<Tab>("pairs");
  const { kpi } = data;
  const years = data.years_labels;
  const lastYear = years[years.length - 1] ?? "";
  const maxPair = Math.max(...data.pairs.map((p) => p.usd_y3), 1e-9);

  return (
    <>
      <KpiGrid
        items={[
          { label: `USD ${lastYear}`, value: fmtUsd(kpi.usd_y3) },
          { label: "Доля рынка", value: fmtShare(kpi.share_of_market) },
          { label: "Пар МНН×ЛФ", value: fmtInt(kpi.pairs_count) },
          { label: "МНН", value: fmtInt(kpi.mnns_count) },
          {
            label: "Рост USD",
            value: fmtGrowth(kpi.usd_growth),
            color: growthTone(kpi.usd_growth),
          },
        ]}
      />

      <PanelSection title="Оценка USD по годам">
        <YearBars
          items={[kpi.usd_y1, kpi.usd_y2, kpi.usd_y3].map((v, i) => ({
            label: years[i] ?? "—",
            value: v,
            text: fmtUsd(v),
            selected: i === 2,
          }))}
        />
      </PanelSection>

      <div className="flex flex-col gap-1.5">
        <UnderlineTabs
          tabs={[
            { value: "pairs" as Tab, label: "Молекулы" },
            { value: "forms" as Tab, label: "Формы" },
          ]}
          value={tab}
          onChange={setTab}
          className="mb-1.5 border-b border-[#ecece8]"
        />

        {tab === "pairs" && (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_84px_60px_56px_16px] gap-2.5 py-1 text-[11px] text-faint">
              <span>МНН × ЛФ</span>
              <span className="text-right">USD</span>
              <span className="text-right">Доля напр.</span>
              <span className="text-right">г/г</span>
              <span />
            </div>
            {data.pairs.map((p) => (
              <Link
                key={`${p.mnn}|${p.lf}`}
                to={
                  `/market/${marketId}/dashboard`
                  + `?mnn=${encodeURIComponent(p.mnn)}`
                  + `&lf=${encodeURIComponent(p.lf)}`
                }
                className="tr-soft grid grid-cols-[minmax(0,1fr)_84px_60px_56px_16px] items-center gap-2.5 border-t border-[#f3f3f0] py-2 text-sm text-fg hover:bg-[#f7f7f4] hover:text-fg"
              >
                <span className="flex min-w-0 flex-col gap-[5px]">
                  <span className="truncate" title={`${p.mnn} · ${p.lf}`}>
                    {p.mnn} <span className="text-muted-2">· {p.lf}</span>
                  </span>
                  <ProgressBar
                    value={p.usd_y3 / maxPair}
                    color={THIN_BAR}
                    height={3}
                  />
                </span>
                <span className="text-right font-medium">
                  {fmtUsd(p.usd_y3)}
                </span>
                <span className="text-right text-[13px]">
                  {fmtShare(p.share_in_pair)}
                </span>
                <span
                  className="text-right text-[13px] font-medium"
                  style={{ color: growthTone(p.growth) }}
                >
                  {fmtGrowth(p.growth)}
                </span>
                <span className="text-[#b5b8be]">→</span>
              </Link>
            ))}
          </>
        )}

        {tab === "forms" && (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_84px_60px] gap-2.5 py-1 text-[11px] text-faint">
              <span>Форма</span>
              <span className="text-right">USD</span>
              <span className="text-right">В направлении</span>
            </div>
            {data.forms.map((f) => (
              <div
                key={f.form}
                className="grid grid-cols-[minmax(0,1fr)_84px_60px] items-center gap-2.5 border-t border-[#f3f3f0] py-2 text-sm"
              >
                <span className="flex min-w-0 flex-col gap-[5px]">
                  <span className="truncate">{f.form}</span>
                  <ProgressBar
                    value={f.share_in_direction}
                    color={THIN_BAR}
                    height={3}
                  />
                </span>
                <span className="text-right font-medium">
                  {fmtUsd(f.usd_y3)}
                </span>
                <span className="text-right text-[13px] text-muted-2">
                  {fmtShare(f.share_in_direction)}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Подключить к странице обзора**

В `frontend/src/pages/MarketOverviewPage.tsx` добавить импорты:

```tsx
import { DirectionsCard } from "../components/overview/DirectionsCard";
import { DirectionPanel } from "../components/panels/DirectionPanel";
```

Расширить тип `Panel`:

```tsx
type Panel =
  | { kind: "country"; name: string }
  | { kind: "producer"; name: string; isHome: boolean }
  | { kind: "direction"; name: string }
  | null;
```

Добавить новую секцию после секции с `TopMnnCard` и `AtcCard`:

```tsx
        <section className="flex flex-wrap gap-6">
          <DirectionsCard
            rows={portfolio.directions}
            yearLabels={volume.years_labels}
            selected={panel?.kind === "direction" ? panel.name : null}
            onPick={(name) => setPanel({ kind: "direction", name })}
            index={5}
          />
        </section>
```

Увеличить `index` у `CountriesCard` до 6 и у `ProducersCard` до 7, чтобы
анимация появления шла по порядку.

Добавить рендер панели рядом с остальными:

```tsx
      {panel?.kind === "direction" && (
        <DirectionPanel
          key={panel.name}
          marketId={id}
          direction={panel.name}
          onClose={() => setPanel(null)}
        />
      )}
```

- [ ] **Step 4: Собрать, прогнать линтер и посмотреть глазами**

```bash
cd "C:/Users/B Fazliddin/Desktop/Pharmadash/frontend" && npm run build && npm run lint
```

Открыть `/market/1/overview`. Проверить: карточка «Направления» на месте,
первая строка — Кардиология около $2,19 млрд, последняя — «Не распределено»
около $1,20 млрд курсивом и без клика. Кнопка «Показать все 35»
разворачивает список. Клик по Кардиологии открывает панель, в ней вкладки
«Молекулы» и «Формы», клик по молекуле уводит в дашборд с подставленными
МНН и формой. Отдельно проверить клик по направлению со слэшем —
«Ортопедия/Травматология»: панель должна открыться, а не отдать 404.

- [ ] **Step 5: Коммит**

```bash
git add frontend/src/components/overview/DirectionsCard.tsx frontend/src/components/panels/DirectionPanel.tsx frontend/src/pages/MarketOverviewPage.tsx
git commit -m "Add directions card and side panel to market overview"
```

---

## Task 12: Вкладка «Направления» в дашборде МНН

**Files:**
- Create: `frontend/src/components/dashboard/DirectionsTab.tsx`
- Modify: `frontend/src/pages/MarketDashboardPage.tsx`

**Interfaces:**
- Consumes: `MnnDirectionsBlock` (задача 8); ключ `directions` ответа дашборда (задача 7)
- Produces: `DirectionsTab`

- [ ] **Step 1: Создать вкладку**

Создать `frontend/src/components/dashboard/DirectionsTab.tsx`:

```tsx
import type { DashboardResponse, DirectionShareRow } from "../../types/api";
import { fmtShare, fmtUsd } from "../../lib/format";
import { ProgressBar } from "../ui/bars";
import { Card, CardTitle } from "../ui/Card";

const BAR = "oklch(0.52 0.16 268)";

export function DirectionsTab({
  data, t,
}: {
  data: DashboardResponse;
  t: number;
}) {
  const block = data.directions;
  const single = data.applied_filter.lf;
  const forms = block.forms;

  return (
    <Card className="flex flex-col gap-6">
      <CardTitle note="оценка по долям назначений">Кто выписывает</CardTitle>
      <span className="-mt-4 text-[13px] text-faint">
        Доза влияет на сумму, не на состав направлений
      </span>

      {!single && forms.length > 1 && block.total.rows.length > 0 && (
        <Section
          title={`${data.mnn} · все формы`}
          usd={block.total.usd}
          rows={block.total.rows}
          t={t}
          accent
        />
      )}

      {forms.map((f) => (
        <Section
          key={f.form}
          title={f.form}
          usd={f.usd}
          rows={f.rows}
          empty={!f.in_reference}
          t={t}
        />
      ))}

      {forms.length === 0 && (
        <span className="text-sm text-faint">
          Для выбранного фильтра нет данных
        </span>
      )}
    </Card>
  );
}

function Section({
  title, usd, rows, t, empty, accent,
}: {
  title: string;
  usd: number;
  rows: DirectionShareRow[];
  t: number;
  empty?: boolean;
  accent?: boolean;
}) {
  const max = Math.max(...rows.map((r) => r.share), 1e-9);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[#ecece8] pb-2">
        <span
          className={accent ? "text-[15px] font-semibold" : "text-sm font-semibold"}
        >
          {title}
        </span>
        <span className="text-[13px] text-muted-2">{fmtUsd(usd)}</span>
      </div>

      {empty ? (
        <span className="text-[13px] text-faint">
          ⌀ Нет в справочнике направлений
        </span>
      ) : (
        rows.map((r) => (
          <div
            key={r.name}
            className="grid grid-cols-[minmax(0,180px)_52px_minmax(0,1fr)_92px] items-center gap-3 py-0.5 text-sm"
          >
            <span className="truncate" title={r.name}>{r.name}</span>
            <span className="text-right text-[13px] font-medium">
              {fmtShare(r.share)}
            </span>
            <ProgressBar
              value={(r.share / max) * t}
              color={BAR}
              height={8}
            />
            <span className="text-right text-[13px] font-medium">
              {fmtUsd(r.usd)}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 2: Подключить вкладку**

В `frontend/src/pages/MarketDashboardPage.tsx` добавить импорт:

```tsx
import { DirectionsTab } from "../components/dashboard/DirectionsTab";
```

Расширить тип и список вкладок:

```tsx
type Tab = "summary" | "competitors" | "structure" | "geo" | "directions" | "scoring";

const TABS: { value: Tab; label: string }[] = [
  { value: "summary", label: "Сводка" },
  { value: "competitors", label: "Конкуренты" },
  { value: "structure", label: "Структура" },
  { value: "geo", label: "География" },
  { value: "directions", label: "Направления" },
  { value: "scoring", label: "Скоринг" },
];
```

В `TabContent` добавить ветку перед `case "scoring"`:

```tsx
    case "directions":
      return <DirectionsTab data={data} t={t} />;
```

- [ ] **Step 3: Собрать, прогнать линтер и посмотреть глазами**

```bash
cd "C:/Users/B Fazliddin/Desktop/Pharmadash/frontend" && npm run build && npm run lint
```

Открыть `/market/1/dashboard?mnn=CLOBETASOL&tab=directions`. Проверить:

- без фильтра формы — сверху сводный блок «все формы», ниже блок на каждую форму;
- выбрать форму в фильтре — остаётся один блок, сводный исчезает;
- выбрать дозу — суммы USD уменьшаются, набор и доли направлений не меняются;
- найти МНН, которого нет в справочнике (например `NUSINERSEN`) — показывается «⌀ Нет в справочнике направлений», без красного и без ошибок в консоли.

- [ ] **Step 4: Коммит**

```bash
git add frontend/src/components/dashboard/DirectionsTab.tsx frontend/src/pages/MarketDashboardPage.tsx
git commit -m "Add directions tab to MNN dashboard"
```

---

## Task 13: Сквозная проверка и сверка с контрольными цифрами

**Files:**
- Modify: `docs/superpowers/specs/2026-10-14-mnn-directions-design.md` (только если цифры разошлись)

**Interfaces:**
- Consumes: всё предыдущее
- Produces: подтверждение, что реализация сходится со спекой

- [ ] **Step 1: Прогнать весь бекенд-тестовый набор**

```bash
cd "C:/Users/B Fazliddin/Desktop/Pharmadash" && ./.venv/Scripts/python.exe -m pytest backend/tests -v
```

Ожидается: 0 failed. Число пройденных тестов — около 63, точное значение зависит от того, сколько тестов добавили круги правок; значение имеет только ноль упавших.

- [ ] **Step 2: Собрать фронтенд и прогнать линтер**

```bash
cd "C:/Users/B Fazliddin/Desktop/Pharmadash/frontend" && npm run build && npm run lint
```

Ожидается: обе команды без ошибок.

- [ ] **Step 3: Сверить цифры с таблицей «Результат на рынке 1» из спеки**

```bash
cd "C:/Users/B Fazliddin/Desktop/Pharmadash" && ./.venv/Scripts/python.exe -m uvicorn backend.main:app --port 8010 &
sleep 6
curl -s "http://127.0.0.1:8010/api/markets/1/overview" | ./.venv/Scripts/python.exe -c "
import json, sys
d = json.load(sys.stdin)
rows = d['portfolio']['directions']
total = d['volume']['usd_y3']
rest = next(r for r in rows if r['kind'] == 'unallocated')
alloc = sum(r['usd'] for r in rows if r['kind'] != 'unallocated')
print(f'рынок всего:      {total/1e6:12,.1f} млн \$  (ожидание 20 816,1)')
print(f'распределено:     {alloc/1e6:12,.1f} млн \$  (ожидание 19 613,3)')
print(f'не распределено:  {rest[\"usd\"]/1e6:12,.1f} млн \$  (ожидание 1 202,7)')
print(f'сходимость:       {(alloc+rest[\"usd\"])/total*100:.6f}%  (ожидание 100,000000)')
print()
for r in rows[:6]:
    print(f'  {r[\"name\"]:22} {r[\"usd\"]/1e6:10,.1f}  {r[\"share\"]*100:5.1f}%  {r[\"growth\"]*100:+6.1f}%')
"
```

Ожидается: сходимость 100,000000%; распределено около 19 613,3 млн $;
не распределено около 1 202,7 млн $; первая строка — Кардиология около
2 185,5 млн $ с ростом около +9,9%.

- [ ] **Step 4: Разобраться с расхождением, если оно есть**

Если цифры не совпали, причина почти наверняка в одном из трёх:
кеш обзора не сброшен после заливки (проверить вызов
`invalidate_overview_cache()` в роутере заливки); фильтры применены не в том
порядке (`build_overview_directions` должен считаться по `bdp_items`, то есть
после `_apply_filters`, а не по `raw_rows`); недобор долей не учтён в остатке
(проверить ветку `covered < 1.0 - 1e-9` в `attribute_usd`).

Если разошлось из-за того, что изменился сам справочник или БДП — обновить
таблицу «Результат на рынке 1» в спеке на фактические значения и описать в
коммите, почему.

- [ ] **Step 5: Проверить, что старого направления не осталось**

```bash
cd "C:/Users/B Fazliddin/Desktop/Pharmadash" && grep -rn "settings.directions\|DirectionDictionary\|_default_directions" backend/ frontend/src 2>/dev/null | grep -v node_modules
```

Ожидается: пустой вывод.

- [ ] **Step 6: Коммит, если спека правилась**

```bash
git add docs/superpowers/specs/2026-10-14-mnn-directions-design.md
git commit -m "Update spec control figures to match implementation"
```

Если спека не менялась, шаг пропустить.

---

## Self-Review

Проверка плана против спеки, выполнена при написании.

**1. Покрытие спеки.** Каждый раздел спеки имеет задачу: источник данных и покрытие — задача 4; модель данных — задача 1; метод атрибуции и сходимость — задача 2; результат на рынке 1 — задача 13; удаление старого направления — задачи 6 и 9; сервис `directions.py` — задачи 2 и 3; парсер — задача 4; роутер справочника — задача 5; изменения в существующих эндпоинтах — задача 7; карточка обзора — задача 11; боковая панель — задача 11; вкладка дашборда — задача 12; страница справочника — задача 10; заливка — задача 10; тестирование — вшито в задачи 1–7 и 13. Пробелов не найдено.

**2. Заглушки.** Поиск по «TBD», «TODO», «аналогично задаче», «добавить обработку ошибок» — не найдено. Каждый шаг с кодом содержит код.

**3. Согласованность типов.** `pair_key` / `item_key` / `attribute_usd` / `build_*` объявлены в задачах 2 и 3 и используются в задаче 7 с теми же именами и сигнатурами. Ключи словарей (`name`, `usd`, `share`, `shares_by_year`, `growth`, `kind`, `in_reference`, `share_in_pair`, `share_in_direction`) совпадают между бекендом (задачи 3, 7) и типами фронтенда (задача 8). `UNALLOCATED` и `OTHER` используются согласованно. Имя словаря сортировщиков в `scoring_query.py` — `_SORT_KEYS`, подтверждено чтением файла. Экспорты `Page`, `EmptyCard`, `useDebounce`, пропсы `Select` (`allLabel`, `width`, `align`) и токены темы `--radius-row`, `--radius-ctl`, `--color-accent-tint`, `--color-ink-hover` тоже проверены, поэтому шаги-разведки из задач 6, 10 и 11 убраны, а факты внесены в шаги напрямую.

**4. Review Focus.** Все пять пунктов имеют тест: пустой справочник — `test_overview_directions_on_empty_reference` и `test_overview_without_reference_is_all_unallocated`; нулевой USD — `test_zero_usd_pair_produces_no_phantom_money` и `test_overview_directions_on_zero_money_market`; проценты вместо долей — `test_percent_above_one_is_divided_by_hundred`; файл без листа — `test_raises_when_no_suitable_sheet` и `test_upload_rejects_file_without_suitable_sheet`; слэш в названии — `test_direction_panel_handles_slash_in_name`.
