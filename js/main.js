(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────
  // LIVE DATA CONFIG
  // Camp availability is managed via the /admin page.
  // After admin setup, Mia & Ashleigh will copy a <meta> snippet into index.html.
  // The Bin ID in that meta tag connects the public site to the live camp data.
  // ─────────────────────────────────────────────────────────────────────────
  var binIdMeta = document.querySelector('meta[name="camp-bin-id"]');
  var JSONBIN_BIN_ID = binIdMeta ? binIdMeta.getAttribute('content') : '';

  var jsonbinKeyMeta = document.querySelector('meta[name="camp-jsonbin-key"]');
  var JSONBIN_KEY = jsonbinKeyMeta ? jsonbinKeyMeta.getAttribute('content') : '';
  var JSONBIN_COLLECTION_ID = '69d094fbaaba882197c28576';
  // ─────────────────────────────────────────────────────────────────────────

  // ── Sticky nav shadow on scroll ──
  var nav = document.getElementById('site-nav');
  function onScroll() {
    nav.classList.toggle('scrolled', window.scrollY > 10);
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  // ── Mobile burger menu ──
  var burger = document.querySelector('.nav-burger');
  var navLinks = document.querySelector('.nav-links');

  burger.addEventListener('click', function () {
    var open = navLinks.classList.toggle('open');
    burger.setAttribute('aria-expanded', open);
    burger.textContent = open ? '✕' : '☰';
  });

  navLinks.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () {
      navLinks.classList.remove('open');
      burger.setAttribute('aria-expanded', 'false');
      burger.textContent = '☰';
    });
  });

  // ── Smooth entrance animations ──
  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    document.querySelectorAll('.activity-card, .price-tag, .notepad-card, .dates-card').forEach(function (el) {
      el.classList.add('fade-in');
      observer.observe(el);
    });
  }

  // ── Week calculator ──
  var weekCheckboxes = document.querySelectorAll('.signup-form input[name="weeks"]');
  var calcAmount = document.getElementById('calc-amount');
  var calcSavings = document.getElementById('calc-savings');
  var calcHidden = document.getElementById('calc-hidden');

  function updateCalculator() {
    var checkedCount = 0;
    weekCheckboxes.forEach(function (cb) {
      if (cb.checked) checkedCount++;
    });

    var total;
    var fullSummer = (checkedCount === 7);

    if (checkedCount === 0) {
      total = 0;
    } else if (fullSummer) {
      total = 3000;
    } else {
      total = checkedCount * 500;
    }

    var formatted = checkedCount === 0 ? '$0' : '$' + total.toLocaleString();

    if (calcAmount) calcAmount.textContent = formatted;
    if (calcHidden) calcHidden.value = formatted + (fullSummer ? ' (full summer — $500 discount applied)' : ' (' + checkedCount + ' week' + (checkedCount === 1 ? '' : 's') + ')');
    if (calcSavings) calcSavings.classList.toggle('visible', fullSummer);
  }

  weekCheckboxes.forEach(function (cb) {
    cb.addEventListener('change', updateCalculator);
  });

  // ── Form AJAX submit → show payment panel ──
  var form = document.getElementById('signup-form');
  var paymentPanel = document.getElementById('payment-panel');
  var submitBtn = document.getElementById('form-submit-btn');
  var formError = document.getElementById('form-error');

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      formError.style.display = 'none';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';

      fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { 'Accept': 'application/json' }
      })
        .then(function (res) {
          if (res.ok) {
            form.style.display = 'none';
            paymentPanel.classList.add('visible');
            paymentPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });

            var canvas = document.getElementById('venmo-qr');
            if (canvas && typeof QRCode !== 'undefined') {
              QRCode.toCanvas(canvas, 'https://account.venmo.com/u/Mia-Cowell', {
                width: 180,
                margin: 2,
                color: { dark: '#111111', light: '#ffffff' }
              });
            }

            // Append registration to the main camp data bin so it shows in the admin page
            console.log('[Camp] BIN_ID:', JSONBIN_BIN_ID, 'KEY set:', !!JSONBIN_KEY);
            if (JSONBIN_KEY && JSONBIN_BIN_ID) {
              var fd = new FormData(form);
              var newKid = {
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
                childName:   fd.get('child_name') || '',
                childAge:    fd.get('child_age') || '',
                parentName:  fd.get('parent_name') || '',
                email:       fd.get('email') || '',
                notes:       fd.get('message') || '',
                status:      'pending',
                weeks:       fd.getAll('weeks').map(Number),
                emoji:       fd.get('kid_emoji') || '',
                registeredAt: new Date().toISOString().slice(0, 10)
              };
              // Read current bin (must be Public on JSONBin), append kid, write back
              fetch('https://api.jsonbin.io/v3/b/' + JSONBIN_BIN_ID + '/latest')
                .then(function (r) {
                  if (!r.ok) throw new Error('Read failed: ' + r.status);
                  return r.json();
                })
                .then(function (json) {
                  var data = json.record || {};
                  if (!Array.isArray(data.kids)) data.kids = [];
                  data.kids.push(newKid);
                  return fetch('https://api.jsonbin.io/v3/b/' + JSONBIN_BIN_ID, {
                    method: 'PUT',
                    headers: {
                      'Content-Type': 'application/json',
                      'X-Access-Key': JSONBIN_KEY
                    },
                    body: JSON.stringify(data)
                  }).then(function (r2) {
                    if (!r2.ok) throw new Error('Update failed: ' + r2.status);
                  });
                })
                .catch(function (err) { console.error('[Camp] JSONBin registration error:', err); });
            }
          } else {
            submitBtn.disabled = false;
            submitBtn.textContent = '✉ Send to Mia & Ashleigh';
            formError.textContent = 'Something went wrong — please try again.';
            formError.style.display = 'block';
          }
        })
        .catch(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = '✉ Send to Mia & Ashleigh';
          formError.textContent = 'Network error — please check your connection and try again.';
          formError.style.display = 'block';
        });
    });
  }

  // ── Parse JSONBin camp data → schedule-compatible format ──
  function parseCampData(record) {
    var weeks = {};
    var kids  = {};
    for (var w = 1; w <= 7; w++) {
      weeks[w] = { totalSpots: 8 };
      kids[w]  = { booked: [], pending: [] };
    }

    if (!record) return { weeks: weeks, kids: kids };

    // Week spot totals
    if (Array.isArray(record.weeks)) {
      record.weeks.forEach(function (wk) {
        if (wk.num >= 1 && wk.num <= 7) {
          weeks[wk.num].totalSpots = wk.totalSpots || 8;
        }
      });
    }

    // Kids → per-week counts
    if (Array.isArray(record.kids)) {
      record.kids.forEach(function (kid) {
        (kid.weeks || []).forEach(function (wn) {
          if (wn >= 1 && wn <= 7 && kids[wn]) {
            if (kid.status === 'booked') {
              kids[wn].booked.push(kid.id || '');
            } else {
              kids[wn].pending.push(kid.id || '');
            }
          }
        });
      });
    }

    return { weeks: weeks, kids: kids };
  }

  function spotsLabel(n) {
    if (isNaN(n) || n <= 0) return { text: 'FULL', cls: 'spots-full' };
    if (n <= 2) return { text: n + ' spot' + (n === 1 ? '' : 's') + ' left!', cls: 'spots-low' };
    if (n <= 5) return { text: n + ' spots left', cls: 'spots-some' };
    return { text: n + ' spots open', cls: 'spots-open' };
  }

  function updateScheduleUI(data) {
    for (var weekNum = 1; weekNum <= 7; weekNum++) {
      var week      = data.weeks[weekNum];
      var weekKids  = data.kids[weekNum];
      var booked    = weekKids.booked.length;
      var pending   = weekKids.pending.length;
      var available = week.totalSpots - booked - pending;
      var label     = spotsLabel(available);

      var scheduleRow = document.querySelector('.week-schedule-row[data-week="' + weekNum + '"]');
      if (scheduleRow) {
        var spotsEl = scheduleRow.querySelector('.week-spots');
        if (spotsEl) {
          spotsEl.textContent = label.text;
          spotsEl.className = 'week-spots ' + label.cls;
        }
        if (available <= 0) scheduleRow.classList.add('week-full');
      }
    }
  }

  if (JSONBIN_BIN_ID) {
    fetch('https://api.jsonbin.io/v3/b/' + JSONBIN_BIN_ID + '/latest')
      .then(function (res) { return res.json(); })
      .then(function (json) { updateScheduleUI(parseCampData(json.record)); })
      .catch(function () { /* silently fail — site works without live data */ });
  }

}());
