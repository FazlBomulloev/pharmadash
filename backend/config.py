import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "pharmdash.db"
UPLOAD_DIR = DATA_DIR / "uploads"

DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH}"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Порог активного конкурента: max(MIN_COMPETITOR_USD, COMPETITOR_PCT * total)
MIN_COMPETITOR_USD = 10_000
COMPETITOR_PCT = 0.001

SCORE_THRESHOLDS = {
    "economic": {
        "usd_last_year": [
            (100_000, 0),
            (500_000, 4),
            (2_000_000, 8),
            (10_000_000, 12),
            (float("inf"), 15),
        ],
        "usd_growth": [
            (-0.20, 0),
            (0.0, 3),
            (0.10, 6),
            (0.25, 8),
            (float("inf"), 10),
        ],
        "un_growth": [
            (-0.20, 0),
            (0.0, 3),
            (0.10, 6),
            (0.25, 8),
            (float("inf"), 10),
        ],
        "un_last_year": [
            (50_000, 0),
            (250_000, 2),
            (1_000_000, 4),
            (float("inf"), 5),
        ],
        "asp_quality": [
            (-0.10, 0),
            (0.0, 4),
            (0.01, 7),
            (float("inf"), 10),
        ],
    },
    "market_structure": {
        "active_competitors": {
            "3-15": 8,
            "16-30": 5,
            "1-2": 4,
            ">30": 2,
        },
        "top3_share": [
            (0.40, 7),
            (0.70, 4),
            (float("inf"), 1),
        ],
        "hhi": [
            (1500, 5),
            (2500, 3),
            (float("inf"), 1),
        ],
        "ret_hos_fit": {
            "match": 5,
            "mixed": 3,
            "mismatch": 1,
        },
        "form_strength_fit": {
            "large": 5,
            "medium": 3,
            "small": 1,
        },
    },
    "regulatory": {
        "znvlp": {"not_znvlp": 5, "znvlp_ok": 3, "znvlp_pressure": 1},
        "grls_registrations": {"active": 6, "few": 3, "none": 1},
        "grls_crowding": {"moderate": 4, "too_many": 2, "monopoly": 1},
        "access_risk": {"low": 5, "medium": 3, "high": 1},
    },
}

RECOMMENDATION_RANGES = [
    (75, 100, "Highly Attractive", "green"),
    (55, 74, "Attractive", "yellow"),
    (35, 54, "Conditionally Attractive", "orange"),
    (0, 34, "Unattractive", "red"),
]

CONCENTRATION_THRESHOLDS = {
    "top3_share": {"green": 0.40, "yellow": 0.70},
    "hhi": {"green": 1500, "yellow": 2500},
    "leader_share": {"green": 0.30, "yellow": 0.50},
    "active_competitors": {"green_min": 3, "green_max": 15},
}
