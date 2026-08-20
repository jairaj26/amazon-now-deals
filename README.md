# ⚡ Amazon Now Deals Explorer

A lightweight, powerful browser bookmarklet that extracts and displays top deals on **Amazon Now (Tez)** sorted by the highest discount percentage in a clean, responsive product card grid.

---

## ✨ Features

- **Multi-Category Selection**: Select up to **2 categories** per fetch.
- **Live Keyword Search**: Instant search bar to filter products by name in real time.
- **Dynamic Sorting**: Sort deals on-the-fly by **Discount: High to Low** (default), **Price: Low to High**, or **Price: High to Low**.
- **Responsive Grid**:
  - 🖥️ **Desktop**: 5 columns
  - 📱 **Mobile**: 3 columns
- **High-Visibility Discount Badges**: Clear red badge displaying `-XX% OFF` overlaid on each product card.
- **1-Click Navigation**: The entire product card is clickable and links directly to the Amazon product page (`https://www.amazon.in/dp/{asin}`).
- **De-duplication**: Aggregates and deduplicates identical ASINs across multiple categories.
- **Safe & Private**: Runs directly in your browser using your active Amazon session. No credentials or personal data are stored or transmitted elsewhere.

---

## 🚀 Installation

You can install this bookmarklet using either the **Loader Bookmarklet** (auto-updates when this repository is updated) or the **Standalone Bookmarklet** (runs completely offline without external network dependencies).

### Option 1: Loader Bookmarklet (Recommended)

1. Create a new bookmark in your browser:
   - **Name**: `⚡ Amazon Now Deals`
   - **URL**: Paste the following script:

```javascript
javascript:(function(){var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/gh/jairaj26/amazon-now-deals@main/amazon-now-deals.js?t='+Date.now();document.body.appendChild(s);})();
```

> **Note**: Uses [jsDelivr CDN](https://www.jsdelivr.com/) for fast, cached global delivery. Updating `amazon-now-deals.js` in your `main` branch automatically delivers updates to your bookmarklet!

---

### Option 2: Standalone Bookmarklet (No External Scripts)

If your browser restricts external scripts via Content Security Policy (CSP), copy and paste the complete standalone script from [`amazon-now-deals-bookmarklet.txt`](amazon-now-deals-bookmarklet.txt) into your bookmark's URL.

---

## 📖 How to Use

1. Open [Amazon Now / Tez](https://www.amazon.in/now) in your web browser (Chrome, Edge, Safari, Firefox, or mobile browsers).
2. Click your **`⚡ Amazon Now Deals`** bookmark.
3. A floating **"Deals"** button will appear at the bottom right.
4. Click **"Deals"** to open the category menu:
   - Tap **1 or 2 categories** to select them (`✓`).
   - Click the **"Fetch Deals"** button.
5. A new tab will open with the complete, sorted grid of deals!

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
