/**
 * Amazon Now Subcategory Deals Inspector
 * Tests how many items and pages exist in each subcategory of your dark store,
 * and how many deals are available at 50%+ and 70%+ off.
 */
(async function () {
  'use strict';

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

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
  if (!brandId) {
    brandId = prompt('Please enter your Amazon Now Brand ID (e.g. qqfsWw9RkO):');
    if (brandId) sessionStorage.setItem('__aznowBrandId', brandId);
  }
  if (!brandId) {
    alert('Brand ID is required to inspect categories.');
    return;
  }

  var merchMap = { 216450600031: 1 };

  var categoriesData = [
    {
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
      name: 'Snacks, Sweets & Treats',
      subs: [
        ['Chocolates', '204924526031'],
        ['Chips & Crisps', '204924530031'],
        ['Indian Namkeen', '215540425031'],
        ['Wafers & Biscuits', '204924537031'],
        ['Sweets & Mithai', '204924552031'],
        ['Dry Fruits & Nuts', '204924525031']
      ]
    },
    {
      name: 'Beverages & Drinks',
      subs: [
        ['Cold Drinks & Sodas', '204924556031'],
        ['Tea (Leaf & Bags)', '204924559031'],
        ['Coffee (Instant & Filter)', '204924558031'],
        ['Fruit Juices & Nectars', '204924568031']
      ]
    },
    {
      name: 'Personal Care & Beauty',
      subs: [
        ['Facial Cleansers & Face Wash', '204992615031'],
        ['Sunscreens (SPF)', '204992651031'],
        ['Bathing Soaps & Bars', '204992631031'],
        ['Body Wash & Shower Gel', '204992628031'],
        ['Hair Care & Shampoos', '204992645031']
      ]
    },
    {
      name: 'Home Care & Cleaning',
      subs: [
        ['Detergent Powder & Liquid', '204992625031'],
        ['Dishwash Liquids & Bars', '204992648031'],
        ['Floor Cleaners (Lizol)', '204992649031'],
        ['Toilet Cleaners (Harpic)', '204992624031'],
        ['Pooja Needs & Agarbatti', '204992622031']
      ]
    }
  ];

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

  // UI Overlay
  var existing = document.getElementById('__azCatAuditOverlay');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = '__azCatAuditOverlay';
  overlay.style.cssText =
    'position:fixed;top:20px;right:20px;width:520px;max-width:calc(100vw - 40px);background:#ffffff;border:2px solid #058552;border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,0.25);z-index:9999999;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:16px;box-sizing:border-box;max-height:90vh;overflow-y:auto;';

  overlay.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;">' +
    '<div><div style="font-weight:700;font-size:15px;color:#0f1111;">📁 Amazon Now Category Inspector</div>' +
    '<div style="font-size:11px;color:#64748b;">Testing items and pages per subcategory</div></div>' +
    '<button id="__azCatAuditClose" style="border:none;background:none;font-size:18px;cursor:pointer;color:#64748b;">✕</button>' +
    '</div>' +
    '<div style="margin-bottom:10px;display:flex;gap:8px;align-items:center;">' +
    '<span style="font-size:11.5px;font-weight:600;color:#334155;">Department:</span>' +
    '<select id="__azDeptSelect" style="flex:1;padding:5px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;outline:none;">' +
    '<option value="ALL">All Departments (Comprehensive)</option>' +
    categoriesData.map(function(c, i){ return '<option value="' + i + '">' + c.name + '</option>'; }).join('') +
    '</select>' +
    '<button id="__azStartBtn" style="padding:5px 12px;background:#058552;color:#fff;border:none;border-radius:6px;font-weight:700;font-size:11.5px;cursor:pointer;">Start Scan</button>' +
    '</div>' +
    '<div id="__azCatAuditStatus" style="font-size:11.5px;color:#058552;font-weight:600;margin-bottom:8px;">Select a department and click Start Scan.</div>' +
    '<table style="width:100%;border-collapse:collapse;font-size:11.5px;text-align:left;">' +
    '<thead><tr style="background:#f1f5f9;color:#334155;border-bottom:1px solid #cbd5e1;">' +
    '<th style="padding:6px 6px;">Subcategory</th>' +
    '<th style="padding:6px 4px;text-align:center;">Total Items</th>' +
    '<th style="padding:6px 4px;text-align:center;">Pages</th>' +
    '<th style="padding:6px 4px;text-align:center;">≥50% Deals</th>' +
    '<th style="padding:6px 4px;text-align:center;">≥70% Deals</th>' +
    '</tr></thead><tbody id="__azCatAuditRows"></tbody></table>' +
    '<div style="margin-top:12px;display:flex;gap:8px;">' +
    '<button id="__azCatAuditCopy" style="flex:1;padding:8px 12px;background:#058552;color:#fff;border:none;border-radius:6px;font-weight:700;font-size:12px;cursor:pointer;display:none;">📋 Copy Summary</button>' +
    '</div>';

  document.body.appendChild(overlay);

  document.getElementById('__azCatAuditClose').onclick = function () { overlay.remove(); };

  var statusEl = document.getElementById('__azCatAuditStatus');
  var rowsEl = document.getElementById('__azCatAuditRows');
  var copyBtn = document.getElementById('__azCatAuditCopy');
  var startBtn = document.getElementById('__azStartBtn');
  var deptSelect = document.getElementById('__azDeptSelect');

  startBtn.onclick = async function () {
    startBtn.disabled = true;
    startBtn.style.opacity = '0.5';
    rowsEl.innerHTML = '';
    copyBtn.style.display = 'none';

    var selDept = deptSelect.value;
    var targetList = [];

    if (selDept === 'ALL') {
      categoriesData.forEach(function (cat) {
        cat.subs.forEach(function (sub) {
          targetList.push({ dept: cat.name, subName: sub[0], nodeId: sub[1] });
        });
      });
    } else {
      var catObj = categoriesData[parseInt(selDept, 10)];
      catObj.subs.forEach(function (sub) {
        targetList.push({ dept: catObj.name, subName: sub[0], nodeId: sub[1] });
      });
    }

    var auditResults = [];

    for (var i = 0; i < targetList.length; i++) {
      var item = targetList[i];
      statusEl.textContent = 'Scanning (' + (i + 1) + '/' + targetList.length + '): ' + item.subName + '...';

      var row = document.createElement('tr');
      row.style.borderBottom = '1px solid #f1f5f9';
      row.innerHTML =
        '<td style="padding:5px 6px;font-weight:600;">' + item.subName + '<br><span style="font-size:9.5px;color:#64748b;font-weight:normal;">' + item.dept + '</span></td>' +
        '<td id="__azItems_' + i + '" style="padding:5px 4px;text-align:center;font-weight:700;color:#0f1111;">...</td>' +
        '<td id="__azPages_' + i + '" style="padding:5px 4px;text-align:center;color:#2563eb;">...</td>' +
        '<td id="__azD50_' + i + '" style="padding:5px 4px;text-align:center;color:#d97706;font-weight:600;">0</td>' +
        '<td id="__azD70_' + i + '" style="padding:5px 4px;text-align:center;color:#058552;font-weight:700;">0</td>';
      rowsEl.appendChild(row);

      var subTotalItems = 0;
      var subPages = 0;
      var subD50 = 0;
      var subD70 = 0;
      var seenAsins = {};

      var offset = 0;
      var hasMore = true;
      var MAX_OFFSETS = 10; // safety ceiling per subcategory

      while (hasMore && offset < MAX_OFFSETS) {
        var json = null;
        try {
          var resp = await fetch(buildCategoryUrl(item.nodeId, offset), { credentials: 'include' });
          if (resp.ok) json = await resp.json();
        } catch (e) {}

        if (!json || !json.data) break;

        var data = json.data;
        var widgets = data.widgets || [];
        var prodsCountThisOffset = 0;

        for (var w = 0; w < widgets.length; w++) {
          var products = (widgets[w].data && widgets[w].data.products) || [];
          for (var p = 0; p < products.length; p++) {
            var prod = products[p];
            if (!prod || !prod.asin || seenAsins[prod.asin]) continue;
            seenAsins[prod.asin] = 1;
            prodsCountThisOffset++;

            var disc = prod.savings && prod.savings.percentage ? parseInt(prod.savings.percentage, 10) : 0;
            var bp = prod.buyingPrice ? prod.buyingPrice.amount : null;
            var lp = prod.listPrice ? prod.listPrice.amount : null;
            if (!disc && lp && bp && lp > bp) {
              disc = Math.round(((lp - bp) / lp) * 100);
            }

            if (disc >= 70) subD70++;
            if (disc >= 50) subD50++;
          }
        }

        if (prodsCountThisOffset === 0) break;

        subTotalItems += prodsCountThisOffset;
        subPages++;

        var meta = data.metadata || {};
        var more = meta.hasMoreWidgets !== undefined ? !!meta.hasMoreWidgets : true;
        if (!more) break;

        if (typeof meta.nextOffset === 'number' && meta.nextOffset > offset) {
          offset = meta.nextOffset;
        } else {
          offset++;
        }

        await sleep(250);
      }

      document.getElementById('__azItems_' + i).textContent = subTotalItems;
      document.getElementById('__azPages_' + i).textContent = subPages + ' p.';
      document.getElementById('__azD50_' + i).textContent = subD50;
      document.getElementById('__azD70_' + i).textContent = subD70;

      auditResults.push({
        dept: item.dept,
        subcategory: item.subName,
        totalItems: subTotalItems,
        pages: subPages,
        deals50: subD50,
        deals70: subD70
      });

      await sleep(150);
    }

    statusEl.textContent = '✅ Scan complete! Scanned ' + targetList.length + ' subcategories.';
    copyBtn.style.display = 'block';
    startBtn.disabled = false;
    startBtn.style.opacity = '1';

    console.table(auditResults);

    copyBtn.onclick = function () {
      var md = '| Department | Subcategory | Total Items | Pages | ≥50% Deals | ≥70% Deals |\n|---|---|---|---|---|---|\n';
      auditResults.forEach(function (r) {
        md += '| ' + r.dept + ' | ' + r.subcategory + ' | ' + r.totalItems + ' | ' + r.pages + ' pages | ' + r.deals50 + ' | ' + r.deals70 + ' |\n';
      });
      navigator.clipboard.writeText(md).then(function () {
        alert('Summary copied! You can paste it in the chat.');
      });
    };
  };
})();
