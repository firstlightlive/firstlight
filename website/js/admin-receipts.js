// ════════════════════════════════════════════════════════════════════════════
// FIRST LIGHT — Donation Receipts admin panel
// Lists pending MISS slips, accepts UPI screenshot upload,
// calls Edge Function 'upload-receipt' which posts Story + comment + marks paid.
// ════════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  var SUPA = (window.FL && FL.SUPABASE_URL) || '';
  var KEY  = (window.FL && FL.SUPABASE_ANON_KEY) || '';
  var ADMIN_KEY = localStorage.getItem('fl_admin_key') || '';

  function sb(path, opts) {
    opts = opts || {};
    return fetch(SUPA + '/rest/v1/' + path, Object.assign({
      headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' }
    }, opts)).then(function(r) { return r.json(); });
  }

  function callEdge(action, body) {
    return fetch(SUPA + '/functions/v1/firstlight-sync?action=' + action, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + KEY, 'x-admin-key': ADMIN_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function(r) { return r.json(); });
  }

  // Format ₹ amount
  function fmtINR(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); }

  // YYYY-MM-DD → "DAY · 20 JUN 2026"
  function prettyDate(iso) {
    var months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    var p = (iso || '').split('-');
    if (p.length < 3) return iso;
    return parseInt(p[2], 10) + ' ' + (months[parseInt(p[1], 10) - 1] || p[1]) + ' ' + p[0];
  }

  // Chapter 02 Day N from a date string
  function chapterDay(dateStr) {
    var start = new Date('2026-06-20T00:00:00+05:30');
    var d = new Date(dateStr + 'T12:00:00+05:30');
    return Math.floor((d - start) / 86400000) + 1;
  }

  // UPI deeplink builder — opens the user's UPI app pre-filled.
  function buildUpiLink(amount) {
    amount = amount || 1500;
    return 'upi://pay?pa=donate@akshayapatra&pn=Akshaya%20Patra&am=' + amount + '&cu=INR&tn=' + encodeURIComponent('First Light · accountability donation');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FILE → BASE64
  // ─────────────────────────────────────────────────────────────────────────
  function fileToBase64(file) {
    return new Promise(function(resolve, reject) {
      var r = new FileReader();
      r.onload = function() { resolve(r.result); };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FETCH SLIPS (carb engine auto-forfeit slips only)
  // ─────────────────────────────────────────────────────────────────────────
  function fetchSlips() {
    return sb('slips?client_id=like.engine_miss_*&select=id,client_id,date,penalty_amount,penalty_charity,penalty_status,ig_post_id,receipt_url,proof_url,paid_at,created_at&order=date.desc&limit=50');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  function init() {
    var panel = document.getElementById('p-donation-receipts');
    if (!panel || panel.dataset.inited) return;
    panel.dataset.inited = '1';
    refresh();
  }

  async function refresh() {
    var pendEl = document.getElementById('receiptsPending');
    var paidEl = document.getElementById('receiptsPaid');
    try {
      var slips = await fetchSlips();
      if (!Array.isArray(slips)) throw new Error('slips fetch failed');
      var pending = slips.filter(function(s) { return s.penalty_status !== 'cleared'; });
      var paid    = slips.filter(function(s) { return s.penalty_status === 'cleared'; });
      renderPending(pendEl, pending);
      renderPaid(paidEl, paid);
    } catch (e) {
      pendEl.innerHTML = '<div style="color:var(--red);font-family:var(--font-mono);font-size:12px;padding:12px">Error loading slips: ' + e.message + '</div>';
    }
  }

  function renderPending(el, slips) {
    if (!slips.length) {
      el.innerHTML = '<div style="color:var(--green);font-family:var(--font-mono);font-size:12px;padding:14px;background:rgba(0,230,118,0.04);border-radius:8px">✓ No pending receipts. All MISS days are paid.</div>';
      return;
    }
    el.innerHTML = '';
    slips.forEach(function(slip) {
      var day = chapterDay(slip.date);
      var card = document.createElement('div');
      card.style.cssText = 'background:var(--bg3);border:1px solid rgba(245,166,35,0.2);border-left:3px solid var(--gold);border-radius:8px;padding:16px';
      var igLink = slip.ig_post_id ? '<a href="https://www.instagram.com/p/' + slip.ig_post_id + '/" target="_blank" style="color:var(--cyan);font-family:var(--font-mono);font-size:11px">view MISS post →</a>' : '<span style="color:var(--text-muted);font-family:var(--font-mono);font-size:11px">no linked IG post</span>';
      var amount = slip.penalty_amount || 1500;
      var upi = buildUpiLink(amount);
      card.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;gap:12px;flex-wrap:wrap">' +
          '<div>' +
            '<div style="font:700 14px var(--font-mono);color:var(--text);letter-spacing:1px;margin-bottom:4px">DAY ' + day + ' · ' + prettyDate(slip.date) + '</div>' +
            '<div style="font:500 11px var(--font-mono);color:var(--text-muted);margin-bottom:4px">slip: ' + slip.client_id + '</div>' +
            '<div>' + igLink + '</div>' +
          '</div>' +
          '<div style="text-align:right">' +
            '<div style="font:700 18px var(--font-mono);color:var(--gold);margin-bottom:2px">' + fmtINR(amount) + '</div>' +
            '<div style="font:500 10px var(--font-mono);color:var(--text-muted);letter-spacing:2px">' + (slip.penalty_charity || 'AKSHAYA PATRA').toUpperCase() + '</div>' +
          '</div>' +
        '</div>' +
        '<!-- STEP 1: Donate via UPI -->' +
        '<div style="display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:center;margin-bottom:14px;padding:14px;background:rgba(245,166,35,0.06);border:1px solid rgba(245,166,35,0.2);border-radius:8px">' +
          '<div style="font:700 11px var(--font-mono);color:var(--gold);letter-spacing:2px">STEP 1</div>' +
          '<a href="' + upi + '" class="btn btn-primary receipt-pay-btn" style="text-decoration:none;text-align:center;padding:12px;background:linear-gradient(135deg,#F5A623,#E8941C);color:#000;border-radius:8px;font:700 13px var(--font-mono);letter-spacing:1px">💸 DONATE ' + fmtINR(amount) + ' VIA UPI</a>' +
        '</div>' +
        '<!-- STEP 2: Upload receipt -->' +
        '<div style="display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:start;padding:14px;background:rgba(0,212,255,0.04);border:1px solid rgba(0,212,255,0.18);border-radius:8px">' +
          '<div style="font:700 11px var(--font-mono);color:var(--cyan);letter-spacing:2px;padding-top:14px">STEP 2</div>' +
          '<div class="receipt-upload-zone" style="border:2px dashed rgba(255,255,255,0.1);border-radius:8px;padding:14px;background:rgba(0,0,0,0.3);text-align:center;cursor:pointer">' +
            '<input type="file" accept="image/png,image/jpeg,image/webp" class="receipt-file" style="display:none">' +
            '<div class="receipt-preview" style="display:none;margin-bottom:10px"></div>' +
            '<div class="receipt-prompt" style="font:500 12px var(--font-mono);color:var(--text-muted);letter-spacing:1px;padding:10px">📎 TAP TO PICK UPI SCREENSHOT</div>' +
            '<button class="btn btn-primary receipt-submit" style="display:none;width:100%">SUBMIT RECEIPT &amp; POST TO IG</button>' +
            '<div class="receipt-status" style="margin-top:10px;font:500 11px var(--font-mono);color:var(--text-muted)"></div>' +
          '</div>' +
        '</div>';

      var input = card.querySelector('.receipt-file');
      var zone = card.querySelector('.receipt-upload-zone');
      var preview = card.querySelector('.receipt-preview');
      var prompt = card.querySelector('.receipt-prompt');
      var submit = card.querySelector('.receipt-submit');
      var status = card.querySelector('.receipt-status');
      var picked = null;

      zone.addEventListener('click', function(e) {
        if (e.target.closest('button')) return;
        input.click();
      });

      input.addEventListener('change', async function() {
        if (!input.files || !input.files[0]) return;
        var f = input.files[0];
        if (f.size > 8 * 1024 * 1024) { status.textContent = 'File too large (max 8 MB).'; status.style.color = 'var(--red)'; return; }
        picked = f;
        var dataUrl = await fileToBase64(f);
        preview.innerHTML = '<img src="' + dataUrl + '" style="max-width:200px;max-height:200px;border-radius:6px;border:1px solid rgba(255,255,255,0.1)">';
        preview.style.display = '';
        prompt.style.display = 'none';
        submit.style.display = '';
        status.textContent = f.name + ' · ' + Math.round(f.size / 1024) + ' KB';
        status.style.color = 'var(--text-muted)';
      });

      submit.addEventListener('click', async function() {
        if (!picked) return;
        submit.disabled = true; submit.textContent = 'UPLOADING…';
        status.textContent = 'Uploading + posting to Instagram…';
        status.style.color = 'var(--cyan)';
        try {
          var dataUrl = await fileToBase64(picked);
          var res = await callEdge('upload-receipt', {
            client_id: slip.client_id,
            image_data: dataUrl,
            content_type: picked.type || 'image/png'
          });
          if (res.success || res.alreadyPaid) {
            var msg = '✓ ' + (res.alreadyPaid ? 'Already marked paid' : 'Paid');
            if (res.storyId) msg += ' · Story posted';
            if (res.commentId) msg += ' · IG comment posted';
            status.textContent = msg;
            status.style.color = 'var(--green)';
            submit.textContent = 'DONE';
            setTimeout(refresh, 1500);
          } else {
            status.textContent = '✗ ' + (res.error || JSON.stringify(res).slice(0,200));
            status.style.color = 'var(--red)';
            submit.disabled = false; submit.textContent = 'RETRY';
          }
        } catch (e) {
          status.textContent = '✗ ' + e.message;
          status.style.color = 'var(--red)';
          submit.disabled = false; submit.textContent = 'RETRY';
        }
      });

      el.appendChild(card);
    });
  }

  function renderPaid(el, slips) {
    if (!slips.length) {
      el.innerHTML = '<div style="color:var(--text-muted);font-family:var(--font-mono);font-size:12px;padding:12px">No paid receipts yet.</div>';
      return;
    }
    el.innerHTML = '';
    slips.forEach(function(slip) {
      var day = chapterDay(slip.date);
      var paidDate = slip.paid_at ? new Date(slip.paid_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—';
      var receipt = slip.receipt_url || slip.proof_url;
      var card = document.createElement('div');
      card.style.cssText = 'background:var(--bg3);border:1px solid rgba(0,230,118,0.15);border-left:3px solid var(--green);border-radius:8px;padding:12px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap';
      card.innerHTML =
        '<div>' +
          '<div style="font:700 12px var(--font-mono);color:var(--text);margin-bottom:2px">DAY ' + day + ' · ' + prettyDate(slip.date) + '</div>' +
          '<div style="font:500 10px var(--font-mono);color:var(--text-muted)">paid ' + paidDate + ' IST</div>' +
        '</div>' +
        '<div style="text-align:right">' +
          '<div style="font:700 13px var(--font-mono);color:var(--green)">' + fmtINR(slip.penalty_amount || 1500) + ' ✓</div>' +
          (receipt ? '<a href="' + receipt + '" target="_blank" style="color:var(--cyan);font-family:var(--font-mono);font-size:10px">view receipt →</a>' : '') +
        '</div>';
      el.appendChild(card);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTIVATION
  // ─────────────────────────────────────────────────────────────────────────
  document.addEventListener('click', function(e) {
    var item = e.target.closest('.cc-item');
    if (!item) return;
    if (item.dataset.panel === 'donation-receipts') setTimeout(init, 50);
  });
  setTimeout(function() { if (document.getElementById('p-donation-receipts')) init(); }, 200);
})();
