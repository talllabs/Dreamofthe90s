(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────
  // GOOGLE SHEET CONFIG
  // Mia & Ashleigh manage spots here — no code needed, just update the sheet.
  //
  // Sheet setup (3 columns, row 1 = headers, rows 2–8 = each week):
  //   A: Week      e.g. "Week 1"
  //   B: Dates     e.g. "June 8–12"
  //   C: Spots     e.g. "8"  ← just update this number as kids enrol
  //
  // To get the URL: File → Share → Publish to web → Sheet1 → CSV → Publish
  // Paste it below:
  var SHEET_CSV_URL = 'YOUR_GOOGLE_SHEET_CSV_URL_HERE';
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

  // ── Emoji picker ──
  var emojiInput = document.getElementById('kid-emoji');
  var emojiDisplay = document.getElementById('emoji-selected-display');
  var emojiButtons = document.querySelectorAll('.emoji-btn');

  emojiButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      emojiButtons.forEach(function (b) { b.classList.remove('selected'); });
      btn.classList.add('selected');
      emojiInput.value = btn.getAttribute('data-emoji');
      emojiDisplay.textContent = 'Selected: ' + btn.getAttribute('data-emoji');
    });
  });

  // ── Form AJAX submit → show payment panel ──
  var form = document.getElementById('signup-form');
  var paymentPanel = document.getElementById('payment-panel');
  var submitBtn = document.getElementById('form-submit-btn');
  var formError = document.getElementById('form-error');

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      // Validate emoji chosen
      if (!emojiInput.value) {
        formError.textContent = 'Please pick an emoji for your kid before submitting!';
        formError.style.display = 'block';
        document.getElementById('emoji-picker').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

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
            // Hide form, show payment panel
            form.style.display = 'none';
            paymentPanel.classList.add('visible');
            paymentPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });

            // Generate Venmo QR code
            var canvas = document.getElementById('venmo-qr');
            if (canvas && typeof QRCode !== 'undefined') {
              QRCode.toCanvas(canvas, 'https://account.venmo.com/u/Mia-Cowell', {
                width: 180,
                margin: 2,
                color: { dark: '#111111', light: '#ffffff' }
              });
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

  // ── Google Sheet: live spot counts ──
  function parseCSV(text) {
    var lines = text.trim().split('\n');
    var rows = [];
    for (var i = 1; i < lines.length; i++) { // skip header row
      var cols = lines[i].split(',');
      rows.push({
        week:  (cols[0] || '').trim(),
        dates: (cols[1] || '').trim(),
        spots: parseInt((cols[2] || '').trim(), 10)
      });
    }
    return rows;
  }

  function spotsLabel(spots) {
    if (isNaN(spots) || spots <= 0) return { text: 'FULL', cls: 'spots-full' };
    if (spots <= 2) return { text: spots + ' spot' + (spots === 1 ? '' : 's') + ' left!', cls: 'spots-low' };
    if (spots <= 5) return { text: spots + ' spots left', cls: 'spots-some' };
    return { text: spots + ' spots open', cls: 'spots-open' };
  }

  function updateScheduleUI(rows) {
    rows.forEach(function (row, i) {
      var weekNum = i + 1;
      var scheduleRow = document.querySelector('.week-schedule-row[data-week="' + weekNum + '"]');
      var formCheck = document.querySelector('.week-check input[value^="Week ' + weekNum + '"]');
      var label = spotsLabel(row.spots);

      if (scheduleRow) {
        var spotsEl = scheduleRow.querySelector('.week-spots');
        if (spotsEl) {
          spotsEl.textContent = label.text;
          spotsEl.className = 'week-spots ' + label.cls;
        }
        if (row.spots <= 0) scheduleRow.classList.add('week-full');
      }

      if (formCheck) {
        var checkLabel = formCheck.closest('.week-check');
        if (row.spots <= 0) {
          formCheck.disabled = true;
          if (checkLabel) checkLabel.classList.add('week-check--full');
          var spotsSpan = checkLabel && checkLabel.querySelector('.week-check-date');
          if (spotsSpan) spotsSpan.textContent = spotsSpan.textContent + ' — FULL';
        } else {
          var badge = document.createElement('span');
          badge.className = 'week-check-spots ' + label.cls;
          badge.textContent = label.text;
          if (checkLabel && !checkLabel.querySelector('.week-check-spots')) {
            checkLabel.querySelector('.week-check-body').appendChild(badge);
          }
        }
      }
    });
  }

  if (SHEET_CSV_URL && SHEET_CSV_URL !== 'YOUR_GOOGLE_SHEET_CSV_URL_HERE') {
    fetch(SHEET_CSV_URL)
      .then(function (res) { return res.text(); })
      .then(function (csv) { updateScheduleUI(parseCSV(csv)); })
      .catch(function () { /* silently fail — sheet unavailable */ });
  }

}());
