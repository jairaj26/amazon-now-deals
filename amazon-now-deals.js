/**
 * Amazon Now Deals Explorer (v2 - Hybrid /s Global Filter + Tez Category & Keyword API)
 *
 * Features:
 * - Global Deals Fetcher: Fetches all items across Amazon Now using server-side discount filters (/s?i=amazontez&srs=100147972031)
 * - Sidebar Discount Pills: 10%, 25%, 35%, 50%, 60%, 70% off (Defaults to 60% off)
 * - Keyword Search API fetcher: Search any keyword via Tez JSON API and filter by chosen discount
 * - Multi-Category Selection: Select up to 3 subcategories per fetch
 * - Zero hardcoded location/headers: Dynamically detects brandId and uses active session cookies
 * - Smart Brand Extraction: Infers brands from titles, product metadata, and dictionary
 * - Results Grid Tab: Filter by brand, category, search, and sort by discount/price
 */

(function () {
  'use strict';

  // Helper: Sleep / delay for rate limiting
  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  // Remove any previous instance of the FAB
  if (window.__aznowFab) {
    window.__aznowFab.remove();
  }

  // Dynamic Brand ID detection (no hardcoded fallback unless user is outside Tez)
  function detectBrandId() {
    var stored = sessionStorage.getItem('__aznowBrandId');
    if (stored) return stored;

    var sp = new URLSearchParams(location.search);
    var bId = sp.get('qcbrand') || sp.get('brandId') || sp.get('almBrandId');
    if (bId) return bId;

    var brandLink = document.querySelector('a[href*="brandId="], a[href*="qcbrand="], a[href*="almBrandId="]');
    if (brandLink) {
      var m = brandLink.href.match(/(?:brandId|qcbrand|almBrandId)=([^&]+)/);
      if (m && m[1]) return m[1];
    }

    var stateScripts = document.querySelectorAll('script[type="a-state"]');
    for (var i = 0; i < stateScripts.length; i++) {
      try {
        var txt = stateScripts[i].textContent || '';
        if (txt.indexOf('almBrandId') !== -1) {
          var parsed = JSON.parse(txt);
          if (parsed && parsed.almBrandId) return parsed.almBrandId;
        }
      } catch (e) {}
    }

    var htmlMatch = document.documentElement.innerHTML.match(/almBrandId['"&:=\s]+([A-Za-z0-9_-]{8,14})/);
    if (htmlMatch && htmlMatch[1]) return htmlMatch[1];

    return null;
  }

  var brandId = detectBrandId();
  if (brandId) {
    sessionStorage.setItem('__aznowBrandId', brandId);
  }

  function ensureBrandId() {
    if (!brandId) {
      brandId = detectBrandId() || prompt('Please enter your Amazon Now Brand ID (e.g. qqfsWw9RkO):');
      if (brandId) sessionStorage.setItem('__aznowBrandId', brandId);
    }
    return brandId;
  }

  // Auto-detect current search keyword from URL or input
  var initialKeyword = '';
  try {
    var sp = new URLSearchParams(location.search);
    initialKeyword = sp.get('searchKeyword') || sp.get('keyword') || sp.get('k') || '';
    if (!initialKeyword) {
      var domSearch = document.querySelector('input[type="search"], input[name="field-keywords"], input[name="k"]');
      if (domSearch && domSearch.value) {
        initialKeyword = domSearch.value.trim();
      }
    }
  } catch (e) {}

  // Amazon India Discount Refinement Node Map (rnid: 2665398031)
  var discountPillsData = [
    { pct: 10, node: '2665399031', label: '10%' },
    { pct: 25, node: '2665400031', label: '25%' },
    { pct: 35, node: '2665402031', label: '35%' },
    { pct: 50, node: '2665401031', label: '50%' },
    { pct: 60, node: '27060456031', label: '60%' },
    { pct: 70, node: '27060457031', label: '70%' }
  ];

  var selectedMinDiscount = 60; // Default to 60% off
  var selectedDiscountNode = '27060456031';
  var TEZ_SRS_NODE = '100147972031';

  // Mapping of category nodes requiring merch endpoint vs category endpoint
  var merchMap = {
    216450600031: 1 // Ice Cream Store
  };

  // Structured Categories & Subcategories
  var categoriesData = [
    {
      icon: '🌾',
      name: 'Grocery & Staples',
      subs: [
        ['Atta & Flours', '204870009031'],
        ['Rice & Grains', '204870014031'],
        ['Dals & Pulses', '204870007031'],
        ['Chana & Whole Pulses', '204870004031'],
        ['Cooking Oils & Ghee', '204870005031'],
        ['Olive & Premium Oils', '204870010031'],
        ['Spices & Masalas', '204870013031'],
        ['Salt & Sugar', '204870008031'],
        ['Poha & Daliya', '204870012031'],
        ['Soya Chunks', '204870016031'],
        ['Instant Noodles & Pasta', '219564344031']
      ]
    },
    {
      icon: '🥛',
      name: 'Dairy, Bread & Eggs',
      subs: [
        ['Fresh Milk', '204870018031'],
        ['Bread & Bakery', '204870003031'],
        ['Curd & Yogurt', '204870006031'],
        ['Paneer & Fresh Dairy', '204870011031'],
        ['Cheese & Butter', '204870015031'],
        ['Fresh Cream', '204870019031'],
        ['Dairy Whitener & Powder', '204924567031'],
        ['Plant & Coconut Milk', '204870001031']
      ]
    },
    {
      icon: '🍿',
      name: 'Snacks, Sweets & Treats',
      subs: [
        ['Chocolates', '204924526031'],
        ['Premium Chocolates', '204924531031'],
        ['Chips & Crisps', '204924530031'],
        ['Indian Namkeen', '215540425031'],
        ['Bhujia & Sev', '204924562031'],
        ['Wafers & Biscuits', '204924537031'],
        ['Kurkure & Extruded', '204924550031'],
        ['Popcorn', '204924539031'],
        ['Nachos & Mad Angles', '204924540031'],
        ['Sweets & Mithai', '204924552031'],
        ['Chikki & Peanut Treats', '204924571031'],
        ['Roasted Makhana', '204924555031'],
        ['Candies & Marshmallows', '204924572031'],
        ['Cakes & Brownies', '204924573031'],
        ['Chewing Gums & Mints', '204924561031'],
        ['Dry Fruits & Nuts', '204924525031'],
        ['Almonds & Cashews (Raw)', '204924569031']
      ]
    },
    {
      icon: '🥤',
      name: 'Beverages & Drinks',
      subs: [
        ['Cold Drinks & Sodas', '204924556031'],
        ['Tea (Leaf & Bags)', '204924559031'],
        ['Coffee (Instant & Filter)', '204924558031'],
        ['Fruit Juices & Nectars', '204924568031'],
        ['Milkshakes & Flavored Milk', '204870017031'],
        ['Lassi & Buttermilk', '204924557031'],
        ['Club Soda & Mixes', '204924563031'],
        ['Electrolytes & Energy Drinks', '205015903031']
      ]
    },
    {
      icon: '🍦',
      name: 'Ice Creams & Frozen',
      subs: [
        ['Gourmet Ice Cream Tubs', '216450650031'],
        ['Ice Cream Cones & Cornettos', '216450641031'],
        ['Ice Cream Sticks & Bars', '216450655031'],
        ['Ice Cubes & Party Ice', '216450649031'],
        ['Ice Cream Store', '216450600031']
      ]
    },
    {
      icon: '🧴',
      name: 'Personal Care & Beauty',
      subs: [
        ['Facial Cleansers & Face Wash', '204992615031'],
        ['Sunscreens (SPF)', '204992651031'],
        ['Face Serums & Treatments', '204992652031'],
        ['Face Creams & Moisturizers', '204992632031'],
        ['Bathing Soaps & Bars', '204992631031'],
        ['Body Wash & Shower Gel', '204992628031'],
        ['Body Lotions', '204992627031'],
        ['Hair Care & Shampoos', '204992645031'],
        ['Hair Growth Serums', '205015907031'],
        ['Men Grooming & Shaving', '204992619031'],
        ['Feminine Hygiene', '204992654031'],
        ['Makeup & Lipsticks', '204992616031']
      ]
    },
    {
      icon: '🪥',
      name: 'Oral Care & Health',
      subs: [
        ['Toothpaste', '205015906031'],
        ['Toothbrushes', '205015905031'],
        ['Mouthwash', '205015911031'],
        ['Teeth Whitening & Floss', '205015902031'],
        ['Whey & Plant Protein', '205015895031'],
        ['Nutrition Drinks (Ensure)', '205015896031'],
        ['Creatine Monohydrate', '205015912031'],
        ['Multivitamins & Supplements', '205015904031'],
        ['Condoms & Sexual Wellness', '205015909031'],
        ['Lubricants', '205015908031']
      ]
    },
    {
      icon: '🧹',
      name: 'Home Care & Cleaning',
      subs: [
        ['Liquid Detergent (Matic)', '204952379031'],
        ['Detergent Powders', '204952381031'],
        ['Detergent Bars', '204952380031'],
        ['Detergent Pods & Capsules', '204952375031'],
        ['Fabric Conditioners', '204952386031'],
        ['Fabric Whiteners (Vanish)', '204952385031'],
        ['Dishwash Gels & Bars', '204924564031'],
        ['Dishwasher Tablets & Salts', '204924565031'],
        ['Floor Cleaners (Lizol)', '204952368031'],
        ['Toilet Cleaners (Harpic)', '204952388031'],
        ['Bathroom Cleaners', '204952387031'],
        ['Glass & Machine Cleaners', '204952373031'],
        ['Antiseptic Liquids (Dettol)', '204952378031'],
        ['Puja Needs & Agarbatti', '204952383031'],
        ['Dog Food', '204952372031'],
        ['Cat Food', '204952374031']
      ]
    },
    {
      icon: '🍳',
      name: 'Kitchen & Home',
      subs: [
        ['Pressure Cookers', '206264740031'],
        ['Storage Containers', '206264741031'],
        ['Lunch Boxes & Tiffins', '206264742031'],
        ['Insulated Bottles & Flasks', '206264743031'],
        ['Fast Chargers & Cables', '205015892031'],
        ['Cloth Stands & Hangers', '204952370031']
      ]
    },
    {
      icon: '🥦',
      name: 'Fresh Produce & Meat',
      subs: [
        ['Fresh Vegetables', '218833871031'],
        ['Fresh Fruits', '218833884031'],
        ['Meat & Seafood', '218876203031']
      ]
    },
    {
      icon: '👶',
      name: 'Baby Care',
      subs: [
        ['Diapers & Baby Care', '211421666031']
      ]
    },
    {
      icon: '🌿',
      name: 'Paan Corner',
      subs: [
        ['Rolling Papers & Lighters', '219564338031']
      ]
    }
  ];

  // URL builders
  function buildGlobalSearchUrl(discNodeId, page) {
    return (
      'https://www.amazon.in/s?i=amazontez&srs=' +
      TEZ_SRS_NODE +
      '&bbn=' +
      TEZ_SRS_NODE +
      '&rh=n%3A' +
      TEZ_SRS_NODE +
      '%2Cp_n_pct-off-with-tax%3A' +
      discNodeId +
      '&s=pct-off-with-tax&dc&page=' +
      page
    );
  }

  function buildKeywordSearchUrl(keyword, discNodeId, page) {
    return (
      'https://www.amazon.in/s?i=amazontez&srs=' +
      TEZ_SRS_NODE +
      '&bbn=' +
      TEZ_SRS_NODE +
      '&k=' +
      encodeURIComponent(keyword) +
      '&rh=n%3A' +
      TEZ_SRS_NODE +
      '%2Cp_n_pct-off-with-tax%3A' +
      discNodeId +
      '&s=pct-off-with-tax&dc&page=' +
      page
    );
  }

  function buildCategoryUrl(nodeId, offset) {
    var endpoint = merchMap[nodeId] ? 'merch' : 'category';
    return (
      'https://www.amazon.in/tez/browse/' +
      endpoint +
      '?nodeId=' +
      nodeId +
      '&brandId=' +
      brandId +
      '&offset=' +
      offset
    );
  }

  function buildSearchUrl(keyword, offset) {
    return (
      'https://www.amazon.in/tez/browse/searchByKeyword?keyword=' +
      encodeURIComponent(keyword) +
      '&brandId=' +
      brandId +
      '&offset=' +
      offset +
      '&spellCorrectionDisabled=false'
    );
  }

  // Smart category inference based on title and dark-store metadata
  function inferCategory(title, wdgHint) {
    var t = (title || '').toLowerCase();
    var w = (wdgHint || '').toLowerCase();

    // 1. Pooja / Religious Needs (distinct priority)
    if (/\b(pooja|puja|agarbatti|incense|camphor|diya|havan|dhoop|chandan|kapoor|cotton\s*wicks?|batti|sambrani|gopuram|mangalam|holy)\b/i.test(t)) {
      return 'Pooja & Religious Needs';
    }

    // 2. Snacks, Sweets & Treats
    if (/\b(chocolate|chocolates|chips|namkeen|biscuit|biscuits|cookies|cookie|kurkure|sweets|mithai|chikki|popcorn|nachos|makhana|candies|candy|cake|cakes|brownie|dry\s*fruits|nuts|almonds|cashews|raisins|peanuts)\b/i.test(t)) {
      return 'Snacks, Sweets & Treats';
    }

    // 3. Dairy, Bread & Eggs
    if (/\b(milk|curd|yogurt|paneer|cheese|butter|bread|eggs?|fresh\s*cream|whipping\s*cream|cooking\s*cream|dairy\s*whitener)\b/i.test(t) || w.indexOf('dairy') !== -1) {
      return 'Dairy, Bread & Eggs';
    }

    // 4. Grocery & Staples
    if (/\b(atta|flour|rice|dal|dals|pulses|chana|cooking\s*oil|mustard\s*oil|sunflower\s*oil|refined\s*oil|ghee|salt|sugar|masala|spices|poha|daliya|soya|grains|besan|maida|sooji)\b/i.test(t) || w.indexOf('grocery') !== -1) {
      return 'Grocery & Staples';
    }

    // 5. Beverages & Drinks
    if (/\b(tea|coffee|juice|juices|coke|pepsi|cola|drink|drinks|soda|energy\s*drink|milkshake|lassi|buttermilk|squash|syrup)\b/i.test(t)) {
      return 'Beverages & Drinks';
    }

    // 6. Ice Creams & Frozen
    if (/\b(ice\s*cream|cornetto|kulfi|frozen)\b/i.test(t)) {
      return 'Ice Creams & Frozen';
    }

    // 7. Personal Care & Beauty
    if (/\b(shampoo|conditioner|soap|body\s*wash|face\s*wash|lotion|serum|sunscreen|cream|moisturiz|perfume|deodorant|deo|lipstick|kajal|makeup|skincare|hair|facial)\b/i.test(t) || w.indexOf('beauty') !== -1) {
      return 'Personal Care & Beauty';
    }

    // 8. Oral Care & Health
    if (/\b(toothpaste|toothbrush|mouthwash|protein|supplement|vitamins?|creatine|condom)\b/i.test(t)) {
      return 'Oral Care & Health';
    }

    // 9. Home Care & Cleaning
    if (/\b(detergent|liquid\s*wash|dishwash|cleaner|lizol|harpic|mop|broom|repellent|garbage\s*bags?|napkin|tissue|fabric|vanish|comfort|surf|aerial|tide)\b/i.test(t) || w.indexOf('home') !== -1) {
      return 'Home & Cleaning';
    }

    // 10. Kitchen & Dining
    if (/\b(cooker|chopper|bottle|flask|container|tiffin|pan|knife|kettle|plate|glass|mug|utensil|board)\b/i.test(t) || w.indexOf('kitchen') !== -1) {
      return 'Kitchen & Dining';
    }

    // 11. Electronics & Gadgets
    if (/\b(watch|smartwatch|cable|charger|earphones?|headphones?|mouse|keyboard|power\s*bank|adapter|battery|bulb|led|tech)\b/i.test(t) || w.indexOf('ce_') !== -1 || w.indexOf('pc_') !== -1) {
      return 'Electronics & Gadgets';
    }

    // 12. Luggage & Bags
    if (/\b(backpack|bag|suitcase|trolley|duffle|wallet|pouch)\b/i.test(t) || w.indexOf('luggage') !== -1) {
      return 'Luggage & Bags';
    }

    // 13. Baby Care
    if (/\b(diaper|diapers|baby\s*wipes?|baby\s*lotion|baby\s*wash|baby\s*oil)\b/i.test(t) || w.indexOf('baby') !== -1) {
      return 'Baby Care';
    }

    // Fallback: Clean WDG hint or 'General'
    if (w) {
      var cleanWdg = w.replace(/_display_on_website/g, '').replace(/_/g, ' ').trim();
      return cleanWdg.charAt(0).toUpperCase() + cleanWdg.slice(1);
    }

    return 'General Essentials';
  }

  // Extract brand from product data and title
  function extractBrand(title, y) {
    var rawBrand =
      (y && y.brand && (typeof y.brand === 'string' ? y.brand : (y.brand.name || y.brand.displayName || y.brand.text))) ||
      (y && y.brandName) ||
      (y && y.brandText) ||
      (y && y.byLine) ||
      (y && y.byline) ||
      (y && y.brandOrManufacturer) ||
      (y && y.manufacturer) ||
      (y && y.productOverview && y.productOverview.brand) ||
      (y && y.attributes && y.attributes.brand) ||
      '';

    if (typeof rawBrand === 'string' && rawBrand.trim()) {
      return rawBrand.replace(/^(by|brand:)\s+/i, '').trim();
    }

    if (y && y.extraProductDetails && Array.isArray(y.extraProductDetails)) {
      for (var i = 0; i < y.extraProductDetails.length; i++) {
        var epd = y.extraProductDetails[i];
        if (epd && (epd.id === 'manufacturer' || epd.id === 'brand') && typeof epd.value === 'string' && epd.value.trim()) {
          return epd.value.trim();
        }
      }
    }

    if (!title || typeof title !== 'string') return '';
    var t = title.trim();
    var tl = t.toLowerCase();

    var multiBrands = [
      'cadbury dairy milk',
      'surf excel',
      'coca-cola',
      'thums up',
      'tata sampann',
      'tata salt',
      'tata tea',
      'dairy milk',
      'red label',
      'mother dairy',
      'paper boat',
      'raw pressery',
      'too yumm',
      'real fruit',
      'b natural',
      'brooke bond',
      'taj mahal',
      'sleepy owl',
      'blue tokai',
      'the whole truth',
      'whole truth',
      'open secret',
      'yoga bar',
      'wingreens farms',
      "ching's secret",
      'chings secret',
      'top ramen',
      'wai wai',
      '24 mantra',
      'two brothers',
      'organic india',
      'forest essentials',
      'kama ayurveda',
      'the derma co',
      "dr. sheth's",
      'dr sheths',
      'plum goodness',
      'head & shoulders',
      "l'oreal paris",
      'loreal paris',
      'godrej no.1',
      'good knight',
      'all out',
      'muscleblaze',
      'muscle blaze',
      'optimum nutrition',
      'fast&up',
      'comfort after wash',
      'clinic plus',
      'country delight',
      'milky mist',
      'uncle chipps',
      'red bull',
      'mountain dew',
      'amazon basics',
      'amazon brand',
      'american tourister',
      'mother sparsh'
    ];

    for (var m = 0; m < multiBrands.length; m++) {
      var mb = multiBrands[m];
      if (tl.indexOf(mb) === 0) {
        return t.slice(0, mb.length).trim();
      }
    }

    var cleanTokens = t.split(/\s+/).filter(Boolean);
    if (cleanTokens.length === 0) return '';

    var first = cleanTokens[0];
    if (/^\d+%?$/.test(first) && cleanTokens.length > 1) {
      return first + ' ' + cleanTokens[1];
    }

    first = first.replace(/[,;:\-\.]*$/, '');
    return first;
  }

  // Parse product object from Tez API
  function parseProduct(y, defaultCat) {
    if (!y || !y.asin) return null;

    var disc = y.savings && y.savings.percentage ? parseInt(y.savings.percentage, 10) : 0;
    var bp = y.buyingPrice ? y.buyingPrice.amount : null;
    var lp = y.listPrice ? y.listPrice.amount : null;

    if (!disc && lp && bp && lp > bp) {
      disc = Math.round(((lp - bp) / lp) * 100);
    }

    var img =
      (y.heroImage && (y.heroImage.mediumResImageUrl || y.heroImage.lowResImageUrl || y.heroImage.highResImageUrl)) ||
      (y.productImages && y.productImages[0] && (y.productImages[0].lowResImageUrl || y.productImages[0].highResImageUrl)) ||
      '';

    var rawBrand = extractBrand(y.title, y);

    var categories = [];
    if (defaultCat && typeof defaultCat === 'string' && defaultCat.trim()) {
      categories.push(defaultCat.trim());
    } else {
      categories.push(inferCategory(y.title || '', ''));
    }

    return {
      t: y.title || '',
      a: y.asin,
      bp: bp,
      lp: lp,
      d: disc,
      img: img,
      pz: y.packSize || '',
      b: rawBrand,
      c: categories
    };
  }

  // Parse HTML page from Amazon Now Global Search (/s?i=amazontez)
  function parseHtmlSearchPage(htmlText) {
    var doc = new DOMParser().parseFromString(htmlText, 'text/html');
    var cards = doc.querySelectorAll('div[data-asin]:not([data-asin=""])[data-component-type="s-search-result"]');
    var parsed = [];

    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var asin = card.getAttribute('data-asin');
      if (!asin) continue;

      // Skip sponsored cards
      if (card.querySelector('.puis-sponsored-label-text, [data-component-type="sp-sponsored-result"]')) {
        continue;
      }

      var titleEl = card.querySelector('h2 span, h2 a span');
      if (!titleEl) continue;
      var title = titleEl.textContent.trim();
      if (!title) continue;

      var offerEl = card.querySelector('[data-csa-c-price-to-pay]');
      var bp = null;
      var lp = null;

      if (offerEl) {
        var bpAttr = offerEl.getAttribute('data-csa-c-price-to-pay');
        var lpAttr = offerEl.getAttribute('data-csa-c-strike-through-price');
        if (bpAttr) bp = parseFloat(bpAttr);
        if (lpAttr) lp = parseFloat(lpAttr);
      }

      if (bp === null || isNaN(bp)) {
        var priceTextEl = card.querySelector('.a-price:not([data-a-strike]) .a-offscreen');
        if (priceTextEl) bp = parseFloat(priceTextEl.textContent.replace(/[^\d.]/g, ''));
      }
      if (lp === null || isNaN(lp)) {
        var mrpTextEl = card.querySelector('.a-price[data-a-strike] .a-offscreen');
        if (mrpTextEl) lp = parseFloat(mrpTextEl.textContent.replace(/[^\d.]/g, ''));
      }

      if (bp === null || isNaN(bp)) continue;
      if (lp === null || isNaN(lp)) lp = bp;

      var disc = lp > bp ? Math.round(((lp - bp) / lp) * 100) : 0;
      if (!disc) {
        var discTextMatch = card.textContent.match(/\((\d+)%\s*off\)/i);
        if (discTextMatch) disc = parseInt(discTextMatch[1], 10);
      }

      var imgEl = card.querySelector('img.s-image');
      var img = imgEl ? (imgEl.getAttribute('src') || '') : '';

      var hintEl = card.querySelector('[data-wdg]');
      var wdgAttr = hintEl ? (hintEl.getAttribute('data-wdg') || '') : '';
      var cat = inferCategory(title, wdgAttr);

      parsed.push({
        t: title,
        a: asin,
        bp: bp,
        lp: lp,
        d: disc,
        img: img,
        pz: '',
        b: extractBrand(title, null),
        c: [cat]
      });
    }

    return {
      items: parsed,
      totalCards: cards.length
    };
  }

  // Open Results Tab with Full Grid & Filtering
  function openResultsTab(pageTitle, items) {
    items.sort(function (a, b) {
      return b.d - a.d;
    });

    var itemsJson = JSON.stringify(items).replace(/<\/script>/gi, '<\\/script>');

    var html =
      '<!DOCTYPE html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>' +
      pageTitle +
      ' — ' +
      items.length +
      ' Deals</title><style>' +
      '*{box-sizing:border-box;margin:0;padding:0}' +
      'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f4f6f8;color:#1a1a1a;padding:12px}' +
      '.header{background:#fff;padding:14px 16px;border-radius:8px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,.08);display:flex;flex-direction:column;gap:10px}' +
      '.header-top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}' +
      '.header-title{font-size:16px;font-weight:700;color:#0f1111}' +
      '.header-badge{background:#e8f0fe;color:#1a73e8;font-weight:600;font-size:12px;padding:4px 10px;border-radius:14px;white-space:nowrap}' +
      '.controls{display:flex;flex-wrap:wrap;align-items:center;gap:10px}' +
      '.search-wrap{flex:2;min-width:180px}' +
      '.search-wrap input{width:100%;padding:8px 12px;border:1px solid #d0d7de;border-radius:6px;font-size:13px;outline:none;background:#f9f9f9;font-family:inherit;transition:border-color .15s,background .15s}' +
      '.search-wrap input:focus{border-color:#1a73e8;background:#fff}' +
      '.filter-wrap,.sort-wrap{display:flex;align-items:center;gap:6px;flex:1;min-width:140px}' +
      '.filter-label,.sort-label{font-size:12px;font-weight:600;color:#555;white-space:nowrap}' +
      '.filter-wrap select,.sort-wrap select{width:100%;padding:8px 10px;border:1px solid #d0d7de;border-radius:6px;font-size:13px;background:#fff;color:#111;outline:none;cursor:pointer;font-family:inherit}' +
      '.filter-wrap select:focus,.sort-wrap select:focus{border-color:#1a73e8}' +
      '.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}' +
      '@media(max-width:1024px){.grid{grid-template-columns:repeat(4,1fr);gap:8px}}' +
      '@media(max-width:768px){' +
      'body{padding:8px}' +
      '.header{padding:10px 12px;margin-bottom:8px;gap:8px}' +
      '.header-title{font-size:14px}' +
      '.controls{flex-direction:column;align-items:stretch;gap:6px}' +
      '.search-wrap{min-width:100%}' +
      '.search-wrap input{padding:8px 10px;font-size:12px}' +
      '.filter-wrap,.sort-wrap{min-width:100%;justify-content:space-between}' +
      '.filter-wrap select,.sort-wrap select{flex:1;padding:7px 10px;font-size:12px}' +
      '.grid{grid-template-columns:repeat(3,1fr);gap:6px}' +
      '}' +
      '.card{display:flex;flex-direction:column;background:#fff;border-radius:8px;border:1px solid #e2e8f0;overflow:hidden;text-decoration:none;color:inherit;position:relative;transition:transform .15s,box-shadow .15s;cursor:pointer}' +
      '.card:hover{transform:translateY(-2px);box-shadow:0 4px 14px rgba(0,0,0,.12);border-color:#cbd5e1}' +
      '.img-wrap{width:100%;height:140px;background:#fafafa;position:relative;display:flex;align-items:center;justify-content:center;padding:8px;overflow:hidden}' +
      '@media(max-width:768px){.img-wrap{height:105px;padding:4px}}' +
      '.img-wrap img{max-width:100%;max-height:100%;object-fit:contain}' +
      '.discount-badge{position:absolute;top:6px;left:6px;background:#058552;color:#fff;border-radius:4px;box-shadow:0 2px 5px rgba(5,133,82,.35);z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:3px 6px;text-align:center;line-height:1}' +
      '.disc-pct{font-size:12px;font-weight:800;letter-spacing:-0.2px}' +
      '.disc-off{font-size:9px;font-weight:700;margin-top:1px;letter-spacing:0.2px;opacity:.95}' +
      '@media(max-width:768px){' +
      '.discount-badge{top:4px;left:4px;padding:2px 5px}' +
      '.disc-pct{font-size:10px}' +
      '.disc-off{font-size:8px}' +
      '}' +
      '.card-body{padding:8px 10px 10px;display:flex;flex-direction:column;flex:1;justify-content:space-between;gap:6px}' +
      '@media(max-width:768px){.card-body{padding:6px 6px 8px;gap:4px}}' +
      '.brand-name{font-size:10px;font-weight:700;color:#565959;text-transform:uppercase;letter-spacing:0.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '@media(max-width:768px){.brand-name{font-size:9px}}' +
      '.title{font-size:12px;font-weight:600;line-height:1.35;color:#0f1111;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;min-height:32px}' +
      '@media(max-width:768px){.title{font-size:11px;line-height:1.25;min-height:28px}}' +
      '.pack-size{font-size:11px;color:#565959;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '@media(max-width:768px){.pack-size{font-size:10px}}' +
      '.price-wrap{margin-top:auto;display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 6px}' +
      '.price{font-size:15px;font-weight:700;color:#0f1111}' +
      '@media(max-width:768px){.price{font-size:13px}}' +
      '.mrp{font-size:11px;color:#565959;text-decoration:line-through}' +
      '@media(max-width:768px){.mrp{font-size:10px}}' +
      '.no-results{text-align:center;padding:40px 20px;color:#666;font-size:14px;background:#fff;border-radius:8px;border:1px solid #e2e8f0}' +
      '</style></head><body>' +
      '<div class=header>' +
      '<div class=header-top>' +
      '<div class=header-title>' +
      pageTitle +
      '</div>' +
      '<div class=header-badge id=countBadge>' +
      items.length +
      ' items</div>' +
      '</div>' +
      '<div class=controls>' +
      '<div class=search-wrap><input type=search id=searchInput placeholder="Search deals..." autocomplete=off></div>' +
      '<div class=filter-wrap id=categorySelectWrap style="display:none;position:relative"><span class=filter-label>Categories:</span><button type=button id=catDropdownBtn style="padding:7px 10px;border:1px solid #d0d7de;border-radius:6px;font-size:12.5px;background:#fff;color:#111;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:space-between;gap:6px;min-width:140px"><span id=catBtnText>All Categories</span><span style="font-size:10px;color:#555">▼</span></button><div id=catDropdownPanel style="display:none;position:absolute;top:calc(100% + 4px);left:0;min-width:240px;max-width:320px;background:#fff;border:1px solid #cbd5e1;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.15);z-index:9999;flex-direction:column;overflow:hidden"><div style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:#f8fafc;border-bottom:1px solid #e2e8f0"><span style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase">Filter Categories</span><div style="display:flex;gap:8px"><button type=button id=catSelectAllBtn style="background:none;border:none;font-size:11px;font-weight:600;color:#1a73e8;cursor:pointer;padding:0">All</button><span style="color:#cbd5e1">|</span><button type=button id=catClearAllBtn style="background:none;border:none;font-size:11px;font-weight:600;color:#ef4444;cursor:pointer;padding:0">Clear</button></div></div><div id=catCheckboxesList style="max-height:220px;overflow-y:auto;padding:6px;display:flex;flex-direction:column;gap:3px"></div></div></div>' +
      '<div class=filter-wrap id=brandSelectWrap style="display:none"><span class=filter-label>Brand:</span><select id=brandSelect><option value="">All Brands</option></select></div>' +
      '<div class=sort-wrap><span class=sort-label>Sort:</span><select id=sortSelect><option value=discount-desc selected>Discount: High to Low</option><option value=price-asc>Price: Low to High</option><option value=price-desc>Price: High to Low</option></select></div>' +
      '</div>' +
      '</div>' +
      '<div id=grid class=grid></div>' +
      '<div id=noResults class=no-results style="display:none">No matching items found</div>' +
      '<script>' +
      'var rawItems = ' +
      itemsJson +
      ';' +
      'function esc(s){return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}' +
      'var brandCounts = {};' +
      'var catCounts = {};' +
      'rawItems.forEach(function(it){' +
      'if(it.b){brandCounts[it.b]=(brandCounts[it.b]||0)+1;}' +
      'if(it.c&&Array.isArray(it.c)){' +
      'it.c.forEach(function(c){if(c){catCounts[c]=(catCounts[c]||0)+1;}});' +
      '}else if(it.c&&typeof it.c==="string"&&it.c.trim()){' +
      'catCounts[it.c.trim()]=(catCounts[it.c.trim()]||0)+1;' +
      '}' +
      '});' +
      'var brands = Object.keys(brandCounts).sort(function(a,b){return a.localeCompare(b,undefined,{sensitivity:"base"});});' +
      'var categories = Object.keys(catCounts).sort(function(a,b){return a.localeCompare(b,undefined,{sensitivity:"base"});});' +
      'var brandWrap = document.getElementById("brandSelectWrap");' +
      'var brandSel = document.getElementById("brandSelect");' +
      'if(brands.length > 0){' +
      'brandWrap.style.display = "flex";' +
      'brands.forEach(function(b){' +
      'var opt = document.createElement("option");' +
      'opt.value = b;' +
      'opt.textContent = b + " (" + brandCounts[b] + ")";' +
      'brandSel.appendChild(opt);' +
      '});' +
      '}' +
      'var catWrap = document.getElementById("categorySelectWrap");' +
      'var catBtn = document.getElementById("catDropdownBtn");' +
      'var catBtnText = document.getElementById("catBtnText");' +
      'var catPanel = document.getElementById("catDropdownPanel");' +
      'var catListEl = document.getElementById("catCheckboxesList");' +
      'var selAllBtn = document.getElementById("catSelectAllBtn");' +
      'var clrAllBtn = document.getElementById("catClearAllBtn");' +
      'var selectedCats = new Set(categories);' +
      'catBtn.onclick = function(e){e.stopPropagation();catPanel.style.display=(catPanel.style.display==="flex"?"none":"flex");};' +
      'catPanel.onclick = function(e){e.stopPropagation();};' +
      'document.addEventListener("click",function(){catPanel.style.display="none";});' +
      'function updateCatBtnLabel(){' +
      'if(selectedCats.size===categories.length){catBtnText.textContent="All Categories ("+categories.length+")";}' +
      'else if(selectedCats.size===0){catBtnText.textContent="None Selected";}' +
      'else{catBtnText.textContent=selectedCats.size+" Categories";}' +
      '}' +
      'if(categories.length > 0){' +
      'catWrap.style.display = "flex";' +
      'categories.forEach(function(c){' +
      'var lbl=document.createElement("label");' +
      'lbl.style.cssText="display:flex;align-items:center;gap:7px;padding:4px 6px;border-radius:4px;cursor:pointer;font-size:12px;color:#1e293b;user-select:none;";' +
      'lbl.onmouseover=function(){lbl.style.background="#f1f5f9";};' +
      'lbl.onmouseout=function(){lbl.style.background="none";};' +
      'var cb=document.createElement("input");' +
      'cb.type="checkbox";' +
      'cb.value=c;' +
      'cb.checked=true;' +
      'cb.style.cssText="cursor:pointer;accent-color:#1a73e8;width:14px;height:14px;margin:0;";' +
      'cb.onchange=function(){' +
      'if(cb.checked){selectedCats.add(c);}else{selectedCats.delete(c);}' +
      'updateCatBtnLabel();' +
      'update();' +
      '};' +
      'var sp=document.createElement("span");' +
      'sp.textContent=c+" ("+catCounts[c]+")";' +
      'lbl.appendChild(cb);lbl.appendChild(sp);catListEl.appendChild(lbl);' +
      '});' +
      'updateCatBtnLabel();' +
      '}' +
      'selAllBtn.onclick=function(){' +
      'catListEl.querySelectorAll("input[type=checkbox]").forEach(function(cb){cb.checked=true;selectedCats.add(cb.value);});' +
      'updateCatBtnLabel();update();' +
      '};' +
      'clrAllBtn.onclick=function(){' +
      'catListEl.querySelectorAll("input[type=checkbox]").forEach(function(cb){cb.checked=false;});' +
      'selectedCats.clear();' +
      'updateCatBtnLabel();update();' +
      '};' +
      'function render(list){' +
      'var g=document.getElementById("grid");' +
      'var nr=document.getElementById("noResults");' +
      'if(!list.length){g.innerHTML="";nr.style.display="block";return;}' +
      'nr.style.display="none";' +
      'g.innerHTML=list.map(function(e){' +
      'var st=esc(e.t);' +
      'return "<a class=card href=\\"https://www.amazon.in/dp/"+e.a+"\\" target=_blank rel=noopener>"' +
      '+ "<div class=img-wrap>" + (e.d?"<div class=discount-badge><span class=disc-pct>"+e.d+"%</span><span class=disc-off>Off</span></div>":"")' +
      '+ "<img src=\\""+e.img+"\\" loading=lazy onerror=\\"this.remove()\\"></div>"' +
      '+ "<div class=card-body>"' +
      '+ (e.b?"<div class=brand-name>"+esc(e.b)+"</div>":"")' +
      '+ "<div class=title title=\\""+st+"\\">"+st+"</div>"' +
      '+ (e.pz?"<div class=pack-size>"+esc(e.pz)+"</div>":"")' +
      '+ "<div class=price-wrap>"+(e.bp!==null?"<span class=price>₹"+e.bp+"</span>":"")+(e.lp&&e.lp!==e.bp?"<span class=mrp>₹"+e.lp+"</span>":"")+"</div></div></a>";' +
      '}).join("");' +
      '}' +
      'function update(){' +
      'var q=(document.getElementById("searchInput").value||"").trim().toLowerCase();' +
      'var sm=document.getElementById("sortSelect").value;' +
      'var selBrand=brandSel.value;' +
      'var list=rawItems.filter(function(it){' +
      'if(q && (!it.t || it.t.toLowerCase().indexOf(q)===-1) && (!it.b || it.b.toLowerCase().indexOf(q)===-1)) return false;' +
      'if(selBrand && it.b!==selBrand) return false;' +
      'if(selectedCats.size < categories.length){' +
      'if(selectedCats.size === 0) return false;' +
      'var matched = false;' +
      'if(it.c && Array.isArray(it.c)){' +
      'for(var k=0; k<it.c.length; k++){' +
      'if(selectedCats.has(it.c[k])){matched=true;break;}' +
      '}' +
      '}else if(it.c && selectedCats.has(it.c)){matched=true;}' +
      'if(!matched) return false;' +
      '}' +
      'return true;' +
      '});' +
      'if(sm==="discount-desc"){list.sort(function(a,b){return b.d-a.d});}' +
      'else if(sm==="price-asc"){list.sort(function(a,b){return ((a.bp===null||a.bp===undefined)?1e9:a.bp)-((b.bp===null||b.bp===undefined)?1e9:b.bp);});}' +
      'else if(sm==="price-desc"){list.sort(function(a,b){return ((b.bp===null||b.bp===undefined)?-1:b.bp)-((a.bp===null||a.bp===undefined)?-1:a.bp);});}' +
      'render(list);' +
      'var cb=document.getElementById("countBadge");' +
      'var isFiltered=q||selBrand||(selectedCats.size<categories.length);' +
      'cb.textContent=isFiltered ? (list.length+" of "+rawItems.length+" items") : (list.length+" items");' +
      '}' +
      'document.getElementById("searchInput").addEventListener("input",update);' +
      'document.getElementById("sortSelect").addEventListener("change",update);' +
      'brandSel.addEventListener("change",update);' +
      'update();' +
      '<\/script></body></html>';

    var tab = window.open('', '_blank');
    if (tab) {
      tab.document.open();
      tab.document.write(html);
      tab.document.close();
    } else {
      alert('Popup blocked! Please allow popups for Amazon to view deals.');
    }
  }

  // Create UI Root Container
  var root = document.createElement('div');
  root.id = '__aznowFab';
  root.style.cssText =
    'position:fixed;bottom:16px;right:16px;z-index:9999999;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';

  // Popup Menu Panel
  var panel = document.createElement('div');
  panel.style.cssText =
    'display:flex;flex-direction:column;margin-bottom:10px;background:#ffffff;padding:14px;border-radius:12px;border:1px solid #d0d7de;box-shadow:0 12px 32px rgba(0,0,0,0.18),0 2px 6px rgba(0,0,0,0.08);width:360px;max-width:calc(100vw - 28px);height:86vh;max-height:720px;min-height:500px;box-sizing:border-box;';

  // Header inside Popup
  var hdr = document.createElement('div');
  hdr.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e2e8f0;padding-bottom:10px;margin-bottom:10px;';
  hdr.innerHTML =
    '<div style="display:flex;align-items:center;gap:6px;"><span style="font-size:16px;">⚡</span><span style="font-weight:700;font-size:14px;color:#0f1111;">Amazon Now Deals</span></div><div id="__aznowClose" style="cursor:pointer;font-size:18px;color:#64748b;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;line-height:1;transition:background .15s;">✕</div>';
  panel.appendChild(hdr);

  // Section 0: Discount Filter Pills (10%, 25%, 35%, 50%, 60%, 70%)
  var discSec = document.createElement('div');
  discSec.style.cssText = 'display:flex;flex-direction:column;gap:5px;margin-bottom:10px;';
  discSec.innerHTML =
    '<div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Min Discount Filter</div>';
  var pillRow = document.createElement('div');
  pillRow.style.cssText = 'display:grid;grid-template-columns:repeat(6,1fr);gap:4px;';
  var pillButtons = [];

  discountPillsData.forEach(function (pObj) {
    var b = document.createElement('button');
    b.textContent = pObj.label;
    b.__pct = pObj.pct;
    b.__node = pObj.node;
    b.style.cssText =
      'padding:6px 2px;border-radius:6px;font-size:11.5px;font-weight:700;cursor:pointer;border:1px solid #cbd5e1;transition:all .12s;touch-action:manipulation;';
    b.onclick = function () {
      selectedMinDiscount = pObj.pct;
      selectedDiscountNode = pObj.node;
      updateDiscountPillsUI();
      updateCategoryUI();
    };
    pillButtons.push(b);
    pillRow.appendChild(b);
  });
  discSec.appendChild(pillRow);
  panel.appendChild(discSec);

  // Section 0.5: Global Deals Fetch Button
  var globalBtn = document.createElement('button');
  globalBtn.style.cssText =
    'width:100%;padding:10px 12px;margin-bottom:10px;background:#058552;border:1px solid #046c42;border-radius:8px;font-size:12.5px;font-weight:700;color:#ffffff;cursor:pointer;text-align:center;box-shadow:0 2px 6px rgba(5,133,82,0.25);transition:all .15s;touch-action:manipulation;';
  panel.appendChild(globalBtn);

  var quickKwHdr = null;
  function updateDiscountPillsUI() {
    pillButtons.forEach(function (b) {
      var active = b.__pct === selectedMinDiscount;
      b.style.background = active ? '#058552' : '#f8fafc';
      b.style.color = active ? '#ffffff' : '#334155';
      b.style.borderColor = active ? '#046c42' : '#cbd5e1';
    });
    globalBtn.textContent = '🔥 Fetch All Store Deals (' + selectedMinDiscount + '%+ Off)';
    if (quickKwHdr) {
      quickKwHdr.textContent = '⚡ Quick Keywords (' + selectedMinDiscount + '%+ Off)';
    }
  }
  updateDiscountPillsUI();

  // Tab Navigation (Segmented Switcher)
  var tabNav = document.createElement('div');
  tabNav.style.cssText =
    'display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:10px;background:#f1f5f9;padding:3px;border-radius:8px;';
  var tabBtnKw = document.createElement('button');
  tabBtnKw.textContent = '🔍 By Keyword';
  tabBtnKw.style.cssText =
    'padding:7px 10px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;border:none;background:#2563eb;color:#ffffff;transition:all .15s;touch-action:manipulation;';
  var tabBtnCat = document.createElement('button');
  tabBtnCat.textContent = '📂 By Category';
  tabBtnCat.style.cssText =
    'padding:7px 10px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;border:none;background:transparent;color:#64748b;transition:all .15s;touch-action:manipulation;';
  tabNav.appendChild(tabBtnKw);
  tabNav.appendChild(tabBtnCat);
  panel.appendChild(tabNav);

  // Tab 1 Container: By Keyword
  var tabContentKw = document.createElement('div');
  tabContentKw.style.cssText =
    'display:flex;flex-direction:column;gap:10px;flex:1;min-height:0;overflow-y:auto;padding-right:2px;';

  // Keyword Search Input Row
  var searchSec = document.createElement('div');
  searchSec.style.cssText = 'display:flex;flex-direction:column;gap:5px;';
  searchSec.innerHTML =
    '<div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Search Any Product</div>' +
    '<div style="display:flex;gap:6px;">' +
      '<input type="text" id="__aznowKwInput" placeholder="e.g. atta, rice, sweets..." value="' +
      initialKeyword.replace(/"/g, '&quot;') +
      '" style="flex:1;min-width:0;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;outline:none;box-sizing:border-box;font-family:inherit;background:#f8fafc;transition:border-color .15s,background .15s;">' +
      '<button id="__aznowKwBtn" style="padding:8px 14px;background:#ffd814;border:1px solid #fcd200;border-radius:6px;font-size:12px;font-weight:700;color:#0f1111;cursor:not-allowed;text-align:center;box-sizing:border-box;touch-action:manipulation;opacity:0.5;white-space:nowrap;">Search</button>' +
    '</div>';
  tabContentKw.appendChild(searchSec);

  // Quick Keywords Grid
  var quickSec = document.createElement('div');
  quickSec.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:4px;';
  quickKwHdr = document.createElement('div');
  quickKwHdr.style.cssText =
    'font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;';
  quickKwHdr.textContent = '⚡ Quick Keywords (' + selectedMinDiscount + '%+ Off)';
  quickSec.appendChild(quickKwHdr);

  var quickGrid = document.createElement('div');
  quickGrid.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:6px;';
  var quickKeywords = [
    'Atta', 'Rice', 'Dal', 'Sweets',
    'Cooking Oil', 'Ghee', 'Biscuits', 'Chocolates',
    'Dry Fruits', 'Milk', 'Tea & Coffee', 'Snacks',
    'Detergent', 'Shampoo', 'Soap', 'Diapers'
  ];
  var quickKwButtons = [];

  quickKeywords.forEach(function (kw) {
    var btn = document.createElement('button');
    btn.textContent = kw;
    btn.style.cssText =
      'padding:8px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;font-size:11.5px;font-weight:600;color:#1e293b;cursor:pointer;text-align:center;transition:all .12s;touch-action:manipulation;';
    btn.onmouseover = function () {
      if (!btn.disabled) {
        btn.style.background = '#eff6ff';
        btn.style.borderColor = '#93c5fd';
        btn.style.color = '#1d4ed8';
      }
    };
    btn.onmouseout = function () {
      if (!btn.disabled) {
        btn.style.background = '#f8fafc';
        btn.style.borderColor = '#e2e8f0';
        btn.style.color = '#1e293b';
      }
    };
    btn.onclick = function () {
      handleKeywordSearch(kw);
    };
    quickKwButtons.push(btn);
    quickGrid.appendChild(btn);
  });
  quickSec.appendChild(quickGrid);
  tabContentKw.appendChild(quickSec);
  panel.appendChild(tabContentKw);

  // Tab 2 Container: By Category
  var tabContentCat = document.createElement('div');
  tabContentCat.style.cssText =
    'display:none;flex-direction:column;flex:1;min-height:0;overflow:hidden;';

  // Section Divider inside Category tab
  var divider = document.createElement('div');
  divider.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;padding:0 0 8px;';
  divider.innerHTML =
    '<span style="font-size:10.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Browse Categories</span>' +
    '<span style="font-size:10.5px;font-weight:600;color:#64748b;">Max 3 subcategories</span>';
  tabContentCat.appendChild(divider);

  // Scrollable Category List
  var list = document.createElement('div');
  list.style.cssText =
    'overflow-y:auto;flex:1;min-height:0;padding-right:4px;display:flex;flex-direction:column;gap:6px;margin:0 0 10px;-webkit-overflow-scrolling:touch;';
  tabContentCat.appendChild(list);

  // Footer Action Area inside Category tab
  var footerSec = document.createElement('div');
  footerSec.style.cssText =
    'display:flex;flex-direction:column;gap:8px;padding-top:10px;border-top:1px solid #e2e8f0;background:#fff;';

  var statusRow = document.createElement('div');
  statusRow.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;font-size:11.5px;color:#64748b;';
  statusRow.innerHTML =
    '<span>Selected: <strong id="__aznowSelCount" style="color:#0f1111;">0 / 3</strong></span>' +
    '<span id="__aznowClearBtn" style="color:#ef4444;cursor:pointer;font-weight:600;display:none;">Clear All</span>';
  footerSec.appendChild(statusRow);

  var fetchCatBtn = document.createElement('button');
  fetchCatBtn.style.cssText =
    'display:block;width:100%;padding:10px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;font-size:12.5px;font-weight:700;color:#94a3b8;cursor:not-allowed;text-align:center;box-sizing:border-box;touch-action:manipulation;transition:all .15s ease;';
  fetchCatBtn.textContent = 'Select up to 3 subcategories';
  fetchCatBtn.disabled = true;
  footerSec.appendChild(fetchCatBtn);
  tabContentCat.appendChild(footerSec);
  panel.appendChild(tabContentCat);

  function switchTab(mode) {
    if (mode === 'kw') {
      tabBtnKw.style.background = '#2563eb';
      tabBtnKw.style.color = '#ffffff';
      tabBtnKw.style.fontWeight = '700';
      tabBtnCat.style.background = 'transparent';
      tabBtnCat.style.color = '#64748b';
      tabBtnCat.style.fontWeight = '600';
      tabContentKw.style.display = 'flex';
      tabContentCat.style.display = 'none';
    } else {
      tabBtnCat.style.background = '#2563eb';
      tabBtnCat.style.color = '#ffffff';
      tabBtnCat.style.fontWeight = '700';
      tabBtnKw.style.background = 'transparent';
      tabBtnKw.style.color = '#64748b';
      tabBtnKw.style.fontWeight = '600';
      tabContentKw.style.display = 'none';
      tabContentCat.style.display = 'flex';
    }
  }

  tabBtnKw.onclick = function () { switchTab('kw'); };
  tabBtnCat.onclick = function () { switchTab('cat'); };

  // Main Floating Button (FAB)
  var fab = document.createElement('button');
  fab.innerHTML = '<span style="margin-right:4px;">⚡</span>Deals';
  fab.style.cssText =
    'background:#ffd814;border:1px solid #fcd200;border-radius:24px;padding:12px 20px;font-size:14px;font-weight:700;color:#0f1111;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.18);float:right;touch-action:manipulation;';
  fab.onclick = function () {
    panel.style.display = panel.style.display === 'none' || !panel.style.display ? 'flex' : 'none';
  };

  hdr.querySelector('#__aznowClose').onclick = function () {
    panel.style.display = 'none';
  };

  var kwInput = searchSec.querySelector('#__aznowKwInput');
  var kwBtn = searchSec.querySelector('#__aznowKwBtn');
  var clearBtn = statusRow.querySelector('#__aznowClearBtn');
  var selCount = statusRow.querySelector('#__aznowSelCount');

  var selectedCategories = [];
  var categoryCards = [];
  var subcategoryButtons = [];

  kwInput.onfocus = function () {
    kwInput.style.background = '#fff';
    kwInput.style.borderColor = '#1a73e8';
  };
  kwInput.onblur = function () {
    kwInput.style.background = '#f8fafc';
    kwInput.style.borderColor = '#cbd5e1';
  };

  // Dynamic state updater for Keyword Search Button
  function updateSearchUI() {
    var val = (kwInput.value || '').trim();
    if (val.length > 0) {
      kwBtn.disabled = false;
      kwBtn.style.opacity = '1';
      kwBtn.style.cursor = 'pointer';
      var preview = val.length > 10 ? val.slice(0, 10) + '...' : val;
      kwBtn.textContent = 'Search "' + preview + '" (' + selectedMinDiscount + '%+)';
    } else {
      kwBtn.disabled = true;
      kwBtn.style.opacity = '0.5';
      kwBtn.style.cursor = 'not-allowed';
      kwBtn.textContent = 'Search (' + selectedMinDiscount + '%+)';
    }
  }

  kwInput.addEventListener('input', updateSearchUI);
  updateSearchUI();

  // Dynamic state updater for Subcategory and Category UI
  function updateCategoryUI() {
    updateSearchUI();
    subcategoryButtons.forEach(function (btn) {
      var isSelected = selectedCategories.some(function (item) {
        return item.nodeId === btn.__nodeId;
      });
      if (isSelected) {
        btn.style.background = '#eff6ff';
        btn.style.borderColor = '#3b82f6';
        btn.style.color = '#1d4ed8';
        btn.style.fontWeight = '600';
        btn.querySelector('.chk').innerHTML =
          '<span style="display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;border-radius:4px;background:#2563eb;color:#fff;font-size:10.5px;font-weight:700;">✓</span>';
      } else {
        btn.style.background = '#ffffff';
        btn.style.borderColor = '#e2e8f0';
        btn.style.color = '#334155';
        btn.style.fontWeight = '400';
        btn.querySelector('.chk').innerHTML =
          '<span style="display:inline-block;width:15px;height:15px;border-radius:4px;border:1.5px solid #cbd5e1;background:#fff;box-sizing:border-box;"></span>';
      }
    });

    categoryCards.forEach(function (cardObj) {
      var group = cardObj.catGroup;
      var selectedInGroup = selectedCategories.filter(function (it) {
        return it.parentCat === group.name;
      }).length;
      if (selectedInGroup > 0) {
        cardObj.countBadge.style.display = 'inline-block';
        cardObj.countBadge.textContent = selectedInGroup;
        cardObj.header.style.color = '#1d4ed8';
      } else {
        cardObj.countBadge.style.display = 'none';
        cardObj.header.style.color = '#1e293b';
      }
    });

    selCount.textContent = selectedCategories.length + ' / 3';
    clearBtn.style.display = selectedCategories.length > 0 ? 'inline' : 'none';

    if (selectedCategories.length === 0) {
      fetchCatBtn.disabled = true;
      fetchCatBtn.style.background = '#f1f5f9';
      fetchCatBtn.style.borderColor = '#e2e8f0';
      fetchCatBtn.style.color = '#94a3b8';
      fetchCatBtn.style.cursor = 'not-allowed';
      fetchCatBtn.style.boxShadow = 'none';
      fetchCatBtn.textContent = 'Select up to 3 subcategories';
    } else {
      fetchCatBtn.disabled = false;
      fetchCatBtn.style.background = '#ffd814';
      fetchCatBtn.style.borderColor = '#fcd200';
      fetchCatBtn.style.color = '#0f1111';
      fetchCatBtn.style.cursor = 'pointer';
      fetchCatBtn.style.boxShadow = '0 2px 6px rgba(252,210,0,0.35)';
      fetchCatBtn.textContent =
        'Fetch ' +
        selectedCategories.length +
        ' Subcat (' +
        selectedMinDiscount +
        '%+ Off) →';
    }
  }

  clearBtn.onclick = function () {
    selectedCategories = [];
    updateCategoryUI();
  };

  // Populate UI with Categories & Subcategories
  categoriesData.forEach(function (catGroup) {
    var catCard = document.createElement('div');
    catCard.style.cssText =
      'display:flex;flex-direction:column;border:1px solid #e2e8f0;border-radius:8px;background:#fff;transition:border-color .15s;box-sizing:border-box;';

    var catHeader = document.createElement('button');
    catHeader.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#f8fafc;border:none;border-radius:7px;cursor:pointer;font-size:12.5px;font-weight:600;color:#1e293b;text-align:left;user-select:none;touch-action:manipulation;width:100%;box-sizing:border-box;transition:background .15s;';

    var titleSpan = document.createElement('span');
    titleSpan.style.cssText = 'display:flex;align-items:center;gap:6px;';
    titleSpan.innerHTML =
      '<span style="font-size:14px;">' +
      (catGroup.icon || '📦') +
      '</span><span>' +
      catGroup.name +
      '</span>';

    var rightArea = document.createElement('div');
    rightArea.style.cssText = 'display:flex;align-items:center;gap:6px;';

    var countBadge = document.createElement('span');
    countBadge.style.cssText =
      'display:none;background:#2563eb;color:#fff;font-size:10.5px;font-weight:700;padding:1px 7px;border-radius:10px;line-height:1.3;';

    var arrowSpan = document.createElement('span');
    arrowSpan.style.cssText = 'color:#94a3b8;font-size:11px;font-weight:700;';
    arrowSpan.textContent = '▸';

    rightArea.appendChild(countBadge);
    rightArea.appendChild(arrowSpan);
    catHeader.appendChild(titleSpan);
    catHeader.appendChild(rightArea);

    var subsContainer = document.createElement('div');
    subsContainer.style.cssText =
      'display:none;flex-direction:column;gap:4px;padding:8px 10px 10px;background:#fcfcfd;border-top:1px solid #f1f5f9;border-bottom-left-radius:7px;border-bottom-right-radius:7px;box-sizing:border-box;';

    var cardObj = {
      card: catCard,
      header: catHeader,
      container: subsContainer,
      arrow: arrowSpan,
      countBadge: countBadge,
      catGroup: catGroup
    };
    categoryCards.push(cardObj);

    catHeader.onclick = function () {
      var isOpen = subsContainer.style.display === 'flex';
      if (isOpen) {
        subsContainer.style.display = 'none';
        arrowSpan.textContent = '▸';
        catHeader.style.borderRadius = '7px';
        catCard.style.borderColor = '#e2e8f0';
      } else {
        categoryCards.forEach(function (other) {
          other.container.style.display = 'none';
          other.arrow.textContent = '▸';
          other.header.style.borderRadius = '7px';
          other.card.style.borderColor = '#e2e8f0';
        });
        subsContainer.style.display = 'flex';
        arrowSpan.textContent = '▾';
        catHeader.style.borderRadius = '7px 7px 0 0';
        catCard.style.borderColor = '#93c5fd';
        setTimeout(function () {
          catCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
      }
    };

    catGroup.subs.forEach(function (sub) {
      var subName = sub[0];
      var subNode = sub[1];
      var btn = document.createElement('button');
      btn.__nodeId = subNode;
      btn.__catName = subName;
      btn.__parentCat = catGroup.name;
      btn.style.cssText =
        'display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;background:#ffffff;text-align:left;font-size:12px;cursor:pointer;user-select:none;color:#334155;touch-action:manipulation;transition:all .12s ease;box-sizing:border-box;width:100%;';
      btn.innerHTML =
        '<span>' +
        subName +
        '</span><span class="chk" style="margin-left:6px;flex-shrink:0;"></span>';

      btn.onclick = function () {
        var idx = selectedCategories.findIndex(function (item) {
          return item.nodeId === subNode;
        });
        if (idx >= 0) {
          selectedCategories.splice(idx, 1);
        } else {
          if (selectedCategories.length >= 3) {
            alert('Maximum 3 subcategories allowed per fetch.');
            return;
          }
          selectedCategories.push({ name: subName, nodeId: subNode, parentCat: catGroup.name });
        }
        updateCategoryUI();
      };

      subcategoryButtons.push(btn);
      subsContainer.appendChild(btn);
    });

    catCard.appendChild(catHeader);
    catCard.appendChild(subsContainer);
    list.appendChild(catCard);
  });

  function setAllControlsDisabled(disabled) {
    globalBtn.disabled = disabled;
    globalBtn.style.opacity = disabled ? '0.7' : '1';
    globalBtn.style.cursor = disabled ? 'wait' : 'pointer';

    kwBtn.disabled = disabled;
    kwBtn.style.opacity = disabled ? '0.7' : (kwInput.value.trim() ? '1' : '0.5');
    kwBtn.style.cursor = disabled ? 'wait' : (kwInput.value.trim() ? 'pointer' : 'not-allowed');
    kwInput.disabled = disabled;

    fetchCatBtn.disabled = disabled;
    fetchCatBtn.style.opacity = disabled ? '0.7' : (selectedCategories.length ? '1' : '0.5');
    fetchCatBtn.style.cursor = disabled ? 'wait' : (selectedCategories.length ? 'pointer' : 'not-allowed');

    clearBtn.style.pointerEvents = disabled ? 'none' : 'auto';
    clearBtn.style.opacity = disabled ? '0.5' : '1';

    pillButtons.forEach(function (b) {
      b.disabled = disabled;
      b.style.opacity = disabled ? '0.6' : '1';
    });

    if (typeof quickKwButtons !== 'undefined' && Array.isArray(quickKwButtons)) {
      quickKwButtons.forEach(function (btn) {
        btn.disabled = disabled;
        btn.style.opacity = disabled ? '0.5' : '1';
        btn.style.cursor = disabled ? 'wait' : 'pointer';
      });
    }

    subcategoryButtons.forEach(function (btn) {
      btn.disabled = disabled;
      btn.style.opacity = disabled ? '0.5' : '1';
    });
    categoryCards.forEach(function (cardObj) {
      cardObj.header.disabled = disabled;
    });
  }

  // 1. Global Store Fetch Handler (/s?i=amazontez)
  globalBtn.onclick = async function () {
    setAllControlsDisabled(true);
    try {
      var seenAsins = {};
      var items = [];
      var page = 1;
      var MAX_PAGES = 15;
      var emptyStreak = 0;

      while (page <= MAX_PAGES) {
        var batchPages = [page];
        if (page + 1 <= MAX_PAGES) batchPages.push(page + 1);

        globalBtn.textContent =
          'Scanning P' + batchPages.join(', P') + ' (' + items.length + ' found)...';

        var results = await Promise.all(
          batchPages.map(function (p) {
            return fetch(buildGlobalSearchUrl(selectedDiscountNode, p), {
              credentials: 'include'
            })
              .then(function (r) {
                return r.ok ? r.text() : '';
              })
              .catch(function () {
                return '';
              });
          })
        );

        var stopLoop = false;
        for (var i = 0; i < results.length; i++) {
          var html = results[i];
          if (!html) {
            stopLoop = true;
            break;
          }
          var parsedPage = parseHtmlSearchPage(html);
          if (parsedPage.totalCards === 0) {
            stopLoop = true;
            break;
          }

          var addedOnPage = 0;
          for (var j = 0; j < parsedPage.items.length; j++) {
            var prod = parsedPage.items[j];
            if (prod.d >= selectedMinDiscount && !seenAsins[prod.a]) {
              seenAsins[prod.a] = 1;
              items.push(prod);
              addedOnPage++;
            }
          }

          if (addedOnPage === 0) {
            emptyStreak++;
            if (emptyStreak >= 2) {
              stopLoop = true;
              break;
            }
          } else {
            emptyStreak = 0;
          }
        }

        if (stopLoop) break;
        page += batchPages.length;
        await sleep(350);
      }

      openResultsTab('Amazon Now Global (' + selectedMinDiscount + '%+ Off)', items);
    } finally {
      setAllControlsDisabled(false);
      updateDiscountPillsUI();
      updateCategoryUI();
    }
  };

  // 2. Keyword Search Fetch Handler (System A: /s?i=amazontez with keyword and discount filter)
  async function handleKeywordSearch(kwOverride) {
    var kw = typeof kwOverride === 'string' ? kwOverride.trim() : (kwInput.value || '').trim();
    if (!kw) {
      kwInput.focus();
      return;
    }
    kwInput.value = kw;

    setAllControlsDisabled(true);

    try {
      var seenAsins = {};
      var items = [];
      var page = 1;
      var MAX_PAGES = 5;
      var emptyStreak = 0;

      while (page <= MAX_PAGES) {
        var batchPages = [page];
        if (page + 1 <= MAX_PAGES) batchPages.push(page + 1);

        kwBtn.textContent = 'P' + batchPages.join(', P') + ' (' + items.length + ')';

        var results = await Promise.all(
          batchPages.map(function (p) {
            return fetch(buildKeywordSearchUrl(kw, selectedDiscountNode, p), {
              credentials: 'include'
            })
              .then(function (r) {
                return r.ok ? r.text() : '';
              })
              .catch(function () {
                return '';
              });
          })
        );

        var stopLoop = false;
        for (var i = 0; i < results.length; i++) {
          var html = results[i];
          if (!html) {
            stopLoop = true;
            break;
          }
          var parsedPage = parseHtmlSearchPage(html);
          if (parsedPage.totalCards === 0) {
            stopLoop = true;
            break;
          }

          var addedOnPage = 0;
          for (var j = 0; j < parsedPage.items.length; j++) {
            var prod = parsedPage.items[j];
            if (prod.d >= selectedMinDiscount && !seenAsins[prod.a]) {
              seenAsins[prod.a] = 1;
              items.push(prod);
              addedOnPage++;
            }
          }

          if (addedOnPage === 0) {
            emptyStreak++;
            if (emptyStreak >= 2) {
              stopLoop = true;
              break;
            }
          } else {
            emptyStreak = 0;
          }
        }

        if (stopLoop) break;
        page += batchPages.length;
        await sleep(300);
      }

      openResultsTab('Search: "' + kw + '" (' + selectedMinDiscount + '%+ Off)', items);
    } finally {
      setAllControlsDisabled(false);
      updateDiscountPillsUI();
      updateSearchUI();
      updateCategoryUI();
    }
  }

  kwBtn.onclick = function () { handleKeywordSearch(); };
  kwInput.onkeydown = function (e) {
    if (e.key === 'Enter') {
      handleKeywordSearch();
    }
  };

  // 3. Category Fetch Handler
  fetchCatBtn.onclick = async function () {
    if (selectedCategories.length === 0) return;
    if (!ensureBrandId()) return;

    setAllControlsDisabled(true);

    try {
      var seenAsins = {};
      var items = [];
      var catNames = selectedCategories
        .map(function (item) {
          return item.name;
        })
        .join(' & ');

      var BATCH_SIZE = 2;

      for (var cIdx = 0; cIdx < selectedCategories.length; cIdx++) {
        var curCat = selectedCategories[cIdx];
        var offset = 0;
        var hasMore = true;
        var rateLimitCount = 0;

        while (hasMore && offset < 30) {
          var batchOffsets = [];
          for (var b = 0; b < BATCH_SIZE && offset + b < 30; b++) {
            batchOffsets.push(offset + b);
          }
          var pageLabels = batchOffsets
            .map(function (o) {
              return 'P' + (o + 1);
            })
            .join(', ');
          fetchCatBtn.textContent =
            '(' +
            (cIdx + 1) +
            '/' +
            selectedCategories.length +
            ') ' +
            curCat.name +
            ' ' +
            pageLabels +
            ' (' +
            items.length +
            ')';

          try {
            var promises = batchOffsets.map(function (curOffset) {
              return fetch(buildCategoryUrl(curCat.nodeId, curOffset), {
                credentials: 'include'
              })
                .then(function (res) {
                  if (res.status === 429) {
                    return { status: 429, offset: curOffset };
                  }
                  if (!res.ok) {
                    return { status: res.status, error: 'HTTP ' + res.status, offset: curOffset };
                  }
                  return res.json().then(function (json) {
                    return { status: 200, json: json, offset: curOffset };
                  });
                })
                .catch(function (err) {
                  return { error: err, offset: curOffset };
                });
            });

            var results = await Promise.all(promises);

            var has429 = results.some(function (r) {
              return r && r.status === 429;
            });
            if (has429) {
              if (++rateLimitCount > 3) {
                hasMore = false;
                break;
              }
              await sleep(4000 * rateLimitCount);
              continue;
            }
            rateLimitCount = 0;

            var batchHadItems = false;
            var shouldStop = false;

            for (var rIdx = 0; rIdx < results.length; rIdx++) {
              var resObj = results[rIdx];
              if (!resObj || resObj.error || !resObj.json || !resObj.json.data) {
                shouldStop = true;
                break;
              }

              var data = resObj.json.data;
              var widgets = data.widgets || [];
              var pageCount = 0;

              for (var w = 0; w < widgets.length; w++) {
                var prods = (widgets[w].data && widgets[w].data.products) || [];
                pageCount += prods.length;

                for (var p = 0; p < prods.length; p++) {
                  var prod = parseProduct(prods[p], curCat.name);
                  if (prod && prod.a && prod.d >= selectedMinDiscount) {
                    if (!seenAsins[prod.a]) {
                      seenAsins[prod.a] = prod;
                      items.push(prod);
                    } else {
                      var existing = seenAsins[prod.a];
                      if (curCat.name && existing.c && existing.c.indexOf(curCat.name) === -1) {
                        existing.c.push(curCat.name);
                      }
                    }
                  }
                }
              }

              if (pageCount === 0) {
                shouldStop = true;
                break;
              }

              batchHadItems = true;

              var meta = data.metadata || {};
              var more = meta.hasMoreWidgets !== undefined ? !!meta.hasMoreWidgets : true;
              if (!more) {
                shouldStop = true;
                break;
              }
            }

            if (shouldStop || !batchHadItems) {
              hasMore = false;
              break;
            }

            offset += batchOffsets.length;
            await sleep(600);
          } catch (err) {
            hasMore = false;
          }
        }
      }

      openResultsTab(catNames + ' (' + selectedMinDiscount + '%+ Off)', items);
    } finally {
      setAllControlsDisabled(false);
      selectedCategories = [];
      updateSearchUI();
      updateCategoryUI();
    }
  };

  root.appendChild(panel);
  root.appendChild(fab);
  document.body.appendChild(root);
  window.__aznowFab = root;
})();
