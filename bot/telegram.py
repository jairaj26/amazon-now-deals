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

    def format_deal_message(self, deal):
        """Formats a deal into a clean text message with HTML markup."""
        title = html.escape(deal.get("title") or "Product")
        brand = html.escape(deal.get("brand") or "").strip()
        pack = html.escape(deal.get("pack_size") or "").strip()
        fsp = deal.get("fsp", 0)
        mrp = deal.get("mrp", fsp)
        disc = deal.get("discount", 0)
        link = deal.get("link", "https://www.amazon.in")
        category = html.escape(deal.get("category") or "").strip()

        header = f"<b>{f'[{brand}] ' if brand else ''}{title}</b>"
        if pack:
            header += f"\n📦 <i>{pack}</i>"

        lines = [
            header,
            f"🔥 <b>{disc}% OFF</b>",
            f"💰 <b>₹{fsp}</b>" + (f" (MRP: <strike>₹{mrp}</strike>)" if mrp and mrp != fsp else ""),
            f"🏷️ <i>{category}</i>" if category else "",
            "",
            f"👉 <a href=\"{link}\">Buy on Amazon Now</a>"
        ]
        # Filter out empty lines
        return "\n".join([line for line in lines if line is not None])

    def send_deal(self, deal):
        """Sends a deal alert to Telegram with link previews disabled."""
        if not self.is_configured:
            print("  [Telegram] Not configured (missing bot token or chat ID). Skipping alert.")
            return False

        message = self.format_deal_message(deal)
        success = self._send_text(message)

        # Respect Telegram rate limit (~30 msgs/min per chat)
        time.sleep(1.0)
        return success

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
            with urllib.request.urlopen(req, context=ctx, timeout=10) as res:
                res_data = json.loads(res.read().decode("utf-8"))
                return res_data.get("ok", False)
        except Exception as e:
            print(f"  [Telegram Error] {e}")
            return False
