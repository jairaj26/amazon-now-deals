import argparse
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

DAY_SECONDS = 86400.0
WEEK_SECONDS = 7 * DAY_SECONDS

def load_cache(cache_path):
    """Loads previously posted deals state from cache."""
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_cache(cache, cache_path):
    """Saves posted deals state to cache, pruning records not seen in over 30 days."""
    os.makedirs(os.path.dirname(os.path.abspath(cache_path)), exist_ok=True)
    now = time.time()
    retention_period = 30 * DAY_SECONDS

    pruned = {}
    for key, record in cache.items():
        last_seen = record.get("last_seen_ts", record.get("timestamp", 0.0))
        if now - last_seen < retention_period:
            pruned[key] = record

    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(pruned, f, indent=2, ensure_ascii=False)

def main():
    parser = argparse.ArgumentParser(description="Amazon Now (Tez) Deals Scraper & Telegram Bot")
    parser.add_argument("--dry-run", action="store_true", default=config.DRY_RUN, help="Print deals without posting to Telegram")
    parser.add_argument("--brand-id", default=config.AMAZON_BRAND_ID, help="Target Amazon Now brandId (optional for /s global search)")
    parser.add_argument("--min-discount", type=int, default=config.MIN_DISCOUNT, help="Minimum discount percentage threshold")
    parser.add_argument("--cache", default=config.CACHE_FILE, help="Path to cache JSON file")
    args = parser.parse_args()

    start_time = time.time()
    now = start_time
    ist_now = datetime.now(IST)

    print("=" * 65)
    print("⚡ Amazon Now (Tez) Deals Finder - Global Scheduled Run")
    print(f"⏰ Current IST Time : {ist_now.strftime('%Y-%m-%d %H:%M:%S')} IST")
    print(f"🏪 Brand ID (Store) : {args.brand_id or '[Auto-resolved via Cookie]'}")
    print(f"🔥 Min Discount     : {args.min_discount}%")
    print(f"🛡️ Dry Run          : {'YES (Alerts disabled)' if args.dry_run else 'NO (Live Telegram posting)'}")

    # Inspect Cookie configuration
    cookie_str = config.AMAZON_COOKIE or ""
    has_session = "session-id=" in cookie_str or "; session-id=" in cookie_str
    has_ubid = "ubid-acbin=" in cookie_str or "; ubid-acbin=" in cookie_str

    if cookie_str:
        print(f"🍪 Cookie           : Configured ({len(cookie_str)} chars) [session-id: {'✓' if has_session else '✗'}, ubid: {'✓' if has_ubid else '✗'}]")
    else:
        print("⚠️ Warning: No AMAZON_COOKIE provided. Amazon may serve default pincode instead of your local dark store.")
    print("=" * 65)

    scraper = AmazonNowScraper(brand_id=args.brand_id, cookie_str=cookie_str)
    all_deals = scraper.fetch_global_deals(min_discount=args.min_discount)

    # Sort all collected deals by highest discount first
    all_deals.sort(key=lambda d: d.get("discount", 0), reverse=True)

    print("-" * 65)
    print(f"[*] Total unique qualifying deals found: {len(all_deals)}")

    # Load cache and apply deduplication state machine
    cache = load_cache(args.cache)
    print(f"[*] Loaded {len(cache)} existing records from cache ({args.cache})")

    deals_to_alert = []
    suppressed_count = 0

    for deal in all_deals:
        asin = deal.get("asin")
        if not asin:
            continue

        D = deal.get("discount", 0)
        cached = cache.get(asin)

        # Case 1: New ASIN (not in cache) OR Discount Changed (D != cached discount)
        if not cached or D != cached.get("discount"):
            trigger = "NEW_DEAL" if not cached else f"DISCOUNT_CHANGED ({cached.get('discount')}% -> {D}%)"
            deals_to_alert.append((deal, trigger))
        else:
            # Case 2: Same Discount as Previous Run
            cached["last_seen_ts"] = now

            # Rule A: Check active 7-day mute
            if now < cached.get("muted_until_ts", 0.0):
                suppressed_count += 1
                continue

            # Rule B: Check if previous 7-day mute just expired
            elif cached.get("muted_until_ts", 0.0) > 0.0 and now >= cached["muted_until_ts"]:
                deals_to_alert.append((deal, "MUTE_EXPIRED (7-Day Re-alert)"))

            # Rule C: Check if item remained at this exact discount for 1 full day (24h)
            elif (now - cached.get("streak_start_ts", now)) >= DAY_SECONDS:
                cached["muted_until_ts"] = now + WEEK_SECONDS
                suppressed_count += 1
                continue

            # Rule D: Within the same-day 24-hour hide window
            elif now < cached.get("hidden_until_ts", 0.0):
                suppressed_count += 1
                continue
            else:
                suppressed_count += 1

    print(f"[*] Deals to alert: {len(deals_to_alert)} | Suppressed: {suppressed_count}")

    # Initialize Telegram notifier
    notifier = TelegramNotifier()
    posted_count = 0

    if deals_to_alert:
        print(f"[*] Posting {len(deals_to_alert)} deal alerts to Telegram...")

        for idx, (deal, trigger) in enumerate(deals_to_alert, start=1):
            asin = deal["asin"]
            D = deal.get("discount", 0)
            brand_str = f"[{deal['brand']}] " if deal.get('brand') else ""
            print(f"  [{idx}/{len(deals_to_alert)}] ({trigger}) {brand_str}{deal['title'][:40]}... | {deal['discount']}% OFF | ₹{deal['fsp']} (MRP: ₹{deal['mrp']})")

            state_update = {
                "discount": D,
                "fsp": deal.get("fsp"),
                "mrp": deal.get("mrp"),
                "title": deal.get("title", ""),
                "streak_start_ts": now,
                "last_seen_ts": now,
                "last_posted_ts": now,
                "hidden_until_ts": now + DAY_SECONDS,
                "muted_until_ts": 0.0
            }

            if args.dry_run:
                cache[asin] = state_update
                posted_count += 1
            else:
                success = notifier.send_deal(deal)
                if success:
                    cache[asin] = state_update
                    posted_count += 1
                else:
                    print(f"      ❌ Failed to send Telegram alert for ASIN {asin}")

    # Unconditional cache save on every execution
    save_cache(cache, args.cache)
    print(f"[*] Cache state saved to {args.cache} (Total entries: {len(cache)})")

    duration = time.time() - start_time
    print("=" * 65)
    print(f"✨ Run completed in {duration:.1f}s | Scraped: {len(all_deals)} | Alerted: {posted_count} | Suppressed: {suppressed_count}")
    print("=" * 65)

if __name__ == "__main__":
    main()
