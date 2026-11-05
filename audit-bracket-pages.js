/**
 * Amazon Now Price Bracket Quick Inspector (Page 1 Only)
 * Detects total items from mobile "Show X results" and desktop "of X results"
 * Total time: ~1.5 seconds (5 requests).
 */
(async function () {
  'use strict';

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
    return '';
  }

  var brandId = detectBrandId();
  var TEZ_SRS_NODE = '100147972031';
  var DISC_NODE_70 = '27060457031'; // 70%+ off node

  var priceBrackets = [
    { label: 'Under ₹50', facet: '0-5000' },
    { label: '₹50 – ₹100', facet: '5000-10000' },
    { label: '₹100 – ₹200', facet: '10000-20000' },
    { label: '₹200 – ₹500', facet: '20000-50000' },
    { label: 'Above ₹500', facet: '50000-' }
  ];

  function buildUrl(facet) {
    var rh = 'n%3A' + TEZ_SRS_NODE + '%2Cp_n_pct-off-with-tax%3A' + DISC_NODE_70 + '%2Cp_36%3A' + facet;
    var alm = brandId ? '&almBrandId=' + encodeURIComponent(brandId) : '';
    return (
      'https://www.amazon.in/s?i=amazontez&srs=' +
      TEZ_SRS_NODE +
      '&bbn=' +
      TEZ_SRS_NODE +
      '&rh=' +
      rh +
      '&s=pct-off-with-tax' +
      alm +
      '&dc&page=1'
    );
  }

  // Create UI overlay
  var existing = document.getElementById('__azAuditOverlay');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = '__azAuditOverlay';
  overlay.style.cssText =
    'position:fixed;top:20px;right:20px;width:450px;max-width:calc(100vw - 40px);background:#ffffff;border:2px solid #058552;border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,0.25);z-index:9999999;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:16px;box-sizing:border-box;max-height:90vh;overflow-y:auto;';

  overlay.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;">' +
    '<div><div style="font-weight:700;font-size:15px;color:#0f1111;">⚡ Amazon Now Price Bracket Inspector</div>' +
    '<div style="font-size:11px;color:#64748b;">Instant Page 1 Scan (70%+ Off)</div></div>' +
    '<button id="__azAuditClose" style="border:none;background:none;font-size:18px;cursor:pointer;color:#64748b;">✕</button>' +
    '</div>' +
    '<div id="__azAuditStatus" style="font-size:12px;color:#058552;font-weight:600;margin-bottom:10px;">Checking 5 price brackets...</div>' +
    '<table style="width:100%;border-collapse:collapse;font-size:12px;text-align:left;">' +
    '<thead><tr style="background:#f1f5f9;color:#334155;border-bottom:1px solid #cbd5e1;">' +
    '<th style="padding:6px 8px;">Price Tier</th><th style="padding:6px 6px;text-align:center;">Total Items</th><th style="padding:6px 6px;text-align:center;">Cards on P1</th><th style="padding:6px 6px;text-align:center;">Total Pages</th>' +
    '</tr></thead><tbody id="__azAuditRows"></tbody></table>' +
    '<div style="margin-top:14px;display:flex;gap:8px;">' +
    '<button id="__azAuditCopy" style="flex:1;padding:8px 12px;background:#058552;color:#fff;border:none;border-radius:6px;font-weight:700;font-size:12px;cursor:pointer;">📋 Copy Summary</button>' +
    '</div>';

  document.body.appendChild(overlay);

  document.getElementById('__azAuditClose').onclick = function () {
    overlay.remove();
  };

  var statusEl = document.getElementById('__azAuditStatus');
  var rowsEl = document.getElementById('__azAuditRows');
  var auditResults = [];

  for (var i = 0; i < priceBrackets.length; i++) {
    var bracket = priceBrackets[i];
    statusEl.textContent = 'Checking ' + bracket.label + ' (' + (i + 1) + '/5)...';

    var html = '';
    try {
      var resp = await fetch(buildUrl(bracket.facet), { credentials: 'include' });
      if (resp.ok) html = await resp.text();
    } catch (e) {
      console.error(e);
    }

    var totalReported = 0;
    var cardsOnP1 = 0;
    var totalPages = 1;

    if (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');

      // 1. Total items: matches mobile 'Show 88 results' or desktop 'of 142 results'
      var m = html.match(/Show\s+([\d,]+)\s+results?/i) || html.match(/of\s+(?:over\s+)?([\d,]+)\s+results/i) || html.match(/([\d,]+)\s+results?\s+for/i);
      if (m) {
        totalReported = parseInt(m[1].replace(/,/g, ''), 10);
      }

      // 2. Count actual product cards on Page 1
      var cards = doc.querySelectorAll('div[data-asin]:not([data-asin=""])');
      for (var c = 0; c < cards.length; c++) {
        var asin = cards[c].getAttribute('data-asin');
        if (asin && asin.length === 10 && !cards[c].querySelector('.puis-sponsored-label-text, [data-component-type="sp-sponsored-result"]')) {
          cardsOnP1++;
        }
      }

      // If total was not detected via regex fallback to cards on P1
      if (!totalReported && cardsOnP1 > 0) {
        totalReported = cardsOnP1;
      }

      // 3. Calculate pages (28 items per page on mobile view, or cardsOnP1)
      var perPage = cardsOnP1 || 28;
      totalPages = totalReported > 0 ? Math.ceil(totalReported / perPage) : 0;
    }

    auditResults.push({
      tier: bracket.label,
      totalItems: totalReported,
      cardsP1: cardsOnP1,
      pages: totalPages
    });

    var row = document.createElement('tr');
    row.style.borderBottom = '1px solid #f1f5f9';
    row.innerHTML =
      '<td style="padding:6px 8px;font-weight:600;">' + bracket.label + '</td>' +
      '<td style="padding:6px 6px;text-align:center;font-weight:700;color:#058552;">' + totalReported + '</td>' +
      '<td style="padding:6px 6px;text-align:center;color:#64748b;">' + cardsOnP1 + '</td>' +
      '<td style="padding:6px 6px;text-align:center;font-weight:700;color:#2563eb;">' + totalPages + ' pages</td>';
    rowsEl.appendChild(row);
  }

  var totalDealsAll = auditResults.reduce(function(acc, r){ return acc + r.totalItems; }, 0);
  statusEl.textContent = '✅ Inspection complete! (' + totalDealsAll + ' total deals)';
  console.table(auditResults);

  document.getElementById('__azAuditCopy').onclick = function () {
    var md = '| Price Bracket | Total Items Reported | Cards on P1 | Total Pages |\n|---|---|---|---|\n';
    auditResults.forEach(function (r) {
      md += '| ' + r.tier + ' | ' + r.totalItems + ' | ' + r.cardsP1 + ' | ' + r.pages + ' pages |\n';
    });
    navigator.clipboard.writeText(md).then(function () {
      alert('Summary copied! You can paste it into the chat.');
    });
  };
})();
