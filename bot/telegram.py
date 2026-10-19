import html
import json
import time
import urllib.parse
import urllib.request
import ssl
from . import config

ctx = ssl.create_default_context()

class TelegramNotifier:
    def __init__(self, bot_token=None, chat_id=None):
        self.bot_token = (bot_token or config.TELEGRAM_BOT_TOKEN).strip()
        self.chat_id = (chat_id or config.TELEGRAM_CHAT_ID).strip()
        self.base_url = f"https://api.telegram.org/bot{self.bot_token}"

    @property
    def is_configured(self):
        return bool(self.bot_token and self.chat_id)

    def format_deal_block(self, deal):
        """
        Formats a single deal block according to user spec:
        Title
        Category
        🔥 <Discount>% OFF || ₹<Price> (MRP: ₹<MRP>) || Click here
        """
        title = html.escape((deal.get("title") or "Product").strip())
        category = html.escape((deal.get("category") or "").strip())
        fsp = deal.get("fsp", 0)
        mrp = deal.get("mrp", fsp)
        disc = deal.get("discount", 0)
        link = deal.get("url") or deal.get("link") or "https://www.amazon.in"

        price_part = f"₹{fsp}"
        if mrp and mrp > fsp:
            price_part += f" (MRP: <strike>₹{mrp}</strike>)"

        lines = [
            f"<b>{title}</b>",
            f"<i>{category}</i>" if category else "",
            f"🔥 <b>{disc}% OFF</b> || <b>{price_part}</b> || <a href=\"{link}\">Click here</a>"
        ]
        return "\n".join([line for line in lines if line])

    def format_deal_message(self, deal):
        """Formats a single deal as a standalone message (backward compatibility)."""
        return self.format_deal_block(deal)

    def send_deal(self, deal):
        """Sends a single deal alert to Telegram (backward compatibility)."""
        if not self.is_configured:
            print("  [Telegram] Not configured (missing bot token or chat ID). Skipping alert.")
            return False

        message = self.format_deal_block(deal)
        success = self._send_text(message)
        time.sleep(1.0)
        return success

    def send_deals_batch(self, deals, min_discount=60):
        """
        Batches multiple deals into compact digest messages up to Telegram's 4096 char limit.
        Returns a list of ASINs that were successfully sent.
        """
        if not self.is_configured:
            print("  [Telegram] Not configured (missing bot token or chat ID). Skipping alerts.")
            return []

        if not deals:
            return []

        max_items_per_msg = getattr(config, "MAX_ITEMS_PER_MESSAGE", 10)
        max_chars_per_msg = 3600  # Safe headroom below 4096

        batches = []
        current_batch = []
        current_len = 0

        for deal in deals:
            block = self.format_deal_block(deal)
            block_len = len(block) + 2  # Double newline separator
            if current_batch and (current_len + block_len > max_chars_per_msg or len(current_batch) >= max_items_per_msg):
                batches.append(current_batch)
                current_batch = [deal]
                current_len = block_len
            else:
                current_batch.append(deal)
                current_len += block_len

        if current_batch:
            batches.append(current_batch)

        total_batches = len(batches)
        print(f"  [Telegram] Grouped {len(deals)} deals into {total_batches} batched message(s)...")

        successful_asins = []

        for b_idx, batch in enumerate(batches, start=1):
            blocks = [self.format_deal_block(d) for d in batch]
            message_text = "\n\n".join(blocks)

            print(f"  [Telegram] Sending batch {b_idx}/{total_batches} ({len(batch)} items, {len(message_text)} chars)...")
            success = self._send_text(message_text)
            if success:
                for d in batch:
                    asin = d.get("asin")
                    if asin:
                        successful_asins.append(asin)
            else:
                print(f"  ❌ Failed to send Telegram batch {b_idx}/{total_batches}")

            if b_idx < total_batches:
                time.sleep(1.5)

        return successful_asins

    def _send_text(self, text):
        url = f"{self.base_url}/sendMessage"
        payload = {
            "chat_id": self.chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True
        }
        try:
            data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, context=ctx, timeout=12) as res:
                res_data = json.loads(res.read().decode("utf-8"))
                return res_data.get("ok", False)
        except Exception as e:
            print(f"  [Telegram Error] {e}")
            return False
