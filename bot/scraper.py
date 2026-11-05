import html
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

def _extract_price(val_str):
    """Extracts the first valid floating-point price from a string, handling commas and 'Rs.'."""
    if not val_str:
        return None
    m = re.search(r"\d+(?:,\d+)*(?:\.\d+)?", str(val_str))
    if not m:
        return None
    try:
        return float(m.group(0).replace(",", ""))
    except (ValueError, TypeError):
        return None

def _check_captcha(html_text):
    """Detects whether Amazon served a CAPTCHA challenge page instead of results."""
    if not html_text:
        return False
    hl = html_text.lower()
    return "validatecaptcha" in hl or "api-services-support@amazon.com" in hl

# Multi-word brand names sorted by length descending so longer brand names match first
MULTI_BRANDS = sorted([
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
], key=len, reverse=True)

# Pre-compiled module-level regular expressions for category inference
RE_POOJA = re.compile(
    r"\b(pooja|puja|agarbatti|incense|camphor|diya|havan|dhoop|chandan|kapoor|cotton\s*wicks?|batti|sambrani|gopuram|mangalam|holy|rakhi|rakshabandhan|rakhee|rakshasutra|lumba|raakhee)\b",
    re.IGNORECASE
)
RE_SNACKS = re.compile(
    r"\b(chocolate|chocolates|chips|namkeen|biscuit|biscuits|cookies|cookie|kurkure|sweets|mithai|chikki|popcorn|nachos|makhana|candies|candy|cake|cakes|brownie|dry\s*fruits|nuts|almonds|cashews|raisins|peanuts)\b",
    re.IGNORECASE
)
RE_DAIRY = re.compile(
    r"\b(milk|curd|yogurt|paneer|cheese|butter|bread|eggs?|fresh\s*cream|whipping\s*cream|cooking\s*cream|dairy\s*whitener)\b",
    re.IGNORECASE
)
RE_GROCERY = re.compile(
    r"\b(atta|flour|rice|dal|dals|pulses|chana|cooking\s*oil|mustard\s*oil|sunflower\s*oil|refined\s*oil|ghee|salt|sugar|masala|spices|poha|daliya|soya|grains|besan|maida|sooji)\b",
    re.IGNORECASE
)
RE_BEVERAGES = re.compile(
    r"\b(tea|coffee|juice|juices|coke|pepsi|cola|drink|drinks|soda|energy\s*drink|milkshake|lassi|buttermilk|squash|syrup)\b",
    re.IGNORECASE
)
RE_ICE_CREAM = re.compile(r"\b(ice\s*cream|cornetto|kulfi|frozen)\b", re.IGNORECASE)
RE_PERSONAL_CARE = re.compile(
    r"\b(shampoo|conditioner|soap|body\s*wash|face\s*wash|lotion|serum|sunscreen|cream|moisturiz|perfume|deodorant|deo|lipstick|kajal|makeup|skincare|hair|facial)\b",
    re.IGNORECASE
)
RE_ORAL_CARE = re.compile(
    r"\b(toothpaste|toothbrush|mouthwash|protein|supplement|vitamins?|creatine|condom)\b",
    re.IGNORECASE
)
RE_HOME_CLEANING = re.compile(
    r"\b(detergent|liquid\s*wash|dishwash|cleaner|lizol|harpic|mop|broom|repellent|garbage\s*bags?|napkin|tissue|fabric|vanish|comfort|surf|aerial|tide)\b",
    re.IGNORECASE
)
RE_KITCHEN = re.compile(
    r"\b(cooker|chopper|bottle|flask|container|tiffin|pan|knife|kettle|plate|glass|mug|utensil|board)\b",
    re.IGNORECASE
)
RE_ELECTRONICS = re.compile(
    r"\b(watch|smartwatch|cable|charger|earphones?|headphones?|mouse|keyboard|power\s*bank|adapter|battery|bulb|led|tech)\b",
    re.IGNORECASE
)
RE_LUGGAGE = re.compile(r"\b(backpack|bag|suitcase|trolley|duffle|wallet|pouch)\b", re.IGNORECASE)
RE_BABY = re.compile(r"\b(diaper|diapers|baby\s*wipes?|baby\s*lotion|baby\s*wash|baby\s*oil)\b", re.IGNORECASE)

# Pre-compiled regex for trinket/inflated MRP identification
RE_TRINKET = re.compile(
    r"\b(pooja|puja|agarbatti|incense|camphor|diya|havan|dhoop|chandan|kapoor|cotton\s*wicks?|batti|"
    r"sambrani|gopuram|mangalam|holy|rakhi|rakshabandhan|rakhee|rakshasutra|lumba|raakhee|"
    r"bracelet|bangle|finger\s*rings?|earrings?|cufflinks?|keychains?|pendant|necklace|anklet)\b",
    re.IGNORECASE
)

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

    # 1. Pooja / Religious Needs & Rakhi
    if RE_POOJA.search(t):
        return "Pooja & Religious Needs"

    # 2. Snacks, Sweets & Treats
    if RE_SNACKS.search(t):
        return "Snacks, Sweets & Treats"

    # 3. Dairy, Bread & Eggs
    if RE_DAIRY.search(t) or "dairy" in w:
        return "Dairy, Bread & Eggs"

    # 4. Grocery & Staples
    if RE_GROCERY.search(t) or "grocery" in w:
        return "Grocery & Staples"

    # 5. Beverages & Drinks
    if RE_BEVERAGES.search(t):
        return "Beverages & Drinks"

    # 6. Ice Creams & Frozen
    if RE_ICE_CREAM.search(t):
        return "Ice Creams & Frozen"

    # 7. Personal Care & Beauty
    if RE_PERSONAL_CARE.search(t) or "beauty" in w:
        return "Personal Care & Beauty"

    # 8. Oral Care & Health
    if RE_ORAL_CARE.search(t):
        return "Oral Care & Health"

    # 9. Home Care & Cleaning
    if RE_HOME_CLEANING.search(t) or "home" in w:
        return "Home & Cleaning"

    # 10. Kitchen & Dining
    if RE_KITCHEN.search(t) or "kitchen" in w:
        return "Kitchen & Dining"

    # 11. Electronics & Gadgets
    if RE_ELECTRONICS.search(t) or "ce_" in w or "pc_" in w:
        return "Electronics & Gadgets"

    # 12. Luggage & Bags
    if RE_LUGGAGE.search(t) or "luggage" in w:
        return "Luggage & Bags"

    # 13. Baby Care
    if RE_BABY.search(t) or "baby" in w:
        return "Baby Care"

    if w:
        clean_wdg = w.replace("_display_on_website", "").replace("_", " ").strip()
        return clean_wdg.title()

    return "General Essentials"

def is_trinket_item(title, category=""):
    """
    Checks whether an item is a Pooja essential, Rakhi, or artificial fashion jewelry (trinket)
    which frequently have inflated MRPs.
    """
    if category == "Pooja & Religious Needs":
        return True
    t = (title or "").lower()
    return bool(RE_TRINKET.search(t))

def is_pooja_item(title, category=""):
    """Backward-compatible alias for is_trinket_item."""
    return is_trinket_item(title, category)

class AmazonNowScraper:
    def __init__(self, brand_id=None, cookie_str=None):
        self.brand_id = (brand_id or config.AMAZON_BRAND_ID).strip()
        self.session = requests.Session()
        self.session.headers.update(config.DEFAULT_HEADERS)
        
        # Populate session cookies if provided
        cookies = parse_cookie_string(cookie_str or config.AMAZON_COOKIE)
        if cookies:
            self.session.cookies.update(cookies)

    def build_global_search_url(self, disc_node, page, price_facet=None, sort_mode="pct-off-with-tax"):
        rh = f"n%3A{config.TEZ_SRS_NODE}%2Cp_n_pct-off-with-tax%3A{disc_node}"
        if price_facet:
            rh += f"%2Cp_36%3A{price_facet}"
        brand_param = f"&almBrandId={self.brand_id}" if self.brand_id else ""
        return (
            f"https://www.amazon.in/s?i=amazontez&srs={config.TEZ_SRS_NODE}"
            f"&bbn={config.TEZ_SRS_NODE}&rh={rh}"
            f"&s={sort_mode}{brand_param}&dc&page={page}"
        )

    def _parse_search_card(self, card, min_disc):
        asin = (card.get("data-asin") or "").strip()
        if not asin:
            return None

        # Skip sponsored cards
        if card.select_one('.puis-sponsored-label-text, [data-component-type="sp-sponsored-result"]'):
            return None

        # Title
        title_el = card.select_one("h2 span, h2 a span")
        if not title_el:
            return None
        title = title_el.get_text(strip=True)
        if not title:
            return None

        # Price extraction using robust regex helper
        bp = None
        lp = None

        offer_el = card.select_one("[data-csa-c-price-to-pay]")
        if offer_el:
            bp = _extract_price(offer_el.get("data-csa-c-price-to-pay"))
            lp = _extract_price(offer_el.get("data-csa-c-strike-through-price"))

        if bp is None:
            price_el = card.select_one(".a-price:not([data-a-strike]) .a-offscreen")
            if price_el:
                bp = _extract_price(price_el.get_text())

        if lp is None:
            mrp_el = card.select_one(".a-price[data-a-strike] .a-offscreen")
            if mrp_el:
                lp = _extract_price(mrp_el.get_text())

        if bp is None:
            return None

        if lp is None or lp < bp:
            lp = bp

        discount = round(((lp - bp) / lp) * 100) if lp > bp else 0
        if discount == 0:
            disc_match = re.search(r"\((\d+)%\s*off\)", card.get_text(), re.IGNORECASE)
            if disc_match:
                discount = int(disc_match.group(1))

        if discount < min_disc:
            return None

        # Image
        img_el = card.select_one("img.s-image")
        img = img_el.get("src", "") if img_el else ""

        # Category / Department Hint
        hint_el = card.select_one("[data-wdg]")
        wdg_attr = hint_el.get("data-wdg", "").strip() if hint_el else ""
        category = infer_category(title, wdg_attr)

        brand = clean_brand_name(extract_brand(title))

        return {
            "asin": asin,
            "title": title,
            "fsp": bp,
            "mrp": lp,
            "discount": discount,
            "image": img,
            "url": f"https://www.amazon.in/dp/{asin}",
            "brand": brand,
            "category": category,
            "is_pooja": is_pooja_item(title, category),
            "is_trinket": is_trinket_item(title, category)
        }

    def fetch_global_deals(self, min_discount=None):
        """
        Queries Amazon Now Global Search with server-side discount refinement and price slicing:
        /s?i=amazontez&srs=100147972031&bbn=100147972031&rh=n%3A100147972031%2Cp_n_pct-off-with-tax%3A<NODE>%2Cp_36%3A<BRACKET>&s=pct-off-with-tax&dc&page=<PAGE>
        """
        min_disc = config.MIN_DISCOUNT if min_discount is None else min_discount

        # Choose the closest discount refinement node <= min_disc
        disc_node = config.DISCOUNT_NODE_MAP.get(min_disc)
        if not disc_node:
            avail = sorted([k for k in config.DISCOUNT_NODE_MAP.keys() if k <= min_disc], reverse=True)
            disc_node = config.DISCOUNT_NODE_MAP[avail[0]] if avail else config.DISCOUNT_NODE_MAP[70]

        items = []
        seen_asins = set()

        if getattr(config, 'PRICE_BRACKETS', None):
            print(f"[🔍 Global Search] Slicing Amazon Now across {len(config.PRICE_BRACKETS)} price brackets ({min_disc}%+ deals)...")
            for b_idx, bracket in enumerate(config.PRICE_BRACKETS, 1):
                b_label = bracket.get("label", f"Tier {b_idx}")
                b_facet = bracket.get("facet")
                print(f"  [🏷️ {b_label}] Scanning up to {config.MAX_PAGES_PER_BRACKET} pages (p_36:{b_facet})...")

                page = 1
                while page <= config.MAX_PAGES_PER_BRACKET:
                    url = self.build_global_search_url(disc_node, page, price_facet=b_facet)
                    resp = None
                    # Retry loop with exponential backoff on HTTP 429
                    for attempt in range(1, 4):
                        try:
                            resp = self.session.get(url, timeout=15)
                            if resp.status_code == 429:
                                backoff = 5.0 * attempt
                                print(f"    [⏳ {b_label} P.{page}] HTTP 429 rate limit. Retrying in {backoff:.1f}s (attempt {attempt}/3)...")
                                time.sleep(backoff)
                                continue
                            break
                        except Exception as e:
                            print(f"    [⚠️ {b_label} P.{page}] Network error: {e}")
                            if attempt < 3:
                                time.sleep(2.0 * attempt)
                            else:
                                break

                    if not resp or resp.status_code != 200:
                        code = resp.status_code if resp else "NO_RESPONSE"
                        print(f"    [⚠️ {b_label} P.{page}] HTTP {code}. Moving to next bracket.")
                        break

                    # Check for Amazon bot/CAPTCHA block
                    if _check_captcha(resp.text):
                        print(f"    [⚠️ CAPTCHA / Bot Check] Amazon blocked request on {b_label} P.{page} — please refresh AMAZON_COOKIE!")
                        break

                    soup = BeautifulSoup(resp.text, "html.parser")
                    cards = soup.select('div[data-asin]:not([data-asin=""])[data-component-type="s-search-result"]')
                    if not cards:
                        cards = [c for c in soup.select('div[data-asin]') if c.get("data-asin", "").strip()]

                    if not cards:
                        break

                    added_on_page = 0
                    for card in cards:
                        asin = (card.get("data-asin") or "").strip()
                        if not asin or asin in seen_asins:
                            continue
                        item = self._parse_search_card(card, min_disc)
                        if item:
                            seen_asins.add(asin)
                            items.append(item)
                            added_on_page += 1

                    print(f"    [✓ {b_label} P.{page}] {added_on_page} deals found | Total so far: {len(items)}")

                    if added_on_page == 0:
                        break

                    page += 1
                    time.sleep(config.INTER_PAGE_DELAY)
        else:
            page = 1
            empty_streak = 0
            max_pages = config.MAX_GLOBAL_PAGES
            print(f"[🔍 Global Search] Scanning Amazon Now for {min_disc}%+ deals (Node: {disc_node}, Max Pages: {max_pages})...")

            rate_limit_retries = 0
            while page <= max_pages:
                url = self.build_global_search_url(disc_node, page)
                try:
                    resp = self.session.get(url, timeout=15)
                    if resp.status_code == 429:
                        rate_limit_retries += 1
                        if rate_limit_retries > 3:
                            print(f"  [⚠️ P.{page}] Rate limit persistent after 3 retries. Stopping global scan.")
                            break
                        backoff = 5.0 * rate_limit_retries
                        print(f"  [⏳ P.{page}] HTTP 429 rate limit. Backing off {backoff:.1f}s...")
                        time.sleep(backoff)
                        continue

                    rate_limit_retries = 0

                    if resp.status_code != 200:
                        print(f"  [⚠️ P.{page}] HTTP {resp.status_code}. Stopping global scan.")
                        break

                    # Check for Amazon bot/CAPTCHA block
                    if _check_captcha(resp.text):
                        print(f"  [⚠️ CAPTCHA / Bot Check] Amazon blocked request on P.{page} — please refresh AMAZON_COOKIE!")
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
                        item = self._parse_search_card(card, min_disc)
                        if item:
                            seen_asins.add(asin)
                            items.append(item)
                            added_on_page += 1

                    print(f"  [✓ P.{page}] {added_on_page} deals found (≥{min_disc}% off) | Total so far: {len(items)}")

                    if added_on_page == 0:
                        empty_streak += 1
                        if empty_streak >= 5:
                            print(f"  [ℹ️ P.{page}] 5 consecutive pages with 0 qualifying deals. Stopping early.")
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
            f"https://www.amazon.in/tez/browse/{endpoint}"
            f"?nodeId={node_id}&brandId={self.brand_id}&offset={offset}"
        )

    def fetch_category_deals(self, category_name, node_id, endpoint="category", min_discount=None):
        min_disc = config.MIN_DISCOUNT if min_discount is None else min_discount
        items = []
        offset = 0
        has_more = True
        rate_limit_count = 0
        seen_asins = set()

        print(f"[*] Scanning Category: {category_name} (Node: {node_id}, Endpoint: {endpoint})...")

        while has_more and offset < 30:
            url = self.build_category_url(node_id, offset, endpoint=endpoint)
            try:
                resp = self.session.get(url, timeout=12)
                if resp.status_code == 429:
                    rate_limit_count += 1
                    if rate_limit_count > 3:
                        break
                    time.sleep(4.0 * rate_limit_count)
                    continue

                rate_limit_count = 0
                if resp.status_code != 200:
                    break

                res_json = resp.json()
                data = res_json.get("data", {})
                widgets = data.get("widgets", [])
                page_prod_count = 0

                for widget in widgets:
                    prods = widget.get("data", {}).get("products", [])
                    page_prod_count += len(prods)
                    for p in prods:
                        asin = p.get("asin")
                        if not asin or asin in seen_asins:
                            continue

                        # Savings & price extraction
                        savings = p.get("savings", {})
                        disc = int(savings.get("percentage", 0)) if savings.get("percentage") else 0
                        bp = p.get("buyingPrice", {}).get("amount")
                        lp = p.get("listPrice", {}).get("amount")

                        if not disc and lp and bp and lp > bp:
                            disc = round(((lp - bp) / lp) * 100)

                        if disc < min_disc:
                            continue

                        hero_img = (p.get("heroImage", {}).get("mediumResImageUrl")
                                    or p.get("heroImage", {}).get("lowResImageUrl")
                                    or (p.get("productImages", [{}])[0].get("lowResImageUrl") if p.get("productImages") else ""))

                        title = p.get("title", "")
                        brand = clean_brand_name(p.get("brand") or p.get("brandName") or extract_brand(title))

                        items.append({
                            "asin": asin,
                            "title": title,
                            "fsp": bp,
                            "mrp": lp,
                            "discount": disc,
                            "image": hero_img,
                            "url": f"https://www.amazon.in/dp/{asin}",
                            "brand": brand,
                            "category": category_name,
                            "is_pooja": is_pooja_item(title, category_name),
                            "is_trinket": is_trinket_item(title, category_name)
                        })
                        seen_asins.add(asin)

                if page_prod_count == 0:
                    break

                meta = data.get("metadata", {})
                has_more = meta.get("hasMoreWidgets", True)
                next_offset = meta.get("nextOffset")
                if next_offset is not None and next_offset > offset:
                    offset = next_offset
                else:
                    offset += 1

                time.sleep(config.INTER_PAGE_DELAY)

            except Exception as e:
                print(f"    [!] Error scraping {category_name} (offset {offset}): {e}")
                break

        print(f"    [+] Found {len(items)} deals (≥{min_disc}%) in {category_name}")
        return items
