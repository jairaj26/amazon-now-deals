/**
 * Amazon Now Deals Explorer
 * 
 * A bookmarklet script that injects a floating deals menu on Amazon Now (Tez) pages,
 * allowing users to fetch and view deals sorted by highest discount percentage.
 * 
 * Features:
 * - Keyword Search API fetcher: Search any keyword (e.g. "sweets", "ice cream") and fetch all pages without DOM scrolling
 * - Multi-Category Selection: Select up to 2 categories per fetch
 * - Live keyword search / filter in the new tab
 * - Sort options: Discount (High to Low), Price (Low to High), Price (High to Low)
 * - Deduplicates products across categories / search pages by ASIN
 * - Displays deals in a responsive product card grid (5 columns desktop / 3 columns mobile)
 * - Highlights discount percentage badges clearly
 * - Clickable product cards opening straight to Amazon product pages
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

  // Detect brandId from sessionStorage, URL parameters, or links
  var brandId = sessionStorage.getItem('__aznowBrandId');
  if (!brandId) {
    var searchParams = new URLSearchParams(location.search);
    brandId = searchParams.get('qcbrand') || searchParams.get('brandId');
  }
  if (!brandId) {
    var brandLink = document.querySelector('a[href*="brandId="], a[href*="qcbrand="]');
    var match = brandLink ? brandLink.href.match(/(?:brandId|qcbrand)=([^&]+)/) : null;
    brandId = match ? match[1] : null;
  }
  if (!brandId) {
    brandId = prompt('Please enter your Amazon Now Brand ID (qcbrand / brandId):');
  }
  if (!brandId) {
    alert('No brandId found. Please run this script on an Amazon Now page.');
    return;
  }
  sessionStorage.setItem('__aznowBrandId', brandId);

  // Auto-detect current search keyword from URL or input
  var initialKeyword = '';
  try {
    var sp = new URLSearchParams(location.search);
    initialKeyword = sp.get('searchKeyword') || sp.get('keyword') || '';
    if (!initialKeyword) {
      var domSearch = document.querySelector('input[type="search"], input[name="field-keywords"]');
      if (domSearch && domSearch.value) {
        initialKeyword = domSearch.value.trim();
      }
    }
  } catch (e) {}

  // Mapping of category nodes requiring merch endpoint vs category endpoint
  var merchMap = {
    216450600031: 1 // Ice Cream Store
  };

  // Pre-configured category list
  var categoriesRaw =
    'Grocery~Atta Dal Rice,204870002031;Tea Coffee,204924535031;Cooking Oil,218876211031;Paan Corner,219564338031|' +
    'Kitchen~Kitchen Ess.,206264743031|' +
    'Snacks & Bev.~Beverages,204924538031;Chips & Namkeen,215540425031|' +
    'Dairy & Frozen~Dairy,204869998031;Ice Cream Store,216450600031|' +
    'Fresh Produce~Vegetables,218833871031;Fruits,218833884031;Meat & Seafood,218876203031|' +
    'Personal Care~Bath & Body,204992653031;Men Grooming,204992619031;Hair Care,204992645031;Feminine Care,204992654031;Oral Care,205015906031;Sexual Wellness,205015909031|' +
    'Home Care~Detergent,204952381031;Cleaners,204952388031|' +
    'Baby & Health~Baby Care,211421666031;Protein,205015896031';

  var categoryGroups = categoriesRaw.split('|').map(function (groupStr) {
    var parts = groupStr.split('~');
    return [
      parts[0],
      parts[1].split(';').map(function (sub) {
        return sub.split(',');
      })
    ];
  });

  // URL builders
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

  // Parse product object
  function parseProduct(y) {
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
    return {
      t: y.title || '',
      a: y.asin,
      bp: bp,
      lp: lp,
      d: disc,
      img: img,
      pz: y.packSize || ''
    };
  }

  // Render results in new tab
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
      '.search-wrap{flex:1;min-width:180px}' +
      '.search-wrap input{width:100%;padding:8px 12px;border:1px solid #d0d7de;border-radius:6px;font-size:13px;outline:none;background:#f9f9f9;font-family:inherit;transition:border-color .15s,background .15s}' +
      '.search-wrap input:focus{border-color:#1a73e8;background:#fff}' +
      '.sort-wrap{display:flex;align-items:center;gap:6px}' +
      '.sort-label{font-size:12px;font-weight:600;color:#555;white-space:nowrap}' +
      '.sort-wrap select{padding:8px 10px;border:1px solid #d0d7de;border-radius:6px;font-size:13px;background:#fff;color:#111;outline:none;cursor:pointer;font-family:inherit}' +
      '.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}' +
      '@media(max-width:1024px){.grid{grid-template-columns:repeat(4,1fr);gap:8px}}' +
      '@media(max-width:768px){' +
      'body{padding:8px}' +
      '.header{padding:10px 12px;margin-bottom:8px;gap:8px}' +
      '.header-title{font-size:14px}' +
      '.controls{flex-direction:column;align-items:stretch;gap:6px}' +
      '.search-wrap{min-width:100%}' +
      '.search-wrap input{padding:8px 10px;font-size:12px}' +
      '.sort-wrap{justify-content:space-between}' +
      '.sort-wrap select{flex:1;padding:7px 10px;font-size:12px}' +
      '.grid{grid-template-columns:repeat(3,1fr);gap:6px}' +
      '}' +
      '.card{display:flex;flex-direction:column;background:#fff;border-radius:8px;border:1px solid #e2e8f0;overflow:hidden;text-decoration:none;color:inherit;position:relative;transition:transform .15s,box-shadow .15s;cursor:pointer}' +
      '.card:hover{transform:translateY(-2px);box-shadow:0 4px 14px rgba(0,0,0,.12);border-color:#cbd5e1}' +
      '.img-wrap{width:100%;height:140px;background:#fafafa;position:relative;display:flex;align-items:center;justify-content:center;padding:8px;overflow:hidden}' +
      '@media(max-width:768px){.img-wrap{height:105px;padding:4px}}' +
      '.img-wrap img{max-width:100%;max-height:100%;object-fit:contain}' +
      '.discount-badge{position:absolute;top:6px;left:6px;background:#cc0c39;color:#fff;font-weight:800;font-size:12px;line-height:1;padding:4px 7px;border-radius:4px;box-shadow:0 2px 5px rgba(204,12,57,.35);z-index:2}' +
      '@media(max-width:768px){.discount-badge{top:4px;left:4px;font-size:10px;padding:3px 5px}}' +
      '.card-body{padding:8px 10px 10px;display:flex;flex-direction:column;flex:1;justify-content:space-between;gap:6px}' +
      '@media(max-width:768px){.card-body{padding:6px 6px 8px;gap:4px}}' +
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
      'function render(list){' +
      'var g=document.getElementById("grid");' +
      'var nr=document.getElementById("noResults");' +
      'if(!list.length){g.innerHTML="";nr.style.display="block";return;}' +
      'nr.style.display="none";' +
      'g.innerHTML=list.map(function(e){' +
      'var st=esc(e.t);' +
      'return "<a class=card href=\\"https://www.amazon.in/dp/"+e.a+"\\" target=_blank rel=noopener>"' +
      '+ "<div class=img-wrap>" + (e.d?"<div class=discount-badge>"+e.d+"% OFF</div>":"")' +
      '+ "<img src=\\""+e.img+"\\" loading=lazy onerror=\\"this.remove()\\"></div>"' +
      '+ "<div class=card-body><div class=title title=\\""+st+"\\">"+st+"</div>"' +
      '+ (e.pz?"<div class=pack-size>"+esc(e.pz)+"</div>":"")' +
      '+ "<div class=price-wrap>"+(e.bp!==null?"<span class=price>₹"+e.bp+"</span>":"")+(e.lp&&e.lp!==e.bp?"<span class=mrp>₹"+e.lp+"</span>":"")+"</div></div></a>";' +
      '}).join("");' +
      '}' +
      'function update(){' +
      'var q=(document.getElementById("searchInput").value||"").trim().toLowerCase();' +
      'var sm=document.getElementById("sortSelect").value;' +
      'var list=rawItems.filter(function(it){return !q || (it.t && it.t.toLowerCase().indexOf(q)>=0);});' +
      'if(sm==="discount-desc"){list.sort(function(a,b){return b.d-a.d});}' +
      'else if(sm==="price-asc"){list.sort(function(a,b){return ((a.bp===null||a.bp===undefined)?1e9:a.bp)-((b.bp===null||b.bp===undefined)?1e9:b.bp);});}' +
      'else if(sm==="price-desc"){list.sort(function(a,b){return ((b.bp===null||b.bp===undefined)?-1:b.bp)-((a.bp===null||a.bp===undefined)?-1:a.bp);});}' +
      'render(list);' +
      'var cb=document.getElementById("countBadge");' +
      'cb.textContent=q ? (list.length+" of "+rawItems.length+" items") : (list.length+" items");' +
      '}' +
      'document.getElementById("searchInput").addEventListener("input",update);' +
      'document.getElementById("sortSelect").addEventListener("change",update);' +
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
    'display:none;flex-direction:column;margin-bottom:8px;background:#fff;padding:12px;border-radius:10px;border:1px solid #d0d7de;box-shadow:0 8px 24px rgba(0,0,0,0.18);width:280px;max-width:calc(100vw - 32px);max-height:80vh;box-sizing:border-box;';

  // Header inside Popup
  var hdr = document.createElement('div');
  hdr.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #eee;padding-bottom:6px;margin-bottom:6px;';
  hdr.innerHTML =
    '<div style="font-weight:700;font-size:13px;color:#111">Amazon Now Deals</div><div id="__aznowClose" style="cursor:pointer;font-size:16px;color:#888;padding:0 6px;line-height:1">✕</div>';
  panel.appendChild(hdr);

  // Keyword Search Section
  var searchSec = document.createElement('div');
  searchSec.style.cssText = 'display:flex;flex-direction:column;gap:5px;margin-bottom:8px;';
  searchSec.innerHTML =
    '<div style="font-size:11px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.3px;">Search Keyword Deals</div>' +
    '<input type="text" id="__aznowKwInput" placeholder="e.g. sweets, chips, paneer..." value="' +
    initialKeyword.replace(/"/g, '&quot;') +
    '" style="width:100%;padding:7px 10px;border:1px solid #d0d7de;border-radius:6px;font-size:12px;outline:none;box-sizing:border-box;font-family:inherit;">' +
    '<button id="__aznowKwBtn" style="width:100%;padding:8px;background:#ffd814;border:1px solid #fcd200;border-radius:6px;font-size:12px;font-weight:700;color:#0f1111;cursor:pointer;text-align:center;box-sizing:border-box;touch-action:manipulation;">🔍 Fetch Keyword Deals</button>';
  panel.appendChild(searchSec);

  // Section Divider
  var divider = document.createElement('div');
  divider.style.cssText =
    'font-size:10px;font-weight:700;color:#888;text-transform:uppercase;text-align:center;margin:4px 0 6px;letter-spacing:0.5px;border-top:1px solid #eee;padding-top:6px;';
  divider.textContent = '— OR BY CATEGORY (MAX 2) —';
  panel.appendChild(divider);

  // Scrollable Category List
  var list = document.createElement('div');
  list.style.cssText =
    'overflow-y:auto;flex:1;max-height:36vh;padding-right:2px;display:flex;flex-direction:column;gap:3px;margin:2px 0 6px;-webkit-overflow-scrolling:touch;';
  panel.appendChild(list);

  // Fetch Category Action Button
  var fetchCatBtn = document.createElement('button');
  fetchCatBtn.style.cssText =
    'display:block;width:100%;padding:9px;background:#ffd814;border:1px solid #fcd200;border-radius:6px;font-size:12px;font-weight:700;color:#0f1111;cursor:not-allowed;text-align:center;box-sizing:border-box;opacity:0.5;touch-action:manipulation;';
  fetchCatBtn.textContent = 'Select 1 or 2 categories';
  fetchCatBtn.disabled = true;
  panel.appendChild(fetchCatBtn);

  // Main Floating Button (FAB)
  var fab = document.createElement('button');
  fab.textContent = 'Deals';
  fab.style.cssText =
    'background:#febd69;border:1px solid #f2a740;border-radius:20px;padding:12px 18px;font-size:14px;font-weight:700;color:#0f1111;cursor:pointer;box-shadow:0 3px 8px rgba(0,0,0,0.15);float:right;touch-action:manipulation;';
  fab.onclick = function () {
    panel.style.display = panel.style.display === 'none' || !panel.style.display ? 'flex' : 'none';
  };

  hdr.querySelector('#__aznowClose').onclick = function () {
    panel.style.display = 'none';
  };

  var kwInput = searchSec.querySelector('#__aznowKwInput');
  var kwBtn = searchSec.querySelector('#__aznowKwBtn');
  var selectedCategories = [];
  var categoryButtons = [];

  function updateCategoryUI() {
    categoryButtons.forEach(function (btn) {
      var isSelected = selectedCategories.some(function (item) {
        return item.nodeId === btn.__nodeId;
      });
      if (isSelected) {
        btn.style.background = '#e8f0fe';
        btn.style.borderColor = '#1a73e8';
        btn.style.color = '#1a73e8';
        btn.style.fontWeight = '700';
        btn.querySelector('.chk').textContent = '✓';
      } else {
        btn.style.background = '#f8f9fa';
        btn.style.borderColor = '#e2e8f0';
        btn.style.color = '#333';
        btn.style.fontWeight = '400';
        btn.querySelector('.chk').textContent = '';
      }
    });

    if (selectedCategories.length === 0) {
      fetchCatBtn.disabled = true;
      fetchCatBtn.style.opacity = '0.5';
      fetchCatBtn.style.cursor = 'not-allowed';
      fetchCatBtn.textContent = 'Select 1 or 2 categories';
    } else {
      fetchCatBtn.disabled = false;
      fetchCatBtn.style.opacity = '1';
      fetchCatBtn.style.cursor = 'pointer';
      fetchCatBtn.textContent = 'Fetch Deals (' + selectedCategories.length + ' selected)';
    }
  }

  // Populate UI with Categories
  categoryGroups.forEach(function (group) {
    var groupHeader = document.createElement('div');
    groupHeader.textContent = group[0];
    groupHeader.style.cssText =
      'font-size:11px;font-weight:700;color:#888;text-transform:uppercase;margin:5px 2px 2px;letter-spacing:0.3px;';
    list.appendChild(groupHeader);

    group[1].forEach(function (cat) {
      var catName = cat[0];
      var catNode = cat[1];
      var btn = document.createElement('button');
      btn.__nodeId = catNode;
      btn.__catName = catName;
      btn.style.cssText =
        'display:flex;align-items:center;justify-content:space-between;padding:7px 9px;min-height:32px;border:1px solid #e2e8f0;border-radius:6px;background:#f8f9fa;text-align:left;font-size:12px;cursor:pointer;user-select:none;color:#333;touch-action:manipulation;';
      btn.innerHTML =
        '<span>' +
        catName +
        '</span><span class="chk" style="color:#1a73e8;font-weight:bold;margin-left:4px"></span>';

      btn.onclick = function () {
        var idx = selectedCategories.findIndex(function (item) {
          return item.nodeId === catNode;
        });
        if (idx >= 0) {
          selectedCategories.splice(idx, 1);
        } else {
          if (selectedCategories.length >= 2) {
            alert('Maximum 2 categories allowed per fetch.');
            return;
          }
          selectedCategories.push({ name: catName, nodeId: catNode, btn: btn });
        }
        updateCategoryUI();
      };

      categoryButtons.push(btn);
      list.appendChild(btn);
    });
  });

  function setAllControlsDisabled(disabled) {
    kwBtn.disabled = disabled;
    kwBtn.style.opacity = disabled ? '0.7' : '1';
    kwBtn.style.cursor = disabled ? 'wait' : 'pointer';
    kwInput.disabled = disabled;
    fetchCatBtn.disabled = disabled;
    fetchCatBtn.style.opacity = disabled ? '0.7' : (selectedCategories.length ? '1' : '0.5');
    fetchCatBtn.style.cursor = disabled ? 'wait' : (selectedCategories.length ? 'pointer' : 'not-allowed');
    categoryButtons.forEach(function (btn) {
      btn.disabled = disabled;
      btn.style.opacity = disabled ? '0.5' : '1';
    });
  }

  // 1. Keyword Search Fetch Handler
  async function handleKeywordSearch() {
    var kw = kwInput.value.trim();
    if (!kw) {
      alert('Please enter a search keyword (e.g. sweets, chips, paneer)');
      kwInput.focus();
      return;
    }

    setAllControlsDisabled(true);

    try {
      var seenAsins = {};
      var items = [];
      var offset = 0;
      var hasMore = true;
      var page = 0;
      var rateLimitCount = 0;
      var emptyBatches = 0;

      while (hasMore && page < 30) {
        kwBtn.textContent = 'Searching "' + kw + '" (p.' + (page + 1) + ')... (' + items.length + ')';

        try {
          var res = await fetch(buildSearchUrl(kw, offset), {
            credentials: 'include'
          });

          if (res.status === 429) {
            if (++rateLimitCount > 3) {
              hasMore = false;
              break;
            }
            await sleep(4000 * rateLimitCount);
            continue;
          }

          rateLimitCount = 0;
          var json = await res.json();
          var data = json && json.data;
          if (!data) break;

          var searchResp = data.searchResponse || {};
          var prods = searchResp.products || (data.widgets && data.widgets[0] && data.widgets[0].data && data.widgets[0].data.products) || [];

          if (prods.length === 0) {
            emptyBatches++;
            if (emptyBatches >= 3) {
              hasMore = false;
              break;
            }
          } else {
            emptyBatches = 0;
          }

          for (var p = 0; p < prods.length; p++) {
            var prod = parseProduct(prods[p]);
            if (prod && prod.a && !seenAsins[prod.a]) {
              seenAsins[prod.a] = 1;
              items.push(prod);
            }
          }

          var meta = searchResp.metadata || data.metadata || {};
          hasMore = meta.hasMoreResults !== undefined ? !!meta.hasMoreResults : !!meta.hasMoreWidgets;
          offset = typeof meta.nextOffset === 'number' ? meta.nextOffset : offset + 1;
          page++;
          await sleep(800);
        } catch (err) {
          hasMore = false;
        }
      }

      openResultsTab('Search: "' + kw + '"', items);
    } finally {
      kwBtn.textContent = '🔍 Fetch Keyword Deals';
      setAllControlsDisabled(false);
      updateCategoryUI();
    }
  }

  kwBtn.onclick = handleKeywordSearch;
  kwInput.onkeydown = function (e) {
    if (e.key === 'Enter') {
      handleKeywordSearch();
    }
  };

  // 2. Category Fetch Handler
  fetchCatBtn.onclick = async function () {
    if (selectedCategories.length === 0) return;

    setAllControlsDisabled(true);

    try {
      var seenAsins = {};
      var items = [];
      var catNames = selectedCategories
        .map(function (item) {
          return item.name;
        })
        .join(' & ');

      for (var cIdx = 0; cIdx < selectedCategories.length; cIdx++) {
        var curCat = selectedCategories[cIdx];
        var offset = 0;
        var hasMore = true;
        var page = 0;
        var rateLimitCount = 0;
        var emptyBatches = 0;

        while (hasMore && page < 30) {
          fetchCatBtn.textContent =
            '(' +
            (cIdx + 1) +
            '/' +
            selectedCategories.length +
            ') ' +
            curCat.name +
            ' p.' +
            (page + 1) +
            ' (' +
            items.length +
            ')';

          try {
            var res = await fetch(buildCategoryUrl(curCat.nodeId, offset), {
              credentials: 'include'
            });

            if (res.status === 429) {
              if (++rateLimitCount > 3) {
                hasMore = false;
                break;
              }
              await sleep(4000 * rateLimitCount);
              continue;
            }

            rateLimitCount = 0;
            var json = await res.json();
            var data = json && json.data;
            if (!data) break;

            var widgets = data.widgets || [];
            var batchCount = 0;

            for (var w = 0; w < widgets.length; w++) {
              var prods = (widgets[w].data && widgets[w].data.products) || [];
              batchCount += prods.length;

              for (var p = 0; p < prods.length; p++) {
                var prod = parseProduct(prods[p]);
                if (prod && prod.a && !seenAsins[prod.a]) {
                  seenAsins[prod.a] = 1;
                  items.push(prod);
                }
              }
            }

            emptyBatches = batchCount === 0 ? emptyBatches + 1 : 0;
            if (emptyBatches >= 6) {
              hasMore = false;
              break;
            }

            var meta = data.metadata || {};
            hasMore = !!meta.hasMoreWidgets;
            offset = typeof meta.nextOffset === 'number' ? meta.nextOffset : offset + 1;
            page++;
            await sleep(800);
          } catch (err) {
            hasMore = false;
          }
        }
      }

      openResultsTab(catNames, items);
    } finally {
      setAllControlsDisabled(false);
      selectedCategories = [];
      updateCategoryUI();
    }
  };

  root.appendChild(panel);
  root.appendChild(fab);
  document.body.appendChild(root);
  window.__aznowFab = root;
})();
