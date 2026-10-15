import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "pharmdash.db"
UPLOAD_DIR = DATA_DIR / "uploads"
DIRECTIONS_FILE = UPLOAD_DIR / "directions_ref.xlsx"

DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH}"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MIN_COMPETITOR_USD = 10_000
COMPETITOR_PCT = 0.001

# Вход. Первый аккаунт создаётся при старте, если таблица users пуста.
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "").strip()
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
# Secure у cookie: включать за https; по http локальная разработка сломается.
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "").strip().lower() in (
    "1", "true", "yes", "on",
)
SESSION_COOKIE = "epi_session"
SESSION_DAYS = 30
