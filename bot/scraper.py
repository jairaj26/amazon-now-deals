import re
import time
from bs4 import BeautifulSoup
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

MULTI_BRANDS = [
    'cadbury dairy milk', 'surf excel', 'coca-cola', 'thums up', 'tata sampann',
    'tata salt', 'tata tea', 'dairy milk', 'red label', 'mother dairy', 'paper boat',
    'raw pressery', 'too yumm', 'real fruit', 'b natural', 'brooke bond', 'taj mahal',
    'sleepy owl', 'blue tokai', 'the whole truth', 'whole truth', 'open secret',
    'yoga bar', 'wingreens farms', "ching's secret", 'chings secret', 'top ramen',
    'wai wai', '24 mantra', 'two brothers', 'organic india', 'forest essentials',
    'kama ayurveda', 'the derma co', "dr. sheth's", 'dr sheths', 'plum goodness',
    'head & shoulders', "l'oreal paris", 'loreal paris', 'godrej no.1', 'good knight',
    'all out', 'muscleblaze', 'muscle blaze', 'optimum nutrition', 'fast&up',
    'comfort after wash', 'clinic plus', 'country delight', 'milky mist', 'uncle chipps',
    'red bull', 'mountain dew', 'amazon basics', 'amazon brand', 'american tourister',
    'mother sparsh'
]

def extract_brand(title):
    """Infers the brand from product title using multi-word matching and clean token parsing."""
    if not title or not isinstance(title, str):
        return ""
    t = title.strip()
    tl = t.lower()

    for mb in MULTI_BRANDS:
        if tl.startswith(mb):
            return t[:len(mb)].strip()

    tokens = [tok for tok in re.split(r"\s+", t) if tok]
    if not tokens:
        return ""

    first = tokens[0]
    if re.match(r"^\d+%?$", first) and len(tokens) > 1:
        return f"{first} {tokens[1]}"

    return re.sub(r"[,;:\-\.]*$", "", first).strip()

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

def infer_category(title, wdg_hint=""):
    """Infers clean category name from title keywords and dark-store metadata."""
    t = (title or "").lower()
    w = (wdg_hint or "").lower()

    # 1. Pooja / Religious Needs
    if re.search(r"\b(pooja|puja|agarbatti|incense|camphor|diya|havan|dhoop|chandan|kapoor|cotton\s*wicks?|batti|sambrani|gopuram|mangalam|holy)\b", t):
        return "Pooja & Religious Needs"

    # 2. Snacks, Sweets & Treats
    if re.search(r"\b(chocolate|chocolates|chips|namkeen|biscuit|biscuits|cookies|cookie|kurkure|sweets|mithai|chikki|popcorn|nachos|makhana|candies|candy|cake|cakes|brownie|dry\s*fruits|nuts|almonds|cashews|raisins|peanuts)\b", t):
        return "Snacks, Sweets & Treats"

    # 3. Dairy, Bread & Eggs
    if re.search(r"\b(milk|curd|yogurt|paneer|cheese|butter|bread|eggs?|fresh\s*cream|whipping\s*cream|cooking\s*cream|dairy\s*whitener)\b", t) or "dairy" in w:
        return "Dairy, Bread & Eggs"

    # 4. Grocery & Staples
    if re.search(r"\b(atta|flour|rice|dal|dals|pulses|chana|cooking\s*oil|mustard\s*oil|sunflower\s*oil|refined\s*oil|ghee|salt|sugar|masala|spices|poha|daliya|soya|grains|besan|maida|sooji)\b", t) or "grocery" in w:
        return "Grocery & Staples"

    # 5. Beverages & Drinks
    if re.search(r"\b(tea|coffee|juice|juices|coke|pepsi|cola|drink|drinks|soda|energy\s*drink|milkshake|lassi|buttermilk|squash|syrup)\b", t):
        return "Beverages & Drinks"

    # 6. Ice Creams & Frozen
    if re.search(r"\b(ice\s*cream|cornetto|kulfi|frozen)\b", t):
        return "Ice Creams & Frozen"

    # 7. Personal Care & Beauty
    if re.search(r"\b(shampoo|conditioner|soap|body\s*wash|face\s*wash|lotion|serum|sunscreen|cream|moisturiz|perfume|deodorant|deo|lipstick|kajal|makeup|skincare|hair|facial)\b", t) or "beauty" in w:
        return "Personal Care & Beauty"

    # 8. Oral Care & Health
    if re.search(r"\b(toothpaste|toothbrush|mouthwash|protein|supplement|vitamins?|creatine|condom)\b", t):
        return "Oral Care & Health"

    # 9. Home Care & Cleaning
    if re.search(r"\b(detergent|liquid\s*wash|dishwash|cleaner|lizol|harpic|mop|broom|repellent|garbage\s*bags?|napkin|tissue|fabric|vanish|comfort|surf|aerial|tide)\b", t) or "home" in w:
        return "Home & Cleaning"

    # 10. Kitchen & Dining
    if re.search(r"\b(cooker|chopper|bottle|flask|container|tiffin|pan|knife|kettle|plate|glass|mug|utensil|board)\b", t) or "kitchen" in w:
        return "Kitchen & Dining"

    # 11. Electronics & Gadgets
    if re.search(r"\b(watch|smartwatch|cable|charger|earphones?|headphones?|mouse|keyboard|power\s*bank|adapter|battery|bulb|led|tech)\b", t) or "ce_" in w or "pc_" in w:
        return "Electronics & Gadgets"

    # 12. Luggage & Bags
    if re.search(r"\b(backpack|bag|suitcase|trolley|duffle|wallet|pouch)\b", t) or "luggage" in w:
        return "Luggage & Bags"

    # 13. Baby Care
    if re.search(r"\b(diaper|diapers|baby\s*wipes?|baby\s*lotion|baby\s*wash|baby\s*oil)\b", t) or "baby" in w:
        return "Baby Care"

    if w:
        clean_wdg = w.replace("_display_on_website", "").replace("_", " ").strip()
        return clean_wdg.title()

    return "General Essentials"

def is_pooja_item(title, category=""):
    """Checks whether an item is a Pooja/Religious item."""
    if category == "Pooja & Religious Needs":
        return True
    t = (title or "").lower()
    return bool(re.search(r"\b(pooja|puja|agarbatti|incense|camphor|diya|havan|dhoop|chandan|kapoor|cotton\s*wicks?|batti|sambrani|gopuram|mangalam|holy)\b", t))

class AmazonNowScraper:
    def __init__(self, brand_id=None, cookie_str=None):
        self.brand_id = (brand_id or config.AMAZON_BRAND_ID).strip()
        self.session = requests.Session()
        self.session.headers.update(config.DEFAULT_HEADERS)
        
        # Populate session cookies if provided
        cookies = parse_cookie_string(cookie_str or config.AMAZON_COOKIE)
        if cookies:
            self.session.cookies.update(cookies)

    def build_global_search_url(self, disc_node, page):
        return (
            f"https://www.amazon.in/s?i=amazontez&srs={config.TEZ_SRS_NODE}"
            f"&bbn={config.TEZ_SRS_NODE}&rh=n%3A{config.TEZ_SRS_NODE}%2Cp_n_pct-off-with-tax%3A{disc_node}"
            f"&s=pct-off-with-tax&dc&page={page}"
        )

    def fetch_global_deals(self, min_discount=None):
        """
        Queries Amazon Now Global Search with server-side discount refinement and sorting:
        /s?i=amazontez&srs=100147972031&bbn=100147972031&rh=n%3A100147972031%2Cp_n_pct-off-with-tax%3A<NODE>&s=pct-off-with-tax&dc&page=<PAGE>
        """
        min_disc = config.MIN_DISCOUNT if min_discount is None else min_discount

        # Choose the closest discount refinement node <= min_disc
        disc_node = config.DISCOUNT_NODE_MAP.get(min_disc)
        if not disc_node:
            avail = sorted([k for k in config.DISCOUNT_NODE_MAP.keys() if k <= min_disc], reverse=True)
            disc_node = config.DISCOUNT_NODE_MAP[avail[0]] if avail else config.DISCOUNT_NODE_MAP[70]

        items = []
        seen_asins = set()
        page = 1
        empty_streak = 0
        max_pages = config.MAX_GLOBAL_PAGES

        print(f"[🔍 Global Search] Scanning Amazon Now for {min_disc}%+ deals (Node: {disc_node}, Max Pages: {max_pages})...")

        while page <= max_pages:
            url = self.build_global_search_url(disc_node, page)
            try:
                resp = self.session.get(url, timeout=15)
                if resp.status_code == 429:
                    print(f"  [⏳ P.{page}] HTTP 429 rate limit. Backing off 5.0s...")
                    time.sleep(5.0)
                    continue

                if resp.status_code != 200:
                    print(f"  [⚠️ P.{page}] HTTP {resp.status_code}. Stopping global scan.")
                    break

                soup = BeautifulSoup(resp.text, "html.parser")
                cards = soup.select('div[data-asin]:not([data-asin=""])[data-component-type="s-search-result"]')
                if not cards:
                    cards = [c for c in soup.select('div[data-asin]') if c.get("data-asin", "").strip()]

                if not cards:
                    print(f"  [ℹ️ P.{page}] 0 product cards found. Reached end of catalog.")
                    break

                added_on_page = 0

                for card in cards:
                    asin = (card.get("data-asin") or "").strip()
                    if not asin or asin in seen_asins:
                        continue

                    # Skip sponsored cards
                    if card.select_one('.puis-sponsored-label-text, [data-component-type="sp-sponsored-result"]'):
                        continue

                    # Title
                    title_el = card.select_one("h2 span, h2 a span")
                    if not title_el:
                        continue
                    title = title_el.get_text(strip=True)
                    if not title:
                        continue

                    # Price extraction
                    bp = None
                    lp = None

                    offer_el = card.select_one("[data-csa-c-price-to-pay]")
                    if offer_el:
                        try:
                            bp_str = offer_el.get("data-csa-c-price-to-pay")
                            if bp_str:
                                bp = float(bp_str)
                            lp_str = offer_el.get("data-csa-c-strike-through-price")
                            if lp_str:
                                lp = float(lp_str)
                        except (ValueError, TypeError):
                            pass

                    # Fallbacks for price
                    if bp is None:
                        price_el = card.select_one(".a-price:not([data-a-strike]) .a-offscreen")
                        if price_el:
                            try:
                                bp = float(re.sub(r"[^\d.]", "", price_el.get_text()))
                            except (ValueError, TypeError):
                                pass

                    if lp is None:
                        mrp_el = card.select_one(".a-price[data-a-strike] .a-offscreen")
                        if mrp_el:
                            try:
                                lp = float(re.sub(r"[^\d.]", "", mrp_el.get_text()))
                            except (ValueError, TypeError):
                                pass

                    if bp is None:
                        continue

                    if lp is None or lp < bp:
                        lp = bp

                    discount = round(((lp - bp) / lp) * 100) if lp > bp else 0
                    if discount == 0:
                        disc_match = re.search(r"\((\d+)%\s*off\)", card.get_text(), re.IGNORECASE)
                        if disc_match:
                            discount = int(disc_match.group(1))

                    # Post-Filter: strictly verify actual dark-store discount >= min_disc
                    if discount < min_disc:
                        continue

                    # Image
                    img_el = card.select_one("img.s-image")
                    img = img_el.get("src", "") if img_el else ""

                    # Category / Department Hint
                    hint_el = card.select_one("[data-wdg]")
                    wdg_attr = hint_el.get("data-wdg", "").strip() if hint_el else ""
                    category = infer_category(title, wdg_attr)

                    brand = clean_brand_name(extract_brand(title))

                    item = {
                        "asin": asin,
                        "title": title,
                        "fsp": bp,
                        "mrp": lp,
                        "discount": discount,
                        "image": img,
                        "url": f"https://www.amazon.in/dp/{asin}",
                        "brand": brand,
                        "category": category,
                        "is_pooja": is_pooja_item(title, category)
                    }

                    seen_asins.add(asin)
                    items.append(item)
                    added_on_page += 1

                print(f"  [✓ P.{page}] {added_on_page} deals found (≥{min_disc}% off) | Total so far: {len(items)}")

                # Early-stop: 2 consecutive pages with 0 qualifying deals
                if added_on_page == 0:
                    empty_streak += 1
                    if empty_streak >= 2:
                        print(f"  [ℹ️ P.{page}] 2 consecutive pages with 0 qualifying deals. Stopping early.")
                        break
                else:
                    empty_streak = 0

                page += 1
                time.sleep(config.INTER_PAGE_DELAY)

            except Exception as e:
                print(f"  [⚠️ P.{page}] Scrape error: {e}")
                break

        print(f"[🏁 Global Search Complete] Total qualifying deals found: {len(items)}\n")
        return items

    def build_category_url(self, node_id, offset, endpoint="category"):
        return (
            f"https://www.amazon.in/tez/browse/{endpoint}?"
            f"nodeId={node_id}&brandId={self.brand_id}&offset={offset}"
        )

    def fetch_category_deals(self, category_info, min_discount=None):
        """
        Paginates through all widget pages for a category via Tez API (backward compatibility).
        """
        cat_name = category_info.get("name", "Unknown Category")
        node_id = category_info.get("nodeId", "").strip()
        endpoint = category_info.get("endpoint", "category")
        min_disc = config.MIN_DISCOUNT if min_discount is None else min_discount

        if not node_id:
            return []
        if not self.brand_id:
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
                        break
                    time.sleep(4.0 * rate_limit_count)
                    continue

                if resp.status_code != 200:
                    break

                rate_limit_count = 0
                json_data = resp.json()
                data = json_data.get("data")
                if not data:
                    break

                widgets = data.get("widgets", [])
                batch_prods_count = 0

                for widget in widgets:
                    prods = widget.get("data", {}).get("products", [])
                    batch_prods_count += len(prods)
                    for p in prods:
                        asin = p.get("asin")
                        if not asin or asin in seen_asins:
                            continue

                        savings = p.get("savings", {})
                        disc = int(savings.get("percentage", 0)) if savings.get("percentage") else 0
                        bp = p.get("buyingPrice", {}).get("amount")
                        lp = p.get("listPrice", {}).get("amount")

                        if not disc and lp and bp and lp > bp:
                            disc = round(((lp - bp) / lp) * 100)

                        if disc < min_disc:
                            continue

                        title = p.get("title", "")
                        brand = clean_brand_name(p.get("brand") or extract_brand(title))
                        hero = p.get("heroImage", {})
                        img = hero.get("mediumResImageUrl") or hero.get("lowResImageUrl") or ""

                        cat = infer_category(title, "") if cat_name == "Unknown Category" else cat_name
                        items.append({
                            "asin": asin,
                            "title": title,
                            "fsp": bp,
                            "mrp": lp,
                            "discount": disc,
                            "image": img,
                            "url": f"https://www.amazon.in/dp/{asin}",
                            "brand": brand,
                            "category": cat,
                            "is_pooja": is_pooja_item(title, cat)
                        })
                        seen_asins.add(asin)

                if batch_prods_count == 0:
                    empty_batches += 1
                    if empty_batches >= 4:
                        break
                else:
                    empty_batches = 0

                metadata = data.get("metadata", {})
                has_more = metadata.get("hasMoreWidgets", False)
                next_offset = metadata.get("nextOffset")
                offset = next_offset if isinstance(next_offset, int) else offset + 1
                page += 1
                time.sleep(config.INTER_PAGE_DELAY)

            except Exception:
                break

        return items
