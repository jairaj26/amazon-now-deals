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
# Note: AMAZON_COOKIE contains the session and delivery location/pincode tokens.
# AMAZON_BRAND_ID is optional since /s?i=amazontez resolves the dark store from AMAZON_COOKIE.
AMAZON_COOKIE = os.getenv("AMAZON_COOKIE", "").strip()
AMAZON_BRAND_ID = os.getenv("AMAZON_BRAND_ID", "").strip()

# Deal Filters & Runtime Settings
MIN_DISCOUNT = int(os.getenv("MIN_DISCOUNT", "70"))
MAX_WORKERS = int(os.getenv("MAX_WORKERS", "5"))
INTER_PAGE_DELAY = float(os.getenv("INTER_PAGE_DELAY", "0.8"))
CACHE_FILE = os.getenv("CACHE_FILE", os.path.join("data", "posted_deals.json"))
DRY_RUN = os.getenv("DRY_RUN", "false").lower() in ("true", "1", "yes")
EXCLUDE_POOJA = os.getenv("EXCLUDE_POOJA", "true").lower() in ("true", "1", "yes")
MAX_ITEMS_PER_MESSAGE = int(os.getenv("MAX_ITEMS_PER_MESSAGE", "10"))

# Specialized Retail Store node for Amazon Now (Tez)
TEZ_SRS_NODE = "100147972031"

# Amazon India Global Search Discount Refinement Node Map (rnid: 2665398031)
DISCOUNT_NODE_MAP = {
    10: "2665399031",
    25: "2665400031",
    35: "2665402031",
    50: "2665401031",
    60: "27060456031",
    70: "27060457031"
}

# Maximum global search pages to fetch per run
MAX_GLOBAL_PAGES = int(os.getenv("MAX_GLOBAL_PAGES", "15"))

# HTTP & API Headers
# Modern Android Mobile User-Agent allows Amazon to return the mobile list view containing
# data-csa-c-price-to-pay and data-csa-c-strike-through-price attributes.
USER_AGENT = os.getenv(
    "USER_AGENT",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36"
)

DEFAULT_HEADERS = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "user-agent": USER_AGENT,
    "origin": "https://www.amazon.in",
    "referer": "https://www.amazon.in/tez/browse/home"
}

# Backward compatibility category list (if category-specific scan is invoked)
CATEGORIES = [
    {"name": "Bath & Body", "nodeId": "204992653031", "endpoint": "category"},
    {"name": "Hair Care", "nodeId": "204992645031", "endpoint": "category"},
    {"name": "Oral Care", "nodeId": "205015906031", "endpoint": "category"},
    {"name": "Cleaners & Repellents", "nodeId": "204952388031", "endpoint": "category"},
    {"name": "Detergent & Laundry", "nodeId": "204952381031", "endpoint": "category"},
    {"name": "Chips & Namkeen", "nodeId": "215540425031", "endpoint": "category"},
    {"name": "Beverages & Drinks", "nodeId": "204924538031", "endpoint": "category"},
    {"name": "Tea & Coffee", "nodeId": "204924535031", "endpoint": "category"},
    {"name": "Baby Care", "nodeId": "211421666031", "endpoint": "category"},
    {"name": "Atta, Dal & Rice", "nodeId": "204870002031", "endpoint": "category"}
]
