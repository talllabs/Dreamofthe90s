(function () {
  'use strict';

  // ─────────────────────────────────────────────────────
  // CONSTANTS
  // ─────────────────────────────────────────────────────
  var KEYS = {
    PW:        'camp_admin_pw',
    APIKEY:    'camp_jsonbin_key',
    BIN:       'camp_jsonbin_bin',
    COLLECTION:'camp_jsonbin_collection',
    DATA:      'camp_admin_data'
  };

  // Default collection — pre-configured for the "90s" collection
  var DEFAULT_COLLECTION_ID = '69d094fbaaba882197c28576';
  var SESSION_KEY = 'camp_admin_session';

  var WEEK_DEFS = [
    { num: 1, dates: 'June 8\u201312' },
    { num: 2, dates: 'June 15\u201319' },
    { num: 3, dates: 'June 22\u201326' },
    { num: 4, dates: 'June 29\u2013July 3' },
    { num: 5, dates: 'July 6\u201310' },
    { num: 6, dates: 'July 13\u201317' },
    { num: 7, dates: 'July 20\u201324' }
  ];

  var EMOJI_OPTS = [
    '\uD83E\uDD84','\uD83D\uDC36','\uD83D\uDC31','\uD83D\uDC38',
    '\uD83E\uDD8A','\uD83D\uDC30','\uD83E\uDDB8','\uD83D\uDE80',
    '\uD83C\uDF08','\u2B50','\uD83C\uDFB8','\uD83E\uDD96',
    '\uD83D\uDC19','\uD83C\uDFAF','\uD83C\uDF66','\uD83C\uDF3B'
  ];

  var DEFAULT_CAMP_DATA = {
    weeks: WEEK_DEFS.map(function (w) {
      return { num: w.num, dates: w.dates, totalSpots: 8 };
    }),
    kids: []
  };

  // ─────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────
  var state = {
    campData: null,
    currentTab: 'registrations',
    currentFilter: 'all',
    editingKidId: null,
    saving: false
  };

  // ─────────────────────────────────────────────────────
  // UTILS
  // ─────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }

  function showScreen(name) {
    ['login', 'setup', 'app'].forEach(function (n) {
      var el = $('screen-' + n);
      if (el) el.style.display = n === name ? '' : 'none';
    });
  }

  function showToast(msg, duration) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, duration || 2200);
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function hashPw(pw) {
    // Simple obfuscation — not cryptographic, but enough for a camp site
    var h = 0;
    for (var i = 0; i < pw.length; i++) {
      h = (Math.imul(31, h) + pw.charCodeAt(i)) | 0;
    }
    return 'h_' + Math.abs(h).toString(16) + '_' + pw.length;
  }

  function verifyPw(pw) {
    return hashPw(pw) === localStorage.getItem(KEYS.PW);
  }

  // ─────────────────────────────────────────────────────
  // JSONBIN API
  // ─────────────────────────────────────────────────────
  function getApiKey()      { return localStorage.getItem(KEYS.APIKEY) || ''; }
  function getBinId()       { return localStorage.getItem(KEYS.BIN) || ''; }
  function getCollectionId(){ return localStorage.getItem(KEYS.COLLECTION) || DEFAULT_COLLECTION_ID; }

  function jsonbinFetch(method, path, body) {
    var opts = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': getApiKey()
      }
    };
    if (body) opts.body = JSON.stringify(body);
    return fetch('https://api.jsonbin.io/v3' + path, opts)
      .then(function (r) {
        if (!r.ok) throw new Error('JSONBin error ' + r.status);
        return r.json();
      });
  }

  function createBin(data) {
    return jsonbinFetch('POST', '/b', data);
  }

  function readBin(binId) {
    return jsonbinFetch('GET', '/b/' + binId + '/latest');
  }

  function updateBin(binId, data) {
    return jsonbinFetch('PUT', '/b/' + binId, data);
  }

  // ─────────────────────────────────────────────────────
  // LOCAL CACHE
  // ─────────────────────────────────────────────────────
  function saveLocal(data) {
    try { localStorage.setItem(KEYS.DATA, JSON.stringify(data)); } catch (e) {}
  }

  function loadLocal() {
    try {
      var raw = localStorage.getItem(KEYS.DATA);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  // ─────────────────────────────────────────────────────
  // DATA SYNC
  // ─────────────────────────────────────────────────────
  function fetchData() {
    var binId = getBinId();
    if (!binId) {
      // No JSONBin configured — use local only
      state.campData = loadLocal() || JSON.parse(JSON.stringify(DEFAULT_CAMP_DATA));
      renderAll();
      return Promise.resolve();
    }

    return readBin(binId)
      .then(function (res) {
        state.campData = res.record;
        saveLocal(state.campData);
        renderAll();
      })
      .catch(function () {
        // Fall back to local cache
        state.campData = loadLocal() || JSON.parse(JSON.stringify(DEFAULT_CAMP_DATA));
        renderAll();
        showToast('⚠️ Offline — showing cached data');
      });
  }

  function persistData() {
    if (!state.campData) return Promise.resolve();
    saveLocal(state.campData);

    var binId = getBinId();
    if (!binId) return Promise.resolve();

    state.saving = true;
    return updateBin(binId, state.campData)
      .then(function () { state.saving = false; showToast('✅ Saved!'); })
      .catch(function () { state.saving = false; showToast('⚠️ Saved locally — sync failed'); });
  }

  // ─────────────────────────────────────────────────────
  // RENDER HELPERS
  // ─────────────────────────────────────────────────────
  function getWeekDef(num) {
    return WEEK_DEFS.find(function (w) { return w.num === num; }) || {};
  }

  function getWeekData(num) {
    if (!state.campData) return { num: num, totalSpots: 8 };
    return state.campData.weeks.find(function (w) { return w.num === num; }) ||
           { num: num, totalSpots: 8 };
  }

  function calcOwed(kid) {
    var n = (kid.weeks || []).length;
    if (n === 0) return 0;
    return n === 7 ? 3000 : n * 500;
  }

  function fmtMoney(n) { return '$' + Number(n || 0).toLocaleString(); }

  function statusBadge(status) {
    var cls = status === 'booked' ? 'status-pill--booked' : 'status-pill--pending';
    var label = status === 'booked' ? '✓ Booked' : '⏳ Pending';
    return '<span class="status-pill ' + cls + '">' + label + '</span>';
  }

  function renderAll() {
    renderRegistrations();
    renderWeeks();
    renderDeleted();
  }

  // ─────────────────────────────────────────────────────
  // REGISTRATIONS TAB
  // ─────────────────────────────────────────────────────
  function renderRegistrations() {
    if (!state.campData) return;
    var kids = state.campData.kids;
    var filter = state.currentFilter;
    var filtered = filter === 'all' ? kids : kids.filter(function (k) { return k.status === filter; });

    var countEl = $('reg-count');
    countEl.textContent = kids.length + (kids.length === 1 ? ' kid' : ' kids');
    countEl.className = 'a-badge' + (kids.length === 0 ? '' : kids.length <= 3 ? ' a-badge--orange' : ' a-badge--green');

    var list = $('registrations-list');
    if (filtered.length === 0) {
      list.innerHTML = '<div class="reg-empty">' + (kids.length === 0 ? '😊 No registrations yet.<br>Use the + Add tab to add one.' : '😊 No ' + filter + ' registrations.') + '</div>';
      return;
    }

    list.innerHTML = filtered.map(function (kid) {
      var weeks = (kid.weeks || []).map(function (wn) {
        var def = getWeekDef(wn);
        return '<span class="reg-week-chip">Week ' + wn + (def.dates ? ' · ' + def.dates : '') + '</span>';
      }).join('');
      var meta = [kid.parentName, kid.email, kid.parentPhone].filter(Boolean).join(' · ');
      var owed    = calcOwed(kid);
      var paid    = kid.amountPaid || 0;
      var balance = owed - paid;
      var payHtml = '<div class="reg-payment">' +
        '<span class="pay-item">Owes: <strong>' + fmtMoney(owed) + '</strong></span>' +
        '<span class="pay-item">Paid: <strong>' + fmtMoney(paid) + '</strong></span>' +
        '<span class="pay-item ' + (balance <= 0 ? 'pay-clear' : 'pay-due') + '">Balance: <strong>' +
          fmtMoney(Math.abs(balance)) + (balance <= 0 ? ' ✓' : ' due') + '</strong></span>' +
        (kid.paidAt ? '<span class="pay-date">Paid ' + kid.paidAt + '</span>' : '') +
        '</div>';
      return '<div class="reg-card" data-id="' + kid.id + '">' +
        '<div class="reg-card-top">' +
          '<div class="reg-info">' +
            '<div class="reg-child-name">' + esc(kid.childName || 'Unnamed') + '</div>' +
          '</div>' +
          '<div class="reg-status">' + statusBadge(kid.status) + '</div>' +
        '</div>' +
        '<div class="reg-details">' +
          (kid.childAge    ? '<div class="reg-detail-row"><span class="reg-detail-label">Age</span><span>' + esc(String(kid.childAge)) + '</span></div>' : '') +
          (kid.parentName  ? '<div class="reg-detail-row"><span class="reg-detail-label">Parent</span><span>' + esc(kid.parentName) + '</span></div>' : '') +
          (kid.parentPhone ? '<div class="reg-detail-row"><span class="reg-detail-label">Phone</span><span>' + esc(kid.parentPhone) + '</span></div>' : '') +
          (kid.email       ? '<div class="reg-detail-row"><span class="reg-detail-label">Email</span><span>' + esc(kid.email) + '</span></div>' : '') +
          (kid.registeredAt? '<div class="reg-detail-row"><span class="reg-detail-label">Registered</span><span>' + esc(kid.registeredAt) + '</span></div>' : '') +
          (kid.notes       ? '<div class="reg-detail-row"><span class="reg-detail-label">Notes</span><span>' + esc(kid.notes) + '</span></div>' : '') +
        '</div>' +
        (weeks ? '<div class="reg-weeks">' + weeks + '</div>' : '') +
        payHtml +
        '<div class="reg-actions">' +
          '<button class="a-btn a-btn--sm" data-action="edit" data-id="' + kid.id + '">✏️ Edit</button>' +
          (kid.status === 'pending'
            ? '<button class="a-btn a-btn--sm a-btn--green" data-action="mark-booked" data-id="' + kid.id + '">✓ Mark Booked</button>'
            : '<button class="a-btn a-btn--sm a-btn--orange" data-action="mark-pending" data-id="' + kid.id + '">↩ Mark Pending</button>') +
          '<button class="a-btn a-btn--sm a-btn--red" data-action="delete" data-id="' + kid.id + '">🗑</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  // ─────────────────────────────────────────────────────
  // WEEKS TAB
  // ─────────────────────────────────────────────────────
  function renderWeeks() {
    if (!state.campData) return;
    var list = $('weeks-list');
    list.innerHTML = state.campData.weeks.map(function (week) {
      var kidsThisWeek = state.campData.kids.filter(function (k) {
        return (k.weeks || []).indexOf(week.num) !== -1;
      });
      var booked  = kidsThisWeek.filter(function (k) { return k.status === 'booked'; });
      var pending = kidsThisWeek.filter(function (k) { return k.status === 'pending'; });
      var avail = week.totalSpots - booked.length - pending.length;

      var kidsHtml = kidsThisWeek.length
        ? kidsThisWeek.map(function (k) {
            return '<span class="week-kid-pill status-' + k.status + '">' +
              esc(k.childName || 'Unnamed') + (k.status === 'booked' ? ' ✓' : ' …') + '</span>';
          }).join('')
        : '<span style="font-size:0.8rem;color:#aaa;">No kids yet</span>';

      var availCls = avail <= 0 ? 'a-badge--red' : avail <= 2 ? 'a-badge--orange' : 'a-badge--green';

      return '<div class="week-admin-card">' +
        '<div class="week-admin-top">' +
          '<div>' +
            '<div class="week-admin-label">Week ' + week.num + '</div>' +
            '<div class="week-admin-dates">' + week.dates + '</div>' +
          '</div>' +
          '<div class="week-admin-spots">' +
            '<span class="week-spots-label">Total spots:</span>' +
            '<input class="week-spots-input" type="number" min="0" max="30" value="' + week.totalSpots + '" data-week="' + week.num + '" />' +
          '</div>' +
        '</div>' +
        '<div class="week-stats">' +
          '<span class="a-badge ' + availCls + '">' + Math.max(0, avail) + ' available</span>' +
          '<span>✓ ' + booked.length + ' booked</span>' +
          '<span>⏳ ' + pending.length + ' pending</span>' +
        '</div>' +
        '<div class="week-kids-row">' + kidsHtml + '</div>' +
      '</div>';
    }).join('');

    // Bind spot inputs with debounce
    list.querySelectorAll('.week-spots-input').forEach(function (input) {
      var timer;
      input.addEventListener('input', function () {
        clearTimeout(timer);
        var num = parseInt(this.dataset.week, 10);
        var val = Math.max(0, parseInt(this.value, 10) || 0);
        timer = setTimeout(function () {
          var w = state.campData.weeks.find(function (wk) { return wk.num === num; });
          if (w) { w.totalSpots = val; persistData(); }
        }, 800);
      });
    });
  }

  // ─────────────────────────────────────────────────────
  // ADD / EDIT REGISTRATION
  // ─────────────────────────────────────────────────────
  function getFormValues(prefix) {
    prefix = prefix || 'f-';
    var weeks = [];
    document.querySelectorAll('input[name="' + prefix + 'weeks"]:checked').forEach(function (cb) {
      weeks.push(parseInt(cb.value, 10));
    });
    return {
      childName:  ($('f-child-name') && $('f-child-name').value.trim()) || '',
      childAge:   $('f-child-age') && $('f-child-age').value ? parseInt($('f-child-age').value, 10) : null,
      parentName: ($('f-parent-name') && $('f-parent-name').value.trim()) || '',
      parentPhone:($('f-parent-phone') && $('f-parent-phone').value.trim()) || '',
      email:      ($('f-parent-email') && $('f-parent-email').value.trim()) || '',
      weeks:      weeks,
      status:      $('f-status') ? $('f-status').value : 'pending',
      amountPaid:  $('f-amount-paid') && $('f-amount-paid').value !== '' ? parseFloat($('f-amount-paid').value) : 0,
      paidAt:      ($('f-paid-at') && $('f-paid-at').value) || '',
      notes:      ($('f-notes') && $('f-notes').value.trim()) || ''
    };
  }

  function validateKid(data, errorEl, excludeId) {
    if (!data.childName) { showErr(errorEl, 'Please enter the child\'s name.'); return false; }
    if (!data.weeks.length) { showErr(errorEl, 'Please select at least one week.'); return false; }
    return true;
  }

  function showErr(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.classList.add('visible');
    setTimeout(function () { el.classList.remove('visible'); }, 4000);
  }

  function clearAddForm() {
    ['f-child-name','f-child-age','f-parent-name','f-parent-phone','f-parent-email','f-notes'].forEach(function (id) {
      var el = $(id); if (el) el.value = '';
    });
    document.querySelectorAll('input[name="f-weeks"]').forEach(function (cb) { cb.checked = false; });
    if ($('f-status'))       $('f-status').value       = 'pending';
    if ($('f-amount-paid'))  $('f-amount-paid').value  = '';
    if ($('f-paid-at'))      $('f-paid-at').value      = '';
    if ($('add-cancel-btn')) $('add-cancel-btn').style.display = 'none';
    if ($('add-form-title-text')) $('add-form-title-text').textContent = 'Add Registration';
    state.editingKidId = null;
  }

  function fillAddForm(kid) {
    if ($('f-child-name')) $('f-child-name').value = kid.childName || '';
    if ($('f-child-age'))  $('f-child-age').value  = kid.childAge  || '';
    if ($('f-parent-name')) $('f-parent-name').value = kid.parentName  || '';
    if ($('f-parent-phone')) $('f-parent-phone').value = kid.parentPhone || '';
    if ($('f-parent-email')) $('f-parent-email').value = kid.email  || '';
    if ($('f-notes'))      $('f-notes').value      = kid.notes     || '';
    if ($('f-status'))      $('f-status').value      = kid.status     || 'pending';
    if ($('f-amount-paid')) $('f-amount-paid').value = kid.amountPaid != null ? kid.amountPaid : '';
    if ($('f-paid-at'))     $('f-paid-at').value     = kid.paidAt     || '';
    document.querySelectorAll('input[name="f-weeks"]').forEach(function (cb) {
      cb.checked = (kid.weeks || []).indexOf(parseInt(cb.value, 10)) !== -1;
    });
    if ($('add-form-title-text')) $('add-form-title-text').textContent = 'Edit Registration';
    if ($('add-cancel-btn')) $('add-cancel-btn').style.display = '';
  }

  function submitKid() {
    var errorEl = $('add-error');
    var successEl = $('add-success');
    errorEl.classList.remove('visible');
    successEl.classList.remove('visible');

    var data = getFormValues();
    if (!validateKid(data, errorEl, state.editingKidId)) return;

    if (state.editingKidId) {
      // Update existing
      var idx = state.campData.kids.findIndex(function (k) { return k.id === state.editingKidId; });
      if (idx !== -1) {
        Object.assign(state.campData.kids[idx], data);
      }
      showToast('✅ Registration updated!');
    } else {
      // Add new
      data.id = uid();
      data.registeredAt = new Date().toISOString().slice(0, 10);
      state.campData.kids.push(data);
      showToast('✅ Registration added!');
    }

    persistData().then(function () { renderAll(); });
    clearAddForm();
    successEl.textContent = state.editingKidId ? 'Registration updated!' : 'Registration saved!';
    successEl.classList.add('visible');
    setTimeout(function () { successEl.classList.remove('visible'); }, 3000);
  }

  // ─────────────────────────────────────────────────────
  // EVENT DELEGATION — REGISTRATION CARDS
  // ─────────────────────────────────────────────────────
  function handleRegAction(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    var id = btn.dataset.id;
    var kid = state.campData.kids.find(function (k) { return k.id === id; });
    if (!kid) return;

    if (action === 'delete') {
      openDeleteModal(kid);
    }
    if (action === 'mark-booked') {
      kid.status = 'booked';
      persistData().then(renderAll);
      showToast('✅ Marked as booked!');
    }
    if (action === 'mark-pending') {
      kid.status = 'pending';
      persistData().then(renderAll);
      showToast('⏳ Marked as pending');
    }
    if (action === 'edit') {
      state.editingKidId = id;
      fillAddForm(kid);
      showTab('add');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // ─────────────────────────────────────────────────────
  // DELETE MODAL (type "delete" to confirm — soft delete)
  // ─────────────────────────────────────────────────────
  var deleteTargetId = null;

  function openDeleteModal(kid) {
    deleteTargetId = kid.id;
    $('delete-modal-name').textContent = kid.childName || 'this registration';
    $('delete-confirm-input').value = '';
    $('delete-modal-confirm').disabled = true;
    $('delete-overlay').style.display = 'flex';
    setTimeout(function () { $('delete-confirm-input').focus(); }, 50);
  }

  function closeDeleteModal() {
    $('delete-overlay').style.display = 'none';
    deleteTargetId = null;
  }

  if ($('delete-confirm-input')) {
    $('delete-confirm-input').addEventListener('input', function () {
      $('delete-modal-confirm').disabled = this.value.trim().toLowerCase() !== 'delete';
    });
  }
  if ($('delete-modal-cancel')) {
    $('delete-modal-cancel').addEventListener('click', closeDeleteModal);
  }
  if ($('delete-overlay')) {
    $('delete-overlay').addEventListener('click', function (e) {
      if (e.target === $('delete-overlay')) closeDeleteModal();
    });
  }
  if ($('delete-modal-confirm')) {
    $('delete-modal-confirm').addEventListener('click', function () {
      if (!deleteTargetId) return;
      var idx = state.campData.kids.findIndex(function (k) { return k.id === deleteTargetId; });
      if (idx === -1) { closeDeleteModal(); return; }
      var removed = state.campData.kids.splice(idx, 1)[0];
      removed.deletedAt = new Date().toISOString().slice(0, 10);
      if (!Array.isArray(state.campData.deleted)) state.campData.deleted = [];
      state.campData.deleted.push(removed);
      persistData().then(renderAll);
      closeDeleteModal();
      showToast('🗑 Moved to Deleted');
    });
  }

  // ─────────────────────────────────────────────────────
  // DELETED TAB
  // ─────────────────────────────────────────────────────
  function renderDeleted() {
    if (!state.campData) return;
    var deleted = state.campData.deleted || [];
    var countEl = $('deleted-count');
    if (countEl) countEl.textContent = deleted.length;
    var list = $('deleted-list');
    if (!list) return;
    if (deleted.length === 0) {
      list.innerHTML = '<div class="reg-empty">No deleted records.</div>';
      return;
    }
    list.innerHTML = deleted.map(function (kid) {
      var weeks = (kid.weeks || []).map(function (wn) {
        var def = getWeekDef(wn);
        return '<span class="reg-week-chip">Week ' + wn + (def.dates ? ' · ' + def.dates : '') + '</span>';
      }).join('');
      return '<div class="reg-card" style="opacity:0.75;" data-id="' + kid.id + '">' +
        '<div class="reg-card-top">' +
          '<div class="reg-info">' +
            '<div class="reg-child-name">' + esc(kid.childName || 'Unnamed') + (kid.childAge ? ', age ' + kid.childAge : '') + '</div>' +
            '<div class="reg-parent-name">' + esc(kid.parentName || '') + '</div>' +
          '</div>' +
          '<div class="reg-status"><span style="font-size:0.75rem;color:#999;">Deleted ' + (kid.deletedAt || '') + '</span></div>' +
        '</div>' +
        (weeks ? '<div class="reg-weeks">' + weeks + '</div>' : '') +
        '<div class="reg-actions">' +
          '<button class="a-btn a-btn--sm a-btn--green" data-action="reinstate" data-id="' + kid.id + '">↩ Reinstate</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  // Reinstate action — delegated from deleted-list
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action="reinstate"]');
    if (!btn) return;
    var id = btn.dataset.id;
    if (!state.campData || !Array.isArray(state.campData.deleted)) return;
    var idx = state.campData.deleted.findIndex(function (k) { return k.id === id; });
    if (idx === -1) return;
    var kid = state.campData.deleted.splice(idx, 1)[0];
    delete kid.deletedAt;
    kid.status = 'pending';
    state.campData.kids.push(kid);
    persistData().then(renderAll);
    showToast('✅ ' + (kid.childName || 'Record') + ' reinstated!');
  });

  // ─────────────────────────────────────────────────────
  // TABS
  // ─────────────────────────────────────────────────────
  function showTab(tabName) {
    state.currentTab = tabName;
    ['registrations', 'weeks', 'add', 'deleted'].forEach(function (t) {
      var panel = $('tab-' + t);
      if (panel) panel.style.display = t === tabName ? '' : 'none';
    });
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
  }

  // ─────────────────────────────────────────────────────
  // SETTINGS DRAWER
  // ─────────────────────────────────────────────────────
  function openSettings() {
    $('s-api-key').value = getApiKey();
    $('s-bin-id').value = getBinId();
    if ($('s-collection-id')) $('s-collection-id').value = getCollectionId();
    updateSnippet();
    $('settings-overlay').classList.add('open');
    $('settings-drawer').classList.add('open');
  }

  function closeSettings() {
    $('settings-overlay').classList.remove('open');
    $('settings-drawer').classList.remove('open');
  }

  function updateSnippet() {
    var binId = getBinId();
    if (binId) {
      var snippet = '<meta name="camp-bin-id" content="' + binId + '" />';
      snippet += '\n  <!-- Add your JSONBin Access Key (NOT master key) below -->';
      snippet += '\n  <meta name="camp-jsonbin-key" content="YOUR_ACCESS_KEY_HERE" />';
      $('s-snippet').textContent = snippet;
      $('s-snippet-section').style.display = '';
    } else {
      $('s-snippet-section').style.display = 'none';
    }
  }

  // ─────────────────────────────────────────────────────
  // SETUP FLOW
  // ─────────────────────────────────────────────────────
  function doSetup() {
    var pw  = $('setup-password').value;
    var pw2 = $('setup-password2').value;
    var key = $('setup-apikey').value.trim();
    var err = $('setup-error');
    err.classList.remove('visible');

    if (pw.length < 6) { showErr(err, 'Password must be at least 6 characters.'); return; }
    if (pw !== pw2)    { showErr(err, 'Passwords don\'t match.'); return; }

    // Save password
    localStorage.setItem(KEYS.PW, hashPw(pw));

    if (key) {
      localStorage.setItem(KEYS.APIKEY, key);
      // Try to create a bin
      $('setup-submit').disabled = true;
      $('setup-submit').textContent = 'Creating your data bin…';

      var initData = JSON.parse(JSON.stringify(DEFAULT_CAMP_DATA));
      var collId = getCollectionId();
      var headers = { 'Content-Type': 'application/json', 'X-Master-Key': key, 'X-Bin-Name': '90s-day-camp', 'X-Bin-Private': 'false' };
      if (collId) headers['X-Collection-Id'] = collId;
      fetch('https://api.jsonbin.io/v3/b', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(initData)
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.metadata && res.metadata.id) {
            localStorage.setItem(KEYS.BIN, res.metadata.id);
            saveLocal(initData);
            state.campData = initData;
          }
          bootApp();
        })
        .catch(function () {
          // JSONBin failed — continue without it
          saveLocal(JSON.parse(JSON.stringify(DEFAULT_CAMP_DATA)));
          state.campData = JSON.parse(JSON.stringify(DEFAULT_CAMP_DATA));
          bootApp();
          showToast('⚠️ Couldn\'t connect to JSONBin — saved locally only');
        });
    } else {
      // No JSONBin — local only
      saveLocal(JSON.parse(JSON.stringify(DEFAULT_CAMP_DATA)));
      state.campData = JSON.parse(JSON.stringify(DEFAULT_CAMP_DATA));
      bootApp();
    }
  }

  function bootApp() {
    showScreen('app');
    fetchData().then(renderAll);
  }

  // ─────────────────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────────────────
  function init() {
    var hasPw = !!localStorage.getItem(KEYS.PW);

    if (!hasPw) {
      showScreen('setup');
      $('setup-submit').addEventListener('click', doSetup);
      return;
    }

    // Skip login if already authenticated in this browser session
    if (sessionStorage.getItem(SESSION_KEY)) {
      bootApp();
      return;
    }

    showScreen('login');

    // Login
    $('login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var pw = $('login-password').value;
      if (verifyPw(pw)) {
        sessionStorage.setItem(SESSION_KEY, '1');
        $('login-password').value = '';
        bootApp();
      } else {
        $('login-error').textContent = 'Wrong password — try again.';
        $('login-error').classList.add('visible');
        $('login-password').value = '';
        $('login-password').focus();
        setTimeout(function () { $('login-error').classList.remove('visible'); }, 3000);
      }
    });
  }

  // ─────────────────────────────────────────────────────
  // BIND APP EVENTS (after DOM ready)
  // ─────────────────────────────────────────────────────
  function bindAppEvents() {
    // Tabs
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { showTab(btn.dataset.tab); });
    });

    // Registrations delegation
    var regList = $('registrations-list');
    if (regList) regList.addEventListener('click', handleRegAction);

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        state.currentFilter = btn.dataset.filter;
        renderRegistrations();
      });
    });

    // Add form submit
    var addBtn = $('add-submit-btn');
    if (addBtn) addBtn.addEventListener('click', submitKid);

    var cancelBtn = $('add-cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', function () {
      clearAddForm();
      showTab('registrations');
    });


    // Header buttons
    var btnSettings = $('btn-settings');
    if (btnSettings) btnSettings.addEventListener('click', openSettings);

    var btnLogout = $('btn-logout');
    if (btnLogout) btnLogout.addEventListener('click', function () {
      sessionStorage.removeItem(SESSION_KEY);
      showScreen('login');
      showToast('Logged out');
    });

    // Settings drawer
    var overlay = $('settings-overlay');
    var sClose  = $('s-close');
    if (overlay) overlay.addEventListener('click', closeSettings);
    if (sClose)  sClose.addEventListener('click', closeSettings);

    // Change password
    var sChangePw = $('s-change-pw');
    if (sChangePw) sChangePw.addEventListener('click', function () {
      var newPw  = $('s-new-pw').value;
      var newPw2 = $('s-new-pw2').value;
      var err = $('s-pw-error');
      if (newPw.length < 6) { showErr(err, 'Password must be at least 6 characters.'); return; }
      if (newPw !== newPw2)  { showErr(err, 'Passwords don\'t match.'); return; }
      localStorage.setItem(KEYS.PW, hashPw(newPw));
      $('s-new-pw').value = '';
      $('s-new-pw2').value = '';
      showToast('🔒 Password updated!');
    });

    // Save config
    var sSaveConfig = $('s-save-config');
    if (sSaveConfig) sSaveConfig.addEventListener('click', function () {
      var key    = $('s-api-key').value.trim();
      var binId  = $('s-bin-id').value.trim();
      var collId = $('s-collection-id') ? $('s-collection-id').value.trim() : '';
      if (key)    localStorage.setItem(KEYS.APIKEY, key);
      if (binId)  localStorage.setItem(KEYS.BIN, binId);
      if (collId) localStorage.setItem(KEYS.COLLECTION, collId);
      updateSnippet();
      showToast('✅ Config saved!');
    });

    // Create new bin
    var sCreateBin = $('s-create-bin');
    if (sCreateBin) sCreateBin.addEventListener('click', function () {
      var key = $('s-api-key').value.trim() || getApiKey();
      if (!key) { showErr($('s-bin-error'), 'Enter your JSONBin master key first.'); return; }
      sCreateBin.disabled = true;
      sCreateBin.textContent = 'Creating…';
      localStorage.setItem(KEYS.APIKEY, key);
      var data = state.campData || JSON.parse(JSON.stringify(DEFAULT_CAMP_DATA));
      var collId2 = $('s-collection-id') ? $('s-collection-id').value.trim() || getCollectionId() : getCollectionId();
      var createHeaders = { 'Content-Type': 'application/json', 'X-Master-Key': key, 'X-Bin-Name': '90s-day-camp', 'X-Bin-Private': 'false' };
      if (collId2) createHeaders['X-Collection-Id'] = collId2;
      fetch('https://api.jsonbin.io/v3/b', {
        method: 'POST',
        headers: createHeaders,
        body: JSON.stringify(data)
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          sCreateBin.disabled = false;
          sCreateBin.textContent = 'Create New Bin';
          if (res.metadata && res.metadata.id) {
            localStorage.setItem(KEYS.BIN, res.metadata.id);
            $('s-bin-id').value = res.metadata.id;
            updateSnippet();
            showToast('✅ Bin created!');
          } else {
            showErr($('s-bin-error'), 'JSONBin response unexpected — check your API key.');
          }
        })
        .catch(function () {
          sCreateBin.disabled = false;
          sCreateBin.textContent = 'Create New Bin';
          showErr($('s-bin-error'), 'Network error — check your API key and try again.');
        });
    });

    // Copy snippet
    var sCopySnippet = $('s-copy-snippet');
    if (sCopySnippet) sCopySnippet.addEventListener('click', function () {
      var snippet = $('s-snippet').textContent;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(snippet).then(function () { showToast('📋 Copied!'); });
      } else {
        // Fallback
        var ta = document.createElement('textarea');
        ta.value = snippet;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('📋 Copied!');
      }
    });

    // ── Export Excel ──
    var sExportExcel = $('s-export-excel');
    if (sExportExcel) sExportExcel.addEventListener('click', function () {
      if (!state.campData) return;
      var kids = state.campData.kids || [];
      var weeks = state.campData.weeks || [];
      var date = new Date().toISOString().slice(0, 10);

      function kidRow(k) {
        return {
          'Child Name':    k.childName   || '',
          'Age':           k.childAge    || '',
          'Parent Name':   k.parentName  || '',
          'Phone':         k.parentPhone || '',
          'Email':         k.email       || '',
          'Weeks':          (k.weeks || []).join(', '),
          'Status':         k.status       || '',
          'Total Owed':     fmtMoney(calcOwed(k)),
          'Amount Paid':    fmtMoney(k.amountPaid || 0),
          'Balance':        fmtMoney(calcOwed(k) - (k.amountPaid || 0)),
          'Payment Date':   k.paidAt       || '',
          'Registered':     k.registeredAt || '',
          'Notes':          k.notes        || ''
        };
      }

      var wb = XLSX.utils.book_new();

      // Sheet 1: All registrations
      var allRows = kids.map(kidRow);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allRows.length ? allRows : [{}]), 'All Registrations');

      // Sheet 2: Confirmed (booked)
      var bookedRows = kids.filter(function (k) { return k.status === 'booked'; }).map(kidRow);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bookedRows.length ? bookedRows : [{}]), 'Confirmed');

      // Sheet 3: Pending
      var pendingRows = kids.filter(function (k) { return k.status === 'pending'; }).map(kidRow);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pendingRows.length ? pendingRows : [{}]), 'Pending');

      // Sheet 4: Weekly schedule — one row per kid per week
      var schedRows = [];
      weeks.forEach(function (wk) {
        var wkKids = kids.filter(function (k) { return (k.weeks || []).indexOf(wk.num) !== -1; });
        if (wkKids.length === 0) {
          schedRows.push({ 'Week': 'Week ' + wk.num + ' (' + wk.dates + ')', 'Child Name': '', 'Status': '', 'Parent': '', 'Email': '' });
        } else {
          wkKids.forEach(function (k) {
            schedRows.push({
              'Week':       'Week ' + wk.num + ' (' + wk.dates + ')',
              'Child Name': k.childName  || '',
              'Status':     k.status     || '',
              'Parent':     k.parentName || '',
              'Email':      k.email      || ''
            });
          });
        }
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(schedRows.length ? schedRows : [{}]), 'Weekly Schedule');

      XLSX.writeFile(wb, '90s-camp-' + date + '.xlsx');
      showToast('✅ Excel exported!');
    });

    // ── Export PDF (print view) ──
    var sExportPdf = $('s-export-pdf');
    if (sExportPdf) sExportPdf.addEventListener('click', function () {
      if (!state.campData) return;
      var kids = state.campData.kids || [];
      var weeks = state.campData.weeks || [];
      var date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

      function statusLabel(s) { return s === 'booked' ? 'Confirmed' : 'Pending'; }

      var html = '<html><head><title>90s Day Camp Report</title><style>'
        + 'body{font-family:Arial,sans-serif;font-size:11pt;color:#111;padding:1.5rem;}'
        + 'h1{font-size:18pt;margin-bottom:0.25rem;}'
        + '.meta{color:#666;font-size:9pt;margin-bottom:1.5rem;}'
        + 'h2{font-size:13pt;margin:1.5rem 0 0.5rem;border-bottom:2px solid #333;padding-bottom:4px;}'
        + 'table{width:100%;border-collapse:collapse;margin-bottom:1rem;font-size:9.5pt;}'
        + 'th{background:#333;color:#fff;padding:5px 8px;text-align:left;}'
        + 'td{padding:5px 8px;border-bottom:1px solid #ddd;}'
        + 'tr:nth-child(even) td{background:#f5f5f5;}'
        + '.confirmed{color:#2a7a2a;font-weight:bold;}'
        + '.pending{color:#b06000;}'
        + '.due{color:#c00;font-weight:bold;}'
        + '.clear{color:#2a7a2a;}'
        + '.week-block{page-break-inside:avoid;}'
        + '@media print{body{padding:0;}}'
        + '</style></head><body>'
        + '<h1>90\'s Summer Day Camp</h1>'
        + '<div class="meta">Report generated ' + date + ' &nbsp;|&nbsp; '
        + kids.length + ' total registrations &nbsp;|&nbsp; '
        + kids.filter(function(k){return k.status==='booked';}).length + ' confirmed &nbsp;|&nbsp; '
        + kids.filter(function(k){return k.status==='pending';}).length + ' pending</div>';

      // Section 1: Weekly schedule
      html += '<h2>Weekly Schedule</h2>';
      weeks.forEach(function (wk) {
        var wkKids = kids.filter(function (k) { return (k.weeks || []).indexOf(wk.num) !== -1; });
        html += '<div class="week-block"><h2 style="font-size:11pt;border-bottom:1px solid #999;">Week '
          + wk.num + ' &mdash; ' + wk.dates
          + ' &nbsp;<span style="font-weight:normal;color:#555;">(' + wkKids.length + '/' + (wk.totalSpots || 8) + ' spots)</span></h2>';
        if (wkKids.length === 0) {
          html += '<p style="color:#999;font-size:9pt;">No registrations yet.</p>';
        } else {
          html += '<table><tr><th>Child</th><th>Age</th><th>Parent</th><th>Phone</th><th>Email</th><th>Status</th></tr>';
          wkKids.forEach(function (k) {
            html += '<tr><td>' + (k.childName||'') + '</td><td>' + (k.childAge||'')
              + '</td><td>' + (k.parentName||'') + '</td><td>' + (k.parentPhone||'')
              + '</td><td>' + (k.email||'')
              + '</td><td class="' + (k.status==='booked'?'confirmed':'pending') + '">' + statusLabel(k.status) + '</td></tr>';
          });
          html += '</table>';
        }
        html += '</div>';
      });

      // Section 2: All registrations
      // Section 2: Payment summary (invoice-ready)
      var totalOwed = kids.reduce(function(s,k){return s+calcOwed(k);},0);
      var totalPaid = kids.reduce(function(s,k){return s+(k.amountPaid||0);},0);
      html += '<h2>Payment Summary</h2><table>'
        + '<tr><th>Child</th><th>Parent</th><th>Phone</th><th>Weeks</th><th>Total Owed</th><th>Paid</th><th>Balance</th><th>Payment Date</th></tr>';
      if (kids.length === 0) {
        html += '<tr><td colspan="8" style="color:#999;">No registrations yet.</td></tr>';
      } else {
        kids.forEach(function (k) {
          var owed = calcOwed(k);
          var paid = k.amountPaid || 0;
          var bal  = owed - paid;
          html += '<tr><td>' + (k.childName||'') + '</td><td>' + (k.parentName||'')
            + '</td><td>' + (k.parentPhone||'')
            + '</td><td>' + (k.weeks||[]).map(function(w){return 'Wk '+w;}).join(', ')
            + '</td><td>' + fmtMoney(owed)
            + '</td><td>' + fmtMoney(paid)
            + '</td><td class="' + (bal<=0?'clear':'due') + '">' + fmtMoney(bal) + (bal<=0?' ✓':' due')
            + '</td><td>' + (k.paidAt||'—') + '</td></tr>';
        });
        html += '<tr style="font-weight:bold;background:#eee;"><td colspan="4">TOTAL</td>'
          + '<td>' + fmtMoney(totalOwed) + '</td><td>' + fmtMoney(totalPaid) + '</td>'
          + '<td class="' + (totalOwed-totalPaid<=0?'clear':'due') + '">' + fmtMoney(totalOwed-totalPaid) + '</td><td></td></tr>';
      }
      html += '</table>';

      // Section 3: All registrations
      html += '<h2>All Registrations</h2><table>'
        + '<tr><th>Child</th><th>Age</th><th>Parent</th><th>Phone</th><th>Email</th><th>Weeks</th><th>Status</th><th>Registered</th></tr>';
      if (kids.length === 0) {
        html += '<tr><td colspan="8" style="color:#999;">No registrations yet.</td></tr>';
      } else {
        kids.forEach(function (k) {
          html += '<tr><td>' + (k.childName||'') + '</td><td>' + (k.childAge||'')
            + '</td><td>' + (k.parentName||'') + '</td><td>' + (k.parentPhone||'')
            + '</td><td>' + (k.email||'')
            + '</td><td>' + (k.weeks||[]).map(function(w){return 'Wk '+w;}).join(', ')
            + '</td><td class="' + (k.status==='booked'?'confirmed':'pending') + '">' + statusLabel(k.status)
            + '</td><td>' + (k.registeredAt||'') + '</td></tr>';
        });
      }
      html += '</table></body></html>';

      var win = window.open('', '_blank');
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(function () { win.print(); }, 500);
    });

    // Reset data
    var sClear = $('s-clear');
    if (sClear) sClear.addEventListener('click', function () {
      if (!confirm('This will delete ALL registrations and reset all weeks to 8 spots. Are you sure?')) return;
      state.campData = JSON.parse(JSON.stringify(DEFAULT_CAMP_DATA));
      saveLocal(state.campData);
      if (getBinId()) persistData();
      renderAll();
      closeSettings();
      showToast('🗑 All data reset');
    });
  }

  // ─────────────────────────────────────────────────────
  // BOOT
  // ─────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    bindAppEvents();
    init();
  });

  function esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

}());
