import argparse
import concurrent.futures
from datetime import datetime, timezone, timedelta
import json
import os
import sys
import time

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from . import config
from .scraper import AmazonNowScraper
from .telegram import TelegramNotifier

# Indian Standard Time (UTC+5:30)
IST = timezone(timedelta(hours=5, minutes=30))

# 7-day cooldown for unchanging prices (items with same price alert at most once a week)
SEVEN_DAYS_SECONDS = 7 * 24 * 3600

def get_deal_key(deal):
    """Derives a stable unique product identifier based on ASIN."""
    return deal.get("asin") or deal.get("id") or ""

def load_cache(cache_path):
    """Loads previously posted deals from cache."""
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_cache(cache, cache_path):
    """Saves posted deals to cache, pruning records older than 30 days."""
    os.makedirs(os.path.dirname(os.path.abspath(cache_path)), exist_ok=True)
    now = time.time()
    retention_period = 30 * 24 * 3600  # 30 days retention

    pruned = {}
    for key, record in cache.items():
        ts = record.get("timestamp", 0)
        if now - ts < retention_period:
            pruned[key] = record

    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(pruned, f, indent=2, ensure_ascii=False)

def should_post_deal(deal, cache):
    """
    Weekly Deduplication Rules:
    1. If never posted before -> Post it.
    2. If posted before:
       - If selling price dropped further (fsp < cached_fsp) -> Post immediately (price drop).
       - If price is same or higher:
         * Check if 7 days (1 week) have passed since last post.
         * If >= 7 days -> Post once for new week.
         * Otherwise -> Suppress (shows only once a week for items with unchanging prices).
    """
    key = get_deal_key(deal)
    if not key:
        return False

    cached = cache.get(key)
    if not cached:
        return True

    cached_fsp = cached.get("fsp", float("inf"))

    # 1. Price dropped further -> alert immediately
    if deal.get("fsp") is not None and deal["fsp"] < cached_fsp:
        return True

    # 2. Same or higher price -> check if 7 days (1 week) have passed
    now = time.time()
    last_posted = cached.get("timestamp", 0)
    if (now - last_posted) >= SEVEN_DAYS_SECONDS:
        return True

    # Suppress repeat alert within the 7-day window
    return False

def scan_category_worker(category_info, brand_id, cookie_str, min_discount):
    """Worker function to scrape all pages of a single category."""
    scraper = AmazonNowScraper(brand_id=brand_id, cookie_str=cookie_str)
    return scraper.fetch_category_deals(category_info, min_discount=min_discount)

def main():
    parser = argparse.ArgumentParser(description="Amazon Now (Tez) Deals Scraper & Telegram Bot")
    parser.add_argument("--dry-run", action="store_true", default=config.DRY_RUN, help="Print deals without posting to Telegram")
    parser.add_argument("--brand-id", default=config.AMAZON_BRAND_ID, help="Target Amazon Now brandId (dark store)")
    parser.add_argument("--min-discount", type=int, default=config.MIN_DISCOUNT, help="Minimum discount percentage threshold")
    parser.add_argument("--workers", type=int, default=config.MAX_WORKERS, help="Number of concurrent worker threads")
    parser.add_argument("--cache", default=config.CACHE_FILE, help="Path to cache JSON file")
    args = parser.parse_args()

    start_time = time.time()
    ist_now = datetime.now(IST)
    print("=" * 65)
    print("⚡ Amazon Now (Tez) Deals Finder - Scheduled Run")
    print(f"⏰ Current IST Time : {ist_now.strftime('%Y-%m-%d %H:%M:%S')} IST")
    print(f"🏪 Brand ID (Store) : {args.brand_id or '[MISSING - Set AMAZON_BRAND_ID]'}")
    print(f"🔥 Min Discount     : {args.min_discount}%")
    print(f"⚙️ Workers          : {args.workers}")
    print(f"🛡️ Dry Run          : {'YES (Alerts disabled)' if args.dry_run else 'NO (Live Telegram posting)'}")

    # Inspect Cookie configuration
    cookie_str = config.AMAZON_COOKIE or ""
    has_session = "session-id=" in cookie_str or "; session-id=" in cookie_str
    has_ubid = "ubid-acbin=" in cookie_str or "; ubid-acbin=" in cookie_str
    has_at = "at-acbin=" in cookie_str or "; at-acbin=" in cookie_str

    if cookie_str:
        print(f"🍪 Cookie           : Configured ({len(cookie_str)} chars) [session-id: {'✓' if has_session else '✗'}, ubid: {'✓' if has_ubid else '✗'}, at: {'✓' if has_at else '✗'}]")
    else:
        print("🍪 Cookie           : None provided (Running anonymous session - may be redirected by Amazon)")
    print("=" * 65)

    if not args.brand_id:
        print("❌ FATAL: No AMAZON_BRAND_ID provided! Please set AMAZON_BRAND_ID in .env or pass --brand-id.")
        sys.exit(1)

    categories = config.CATEGORIES
    print(f"[*] Starting concurrent scan across {len(categories)} high-yield categories with {args.workers} workers...")

    all_deals = []
    seen_asins = set()

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        future_to_cat = {
            executor.submit(scan_category_worker, cat, args.brand_id, cookie_str, args.min_discount): cat
            for cat in categories
        }

        for future in concurrent.futures.as_completed(future_to_cat):
            cat = future_to_cat[future]
            try:
                deals = future.result()
                new_in_cat = 0
                for d in deals:
                    if d["asin"] not in seen_asins:
                        seen_asins.add(d["asin"])
                        all_deals.append(d)
                        new_in_cat += 1
                print(f"  [✓] {cat['name']:<22}: Found {len(deals)} items >= {args.min_discount}% ({new_in_cat} unique)")
            except Exception as e:
                print(f"  [✗] {cat['name']:<22}: Error: {e}")

    # Sort all collected deals by highest discount first
    all_deals.sort(key=lambda d: d.get("discount", 0), reverse=True)

    print("-" * 65)
    print(f"[*] Total unique qualifying deals found: {len(all_deals)}")

    # Load cache and apply deduplication rules
    cache = load_cache(args.cache)
    print(f"[*] Loaded {len(cache)} existing records from cache ({args.cache})")

    deals_to_alert = []
    suppressed_count = 0

    for deal in all_deals:
        if should_post_deal(deal, cache):
            deals_to_alert.append(deal)
        else:
            suppressed_count += 1

    print(f"[*] Deals to alert: {len(deals_to_alert)} (Suppressed {suppressed_count} deals under 7-day cooldown)")

    # Initialize Telegram notifier
    notifier = TelegramNotifier()
    posted_count = 0

    if deals_to_alert:
        print(f"[*] Posting {len(deals_to_alert)} deal alerts...")
        now_ts = time.time()

        for idx, deal in enumerate(deals_to_alert, start=1):
            key = get_deal_key(deal)
            brand_str = f"[{deal['brand']}] " if deal.get('brand') else ""
            print(f"  [{idx}/{len(deals_to_alert)}] {brand_str}{deal['title'][:40]}... | {deal['discount']}% OFF | ₹{deal['fsp']} (MRP: ₹{deal['mrp']})")

            if args.dry_run:
                # Update cache in dry run without actually calling Telegram
                cache[key] = {
                    "timestamp": now_ts,
                    "fsp": deal.get("fsp"),
                    "mrp": deal.get("mrp"),
                    "discount": deal.get("discount"),
                    "title": deal.get("title")
                }
                posted_count += 1
            else:
                success = notifier.send_deal(deal)
                if success:
                    cache[key] = {
                        "timestamp": now_ts,
                        "fsp": deal.get("fsp"),
                        "mrp": deal.get("mrp"),
                        "discount": deal.get("discount"),
                        "title": deal.get("title")
                    }
                    posted_count += 1
                else:
                    print(f"      ❌ Failed to send alert for ASIN {deal['asin']}")

        # Save updated cache
        save_cache(cache, args.cache)
        print(f"[*] Cache saved to {args.cache} (Total entries: {len(cache)})")
    else:
        print("[*] No new or price-dropped deals to post this run.")

    duration = time.time() - start_time
    print("=" * 65)
    print(f"✨ Run completed in {duration:.1f}s | Found: {len(all_deals)} | Alerted: {posted_count} | Suppressed: {suppressed_count}")
    print("=" * 65)

if __name__ == "__main__":
    main()
