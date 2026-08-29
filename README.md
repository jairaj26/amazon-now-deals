# ⚡ Amazon Now Deals Explorer

A lightweight, powerful browser bookmarklet that extracts and displays top deals on **Amazon Now (Tez)** sorted by the highest discount percentage in a clean, responsive product card grid.

---

## ✨ Features

- **Instant Keyword Search Deals**: Type any keyword (e.g. *"sweets"*, *"chips"*, *"paneer"*) to automatically fetch, paginate, and sort all matching results across all pages without manual DOM scrolling.
- **Multi-Category Selection**: Select up to **2 categories** per fetch.
- **In-Page Live Search & Filter**: Instant search bar in the results tab to filter products by title or brand in real time.
- **Brand & Category Dropdown Filters**: Filter deals dynamically by specific brands and categories with real-time deal count badges.
- **Dynamic Sorting**: Sort deals on-the-fly by **Discount: High to Low** (default), **Price: Low to High**, or **Price: High to Low**.
- **Responsive Grid**:
  - 🖥️ **Desktop**: 5 columns
  - 📱 **Mobile**: 3 columns
- **High-Visibility Green Discount Badges**: Two-line green badge (`55%` / `Off`) clearly overlaid on each product card.
- **1-Click Navigation**: The entire product card is clickable and links directly to the Amazon product page (`https://www.amazon.in/dp/{asin}`).
- **De-duplication**: Aggregates and deduplicates identical ASINs across multiple categories / search pages.
- **Safe & Private**: Runs directly in your browser using your active Amazon session. No credentials or personal data are stored or transmitted elsewhere.

---

## 🚀 Installation & Setup

Choose your device below for easy step-by-step setup:

### 💻 On PC / Mac (Chrome, Edge, Brave, Safari, Firefox)
1. Show your Bookmarks bar (`Ctrl + Shift + B` on Windows or `Cmd + Shift + B` on Mac).
2. Right-click the bookmarks bar and click **"Add page..."** or **"Add bookmark"**.
3. Set the **Name** to: `⚡ Amazon Deals`
4. In the **URL / Address** field, copy and paste this code:
```javascript
javascript:(function(){var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/gh/jairaj26/amazon-now-deals@main/amazon-now-deals.js?t='+Date.now();document.body.appendChild(s);})();
```
5. Click **Save**.

---

### 📱 On Mobile (Android / iPhone)

#### **Google Chrome (Android / iOS)**:
1. Bookmark any webpage you are currently on by tapping the **Three dots (⋮)** > **Star (⭐)**.
2. Tap **Edit** (or go to **Bookmarks** > find the bookmark > tap **⋮** > **Edit**).
3. Change the **Name** to: `⚡ Amazon Deals`
4. Delete the URL and paste the script code from above into the **URL** field.
5. Tap the back arrow to save.

#### **Safari (iPhone / iPad)**:
1. Bookmark this page or any webpage (tap the **Share icon** > **Add Bookmark** > **Save**).
2. Open your bookmarks list (tap the **Book icon**), tap **Edit** at the bottom.
3. Tap the bookmark you just created:
   - Change the name to `⚡ Amazon Deals`.
   - Clear the URL and paste the script code from above.
4. Tap **Done**.

---

## 📖 How to Use

1. Open your web browser (Chrome, Safari, Edge, Brave, etc.) and go to:
   ```
   https://www.amazon.in/tez/browse/home
   ```
   > 📱 **Note for Mobile Users**: Copy the link above and paste it directly into your mobile browser's address bar. Do not tap it as a clickable link, as your phone may open the Amazon mobile app instead of the web browser.

2. Run the bookmarklet:
   - **On PC**: Click `⚡ Amazon Deals` on your bookmarks bar.
   - **On Mobile Chrome**: Tap the address bar, type `Amazon Deals`, and tap the bookmark result with the ⭐ star icon.
   - **On Mobile Safari**: Open your bookmarks menu and tap `⚡ Amazon Deals`.

3. A floating yellow **"Deals"** button will appear in the bottom-right corner.
4. Click **"Deals"**:
   - **Search Any Product**: Type a keyword (e.g. *sweets*, *chips*, *milk*) and click **"Search Deals"** to fetch all pages of deals automatically without scrolling.
   - **Browse Categories**: Select 1 or 2 categories (`✓`) and click **"Fetch Deals"**.
5. A new tab will open displaying all available deals sorted by the highest discount percentage!

---

## 📂 Repository Structure

- [`amazon-now-deals.js`](amazon-now-deals.js) - Full, readable, and documented developer source code.
- [`amazon-now-deals-bookmarklet.txt`](amazon-now-deals-bookmarklet.txt) - Standalone minified bookmarklet code.
- [`loader-bookmarklet.txt`](loader-bookmarklet.txt) - 1-line bookmarklet loader template.
- [`README.md`](README.md) - Project documentation.

---

## 🛠️ Adding / Customizing Categories

To add or modify categories, edit the `categoriesRaw` string in [`amazon-now-deals.js`](amazon-now-deals.js):

```javascript
// Format: "Group Name~Subcategory Name,NodeId;Subcategory2,NodeId2|Group2~..."
var categoriesRaw =
  'Grocery~Atta Dal Rice,204870002031;Tea Coffee,204924535031|' +
  'Snacks & Bev.~Beverages,204924538031;Chips & Namkeen,215540425031';
```

---

## 📄 License

MIT License. Free to use, modify, and distribute.
