import os
from pathlib import Path

# Helper: Load .env file automatically without external dependencies
def _load_dotenv():
    env_paths = [
        Path.cwd() / ".env",
        Path(__file__).resolve().parent.parent / ".env",
        Path(__file__).resolve().parent / ".env"
    ]
    for p in env_paths:
        if p.exists() and p.is_file():
            try:
                with open(p, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#") or "=" not in line:
                            continue
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip("'\"")
                        if k not in os.environ:
                            os.environ[k] = v
                break
            except Exception:
                pass

_load_dotenv()

# Telegram Configuration
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "").strip()

# Amazon Now Session & Store Configuration
AMAZON_COOKIE = os.getenv("AMAZON_COOKIE", "").strip()
AMAZON_BRAND_ID = os.getenv("AMAZON_BRAND_ID", "").strip()

# Deal Filters & Runtime Settings
MIN_DISCOUNT = int(os.getenv("MIN_DISCOUNT", "70"))
MAX_WORKERS = int(os.getenv("MAX_WORKERS", "5"))
INTER_PAGE_DELAY = float(os.getenv("INTER_PAGE_DELAY", "0.8"))
CACHE_FILE = os.getenv("CACHE_FILE", os.path.join("data", "posted_deals.json"))
DRY_RUN = os.getenv("DRY_RUN", "false").lower() in ("true", "1", "yes")

# HTTP & API Headers
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"

DEFAULT_HEADERS = {
    "accept": "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    "user-agent": USER_AGENT,
    "origin": "https://www.amazon.in",
    "referer": "https://www.amazon.in/tez/browse/home"
}

# Optional browse node for Skin Care (set via env var or replace here once discovered)
SKIN_CARE_NODE_ID = os.getenv("SKIN_CARE_NODE_ID", "").strip()

# Target High-Yield Categories on Amazon Now
CATEGORIES = [
    # Personal Care (Frequently 50% - 70%+ deals)
    {"name": "Bath & Body", "nodeId": "204992653031", "endpoint": "category"},
    {"name": "Hair Care", "nodeId": "204992645031", "endpoint": "category"},
    {"name": "Oral Care", "nodeId": "205015906031", "endpoint": "category"},

    # Home Care & Cleaning
    {"name": "Cleaners & Repellents", "nodeId": "204952388031", "endpoint": "category"},
    {"name": "Detergent & Laundry", "nodeId": "204952381031", "endpoint": "category"},

    # Snacks & Beverages
    {"name": "Chips & Namkeen", "nodeId": "215540425031", "endpoint": "category"},
    {"name": "Beverages & Drinks", "nodeId": "204924538031", "endpoint": "category"},
    {"name": "Tea & Coffee", "nodeId": "204924535031", "endpoint": "category"},

    # Health & Baby Care
    {"name": "Baby Care", "nodeId": "211421666031", "endpoint": "category"},

    # Staples
    {"name": "Atta, Dal & Rice", "nodeId": "204870002031", "endpoint": "category"},
]

# Dynamically include Skin Care if node ID is configured
if SKIN_CARE_NODE_ID:
    CATEGORIES.insert(2, {"name": "Skin Care", "nodeId": SKIN_CARE_NODE_ID, "endpoint": "category"})
