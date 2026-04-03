(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────
  // GOOGLE SHEET CONFIG
  // Mia & Ashleigh manage everything here — no code needed.
  //
  // SHEET FORMAT — two types of rows (row 1 = any header you like):
  //
  //   "week" rows  — one per week, defines total spots available:
  //     A        B     C              D
  //     week  |  1  |  June 8–12  |  8
  //
  //   "kid" rows  — one per child registered:
  //     A      B     C    D
  //     kid  |  1  |  🦄  |  booked      ← confirmed & paid
  //     kid  |  1  |  🐶  |  pending     ← awaiting payment
  //
  //   To change total spots for a week: edit column D on the "week" row
  //   To add a booked kid: add a "kid" row with their emoji + "booked"
  //   To mark pending: use "pending" in column D
  //
  // To publish: File → Share → Publish to web → your sheet → CSV → Publish
  // Paste the URL below:
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
  var emojiInput   = document.getElementById('kid-emoji');
  var emojiDisplay = document.getElementById('emoji-selected-display');
  var emojiOwnInput = document.getElementById('emoji-own');
  var emojiButtons = document.querySelectorAll('.emoji-btn');

  function setEmoji(value, sourceBtn) {
    emojiInput.value = value;
    emojiDisplay.textContent = value ? 'Your kid\'s emoji: ' + value : '';
    // Clear preset selection unless a button triggered this
    emojiButtons.forEach(function (b) { b.classList.remove('selected'); });
    if (sourceBtn) sourceBtn.classList.add('selected');
    if (!sourceBtn && emojiOwnInput) emojiOwnInput.value = value;
  }

  function bindEmojiButtons() {
    emojiButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        if (emojiOwnInput) emojiOwnInput.value = '';
        setEmoji(btn.getAttribute('data-emoji'), btn);
      });
    });
  }
  bindEmojiButtons();

  // "Type your own" input — grab first emoji character typed
  if (emojiOwnInput) {
    emojiOwnInput.addEventListener('input', function () {
      var val = emojiOwnInput.value.trim();
      // Extract first emoji (handles multi-codepoint sequences)
      var match = val.match(/(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/u);
      var emoji = match ? match[0] : '';
      setEmoji(emoji, null);
    });
  }

  // Grey out emojis already taken (called after sheet loads)
  function markTakenEmojis(takenSet) {
    emojiButtons.forEach(function (btn) {
      var e = btn.getAttribute('data-emoji');
      if (takenSet[e]) {
        btn.disabled = true;
        btn.classList.add('emoji-taken');
        btn.title = 'Already taken';
      }
    });
  }

  // ── Form AJAX submit → show payment panel ──
  var form = document.getElementById('signup-form');
  var paymentPanel = document.getElementById('payment-panel');
  var submitBtn = document.getElementById('form-submit-btn');
  var formError = document.getElementById('form-error');

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();

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

  // ── Google Sheet: parse new format ──
  function parseSheetData(csv) {
    var lines = csv.trim().split('\n');
    var weeks = {};
    var kids = {};

    for (var w = 1; w <= 7; w++) {
      weeks[w] = { totalSpots: 8 };
      kids[w]  = { booked: [], pending: [] };
    }

    for (var i = 1; i < lines.length; i++) {
      var cols = lines[i].split(',');
      var type    = (cols[0] || '').trim().toLowerCase();
      var weekNum = parseInt((cols[1] || '').trim(), 10);

      if (type === 'week' && weekNum >= 1 && weekNum <= 7) {
        var total = parseInt((cols[3] || '').trim(), 10);
        if (!isNaN(total)) weeks[weekNum].totalSpots = total;

      } else if (type === 'kid' && weekNum >= 1 && weekNum <= 7) {
        var emoji  = (cols[2] || '').trim();
        var status = (cols[3] || '').trim().toLowerCase();
        if (emoji) {
          if (status === 'booked') {
            kids[weekNum].booked.push(emoji);
          } else {
            kids[weekNum].pending.push(emoji);
          }
        }
      }
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
    var takenEmojis = {};

    for (var weekNum = 1; weekNum <= 7; weekNum++) {
      var week      = data.weeks[weekNum];
      var weekKids  = data.kids[weekNum];
      var booked    = weekKids.booked.length;
      var pending   = weekKids.pending.length;
      var available = week.totalSpots - booked - pending;

      // Track all assigned emojis (across all weeks) for the picker
      weekKids.booked.concat(weekKids.pending).forEach(function (e) {
        takenEmojis[e] = true;
      });

      var scheduleRow = document.querySelector('.week-schedule-row[data-week="' + weekNum + '"]');
      var formCheck   = document.querySelector('.week-check input[value^="Week ' + weekNum + ':"]');
      var label       = spotsLabel(available);

      // ── Update schedule row ──
      if (scheduleRow) {
        var spotsEl = scheduleRow.querySelector('.week-spots');
        if (spotsEl) {
          spotsEl.textContent = label.text;
          spotsEl.className = 'week-spots ' + label.cls;
        }

        var emojisEl = scheduleRow.querySelector('.week-emojis');
        if (emojisEl) {
          var html = '';
          weekKids.booked.forEach(function (e) {
            html += '<span class="emoji-kid emoji-booked" title="Confirmed">' + e + '</span>';
          });
          weekKids.pending.forEach(function (e) {
            html += '<span class="emoji-kid emoji-pending" title="Pending payment">' + e + '</span>';
          });
          emojisEl.innerHTML = html;
        }

        if (available <= 0) scheduleRow.classList.add('week-full');
      }

      // ── Update form checkbox ──
      if (formCheck) {
        var checkLabel = formCheck.closest('.week-check');
        if (available <= 0) {
          formCheck.disabled = true;
          if (checkLabel) checkLabel.classList.add('week-check--full');
        } else if (checkLabel && !checkLabel.querySelector('.week-check-spots')) {
          var badge = document.createElement('span');
          badge.className = 'week-check-spots ' + label.cls;
          badge.textContent = label.text;
          var body = checkLabel.querySelector('.week-check-body');
          if (body) body.appendChild(badge);
        }
      }
    }

    // Grey out taken emojis in the picker
    markTakenEmojis(takenEmojis);
  }

  if (SHEET_CSV_URL && SHEET_CSV_URL !== 'YOUR_GOOGLE_SHEET_CSV_URL_HERE') {
    fetch(SHEET_CSV_URL)
      .then(function (res) { return res.text(); })
      .then(function (csv) { updateScheduleUI(parseSheetData(csv)); })
      .catch(function () { /* silently fail */ });
  }

}());
