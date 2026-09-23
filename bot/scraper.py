import time
import requests
from . import config

def parse_cookie_string(cookie_str):
    """Parses a standard Cookie header string into a dictionary of cookies."""
    cookies = {}
    if not cookie_str:
        return cookies
    if cookie_str.lower().startswith("cookie:"):
        cookie_str = cookie_str[7:].strip()
    for item in cookie_str.split(";"):
        item = item.strip()
        if "=" in item:
            k, v = item.split("=", 1)
            cookies[k.strip()] = v.strip().strip("'\"")
    return cookies

def clean_brand_name(brand_val):
    """Normalizes and cleans up brand name."""
    if not brand_val:
        return ""
    if isinstance(brand_val, dict):
        brand_val = brand_val.get("name") or brand_val.get("displayName") or brand_val.get("text") or ""
    brand_str = str(brand_val).strip()
    if brand_str.lower().startswith("by ") or brand_str.lower().startswith("brand: "):
        brand_str = brand_str.split(" ", 1)[1].strip()
    return brand_str

class AmazonNowScraper:
    def __init__(self, brand_id=None, cookie_str=None):
        self.brand_id = (brand_id or config.AMAZON_BRAND_ID).strip()
        self.session = requests.Session()
        self.session.headers.update(config.DEFAULT_HEADERS)
        
        # Populate session cookies if provided
        cookies = parse_cookie_string(cookie_str or config.AMAZON_COOKIE)
        if cookies:
            self.session.cookies.update(cookies)

    def build_category_url(self, node_id, offset, endpoint="category"):
        return (
            f"https://www.amazon.in/tez/browse/{endpoint}?"
            f"nodeId={node_id}&brandId={self.brand_id}&offset={offset}"
        )

    def fetch_category_deals(self, category_info, min_discount=None):
        """
        Paginates through all widget pages for a category,
        extracting all items with discount >= min_discount.
        """
        cat_name = category_info.get("name", "Unknown Category")
        node_id = category_info.get("nodeId", "").strip()
        endpoint = category_info.get("endpoint", "category")
        min_disc = config.MIN_DISCOUNT if min_discount is None else min_discount

        if not node_id:
            print(f"  [⚠️ {cat_name}] Skipping: No nodeId configured.")
            return []

        if not self.brand_id:
            print(f"  [⚠️ {cat_name}] Error: No AMAZON_BRAND_ID configured.")
            return []

        items = []
        seen_asins = set()
        offset = 0
        has_more = True
        page = 0
        rate_limit_count = 0
        empty_batches = 0

        while has_more and page < 30:
            url = self.build_category_url(node_id, offset, endpoint)
            try:
                resp = self.session.get(url, timeout=12)

                if resp.status_code == 429:
                    rate_limit_count += 1
                    if rate_limit_count > 3:
                        print(f"  [⚠️ {cat_name}] Too many 429 rate limits. Aborting category scan.")
                        break
                    backoff = 4.0 * rate_limit_count
                    print(f"  [⏳ {cat_name}] HTTP 429 received. Backing off {backoff:.1f}s...")
                    time.sleep(backoff)
                    continue

                if resp.status_code != 200:
                    print(f"  [⚠️ {cat_name}] HTTP {resp.status_code} at offset {offset}. Stopping.")
                    break

                rate_limit_count = 0
                json_data = resp.json()
                data = json_data.get("data")
                if not data:
                    break

                widgets = data.get("widgets", [])
                batch_prods_count = 0

                for widget in widgets:
                    widget_data = widget.get("data", {})
                    prods = widget_data.get("products", [])
                    batch_prods_count += len(prods)

                    for p in prods:
                        asin = p.get("asin")
                        if not asin or asin in seen_asins:
                            continue

                        # Extract price and savings
                        bp_data = p.get("buyingPrice") or {}
                        lp_data = p.get("listPrice") or {}
                        bp = bp_data.get("amount")
                        lp = lp_data.get("amount")

                        savings = p.get("savings") or {}
                        raw_disc = savings.get("percentage")
                        disc = int(raw_disc) if raw_disc and str(raw_disc).isdigit() else 0

                        # Calculate fallback discount if percentage string is missing
                        if not disc and lp and bp and lp > bp:
                            disc = round(((lp - bp) / lp) * 100)

                        # Only collect deals meeting minimum discount threshold
                        if disc < min_disc:
                            continue

                        seen_asins.add(asin)

                        # Extract brand
                        raw_brand = (
                            p.get("brand") or
                            p.get("brandName") or
                            p.get("brandText") or
                            p.get("byLine") or
                            p.get("byline") or
                            (p.get("productOverview") or {}).get("brand") or
                            (p.get("attributes") or {}).get("brand") or ""
                        )
                        brand = clean_brand_name(raw_brand)

                        # Extract image
                        hero_img = p.get("heroImage") or {}
                        prod_imgs = p.get("productImages") or []
                        first_img = prod_imgs[0] if prod_imgs else {}
                        img_url = (
                            hero_img.get("mediumResImageUrl") or
                            hero_img.get("highResImageUrl") or
                            hero_img.get("lowResImageUrl") or
                            first_img.get("highResImageUrl") or
                            first_img.get("lowResImageUrl") or ""
                        )

                        deal = {
                            "id": asin,
                            "asin": asin,
                            "title": p.get("title", "").strip(),
                            "brand": brand,
                            "fsp": bp,
                            "mrp": lp or bp,
                            "discount": disc,
                            "pack_size": p.get("packSize", "").strip(),
                            "image": img_url,
                            "link": f"https://www.amazon.in/dp/{asin}",
                            "category": cat_name
                        }
                        items.append(deal)

                if batch_prods_count == 0:
                    empty_batches += 1
                    if empty_batches >= 4:
                        break
                else:
                    empty_batches = 0

                meta = data.get("metadata", {})
                has_more = bool(meta.get("hasMoreWidgets", False))
                next_offset = meta.get("nextOffset")
                offset = next_offset if isinstance(next_offset, int) else (offset + 1)
                page += 1

                time.sleep(config.INTER_PAGE_DELAY)

            except Exception as e:
                print(f"  [❌ {cat_name}] Error at offset {offset}: {e}")
                break

        return items
