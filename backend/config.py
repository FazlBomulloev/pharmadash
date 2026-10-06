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
