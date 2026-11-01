// Home Inventory front-end. ITEMS, ALL_LOCATIONS, ALL_TAGS injected by templates/index.html
const $tbl = $('#tbl');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
  c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

// digits get the monospace font; entities like &#39; are left alone
const numfy = s => esc(s).replace(/(&#?\w+;)|(\d+)/g,
  (m, ent, d) => ent ? ent : '<span class="num">' + d + '</span>');

function expBadge(r) {
  if (!r.expiry_date) return '';
  if (r.expiry_status === 'expired')
    return '<span class="badge text-bg-danger num py-0 px-1 text-nowrap" style="font-size:0.7rem;">Expired ' + Math.abs(r.days_left) + 'd ago</span>';
  if (r.days_left === 0) return '<span class="badge text-bg-warning num py-0 px-1 text-nowrap" style="font-size:0.7rem;">Expires today</span>';
  if (r.expiry_status === 'soon')
    return '<span class="badge text-bg-warning num py-0 px-1 text-nowrap" style="font-size:0.7rem;">' + r.days_left + 'd left</span>';
  return '<span class="badge bg-success-subtle text-success-emphasis num py-0 px-1 text-nowrap" style="font-size:0.7rem;">' + r.days_left + 'd left</span>';
}

const expFmt = (v, r) => v
  ? '<div class="d-inline-flex align-items-center gap-1 text-nowrap"><span class="num small">' + esc(v) + '</span>' + expBadge(r) + '</div>'
  : '<span class="text-body-secondary">—</span>';

function conditionBadge(v) {
  if (!v) return '<span class="text-body-secondary">—</span>';
  const val = String(v).trim();
  switch (val) {
    case 'Brand New':
      return '<span class="badge bg-success-subtle text-success-emphasis border border-success-subtle py-0 px-1.5 text-nowrap">Brand New</span>';
    case 'Like New':
      return '<span class="badge bg-primary-subtle text-primary-emphasis border border-primary-subtle py-0 px-1.5 text-nowrap">Like New</span>';
    case 'Good':
      return '<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle py-0 px-1.5 text-nowrap">Good</span>';
    case 'Fair':
      return '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle py-0 px-1.5 text-nowrap">Fair</span>';
    case 'Poor':
      return '<span class="badge bg-secondary-subtle text-secondary-emphasis border border-secondary-subtle py-0 px-1.5 text-nowrap">Poor</span>';
    case 'Damaged / Broken':
      return '<span class="badge bg-danger-subtle text-danger-emphasis border border-danger-subtle py-0 px-1.5 text-nowrap">Broken</span>';
    default:
      return `<span class="badge bg-secondary-subtle text-secondary-emphasis py-0 px-1.5 text-nowrap">${esc(val)}</span>`;
  }
}

function amountLeftBadge(v) {
  if (v == null || v < 0 || v === '') return '<span class="text-body-secondary">—</span>';
  const pct = Math.max(0, Math.min(100, Number(v)));
  let barColor = 'bg-success';
  let textColor = 'text-success-emphasis';
  if (pct < 25) {
    barColor = 'bg-danger';
    textColor = 'text-danger-emphasis';
  } else if (pct < 60) {
    barColor = 'bg-warning';
    textColor = 'text-warning-emphasis';
  }
  return `
    <div class="d-inline-flex align-items-center gap-1 text-nowrap" title="${pct}% remaining">
      <div class="progress" style="height: 5px; width: 38px; min-width: 28px;" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <div class="progress-bar ${barColor}" style="width: ${pct}%;"></div>
      </div>
      <span class="num small fw-semibold ${textColor}">${pct}%</span>
    </div>
  `;
}

// Theme Switcher
function updateThemeIcon(theme) {
  $('#themeIcon').attr('class', theme === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-stars-fill');
}
const currentTheme = document.documentElement.getAttribute('data-bs-theme') || 'light';
updateThemeIcon(currentTheme);

// Radial Dark / Light Theme Toggle (View Transitions API + GSAP Fallback)
function toggleThemeWithRadialTransition(event) {
  const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
  const nextTheme = isDark ? 'light' : 'dark';

  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;
  if (event) {
    if (event.clientX !== undefined && event.clientX > 0) {
      x = event.clientX;
      y = event.clientY;
    } else if (event.currentTarget) {
      const rect = event.currentTarget.getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height / 2;
    }
  }

  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );

  const applyTheme = () => {
    document.documentElement.setAttribute('data-bs-theme', nextTheme);
    localStorage.setItem('theme', nextTheme);
    updateThemeIcon(nextTheme);
  };

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    applyTheme();
    return;
  }

  if (document.startViewTransition) {
    const transition = document.startViewTransition(() => {
      applyTheme();
    });

    transition.ready.then(() => {
      const clipPath = [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`
      ];
      document.documentElement.animate(
        { clipPath: clipPath },
        { duration: 480, easing: 'ease-in-out', pseudoElement: '::view-transition-new(root)' }
      );
    });
    return;
  }

  if (window.gsap) {
    const overlay = document.createElement('div');
    overlay.className = 'theme-radial-overlay';
    const computedBg = getComputedStyle(document.body).backgroundColor || (nextTheme === 'dark' ? '#212529' : '#ffffff');
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 999999;
      pointer-events: none;
      background-color: ${computedBg};
      clip-path: circle(0px at ${x}px ${y}px);
      -webkit-clip-path: circle(0px at ${x}px ${y}px);
    `;
    document.body.appendChild(overlay);

    gsap.to(overlay, {
      clipPath: `circle(${endRadius}px at ${x}px ${y}px)`,
      webkitClipPath: `circle(${endRadius}px at ${x}px ${y}px)`,
      duration: 0.45,
      ease: 'power2.inOut',
      onComplete: () => {
        applyTheme();
        gsap.to(overlay, {
          opacity: 0,
          duration: 0.2,
          ease: 'power1.out',
          onComplete: () => overlay.remove()
        });
      }
    });
    return;
  }

  applyTheme();
}

$('#themeToggle').on('click', function (e) {
  toggleThemeWithRadialTransition(e.originalEvent || e);
});

// Auto-close mobile navbar collapse on action click
$('#navbarContent button, #navbarContent a').on('click', function () {
  const navEl = document.getElementById('navbarContent');
  if (navEl && navEl.classList.contains('show')) {
    bootstrap.Collapse.getInstance(navEl)?.hide();
  }
});

// ============================================================================
// Modal Alert & Notification System
// ============================================================================
function showModalAlert(arg1, arg2 = 'info', arg3 = null) {
  let message, type, title, confirmText;
  if (typeof arg1 === 'object' && arg1 !== null) {
    message = arg1.message || '';
    type = arg1.type || 'info';
    title = arg1.title || null;
    confirmText = arg1.confirmText || 'OK';
  } else {
    message = arg1 || '';
    type = arg2 || 'info';
    title = arg3 || null;
    confirmText = 'OK';
  }

  const iconMap = {
    success: { icon: 'bi-check-circle-fill', color: 'text-success', defaultTitle: 'Success' },
    danger: { icon: 'bi-exclamation-circle-fill', color: 'text-danger', defaultTitle: 'Error' },
    warning: { icon: 'bi-exclamation-triangle-fill', color: 'text-warning', defaultTitle: 'Warning' },
    info: { icon: 'bi-info-circle-fill', color: 'text-primary', defaultTitle: 'Notice' },
    secondary: { icon: 'bi-info-circle-fill', color: 'text-secondary', defaultTitle: 'Notice' }
  };
  const conf = iconMap[type] || iconMap.info;
  const heading = title || conf.defaultTitle;

  $('#alertModalTitle').html(`<i class="bi ${conf.icon} ${conf.color} me-2"></i>${heading}`);
  $('#alertModalBody').html(message);

  const btnClass = type === 'danger' ? 'btn-danger' : (type === 'warning' ? 'btn-warning' : (type === 'success' ? 'btn-success' : 'btn-primary'));
  $('#alertModalOkBtn').text(confirmText).removeClass('btn-primary btn-success btn-danger btn-warning btn-info btn-secondary').addClass(btnClass);

  modal('alertModal').show();
}

function showBannerAlert(msg, type = 'info') {
  showModalAlert(msg, type);
}

// Auto-display any server flash messages in Alert Modal
const flashDataEl = document.getElementById('flashMessagesJson');
if (flashDataEl) {
  try {
    const flashes = JSON.parse(flashDataEl.getAttribute('data-flashes') || '[]');
    if (flashes.length > 0) {
      if (flashes.length === 1) {
        const [cat, text] = flashes[0];
        const titleMap = { success: 'Success', danger: 'Error', warning: 'Warning', info: 'Notice' };
        showModalAlert({ title: titleMap[cat] || 'Notice', message: esc(text), type: cat || 'info' });
      } else {
        const listHtml = '<ul class="mb-0 ps-3">' + flashes.map(f => `<li>${esc(f[1])}</li>`).join('') + '</ul>';
        showModalAlert({ title: 'Notifications', message: listHtml, type: flashes[0][0] || 'info' });
      }
    }
  } catch (e) {
    console.error('Error parsing flash messages', e);
  }
}

// ============================================================================
// Bootswatch Themes
// ============================================================================
const BOOTSWATCH_THEMES = [
  { id: 'default', name: 'Default', desc: 'Bootstrap 5 (Clean & classic)', mode: 'Light / Dark', colors: ['#0d6efd', '#6c757d', '#198754'] },
  { id: 'brite', name: 'Brite', desc: 'Neobrutalist form', mode: 'Light', colors: ['#a2e436', '#000000', '#68d391'] },
  { id: 'cerulean', name: 'Cerulean', desc: 'A calm blue sky', mode: 'Light', colors: ['#2fa4e7', '#e9ecef', '#73a839'] },
  { id: 'cosmo', name: 'Cosmo', desc: 'An ode to Metro', mode: 'Light', colors: ['#2780e3', '#373a3c', '#3fb618'] },
  { id: 'cyborg', name: 'Cyborg', desc: 'Jet black and electric blue', mode: 'Dark', colors: ['#2a9fd6', '#555555', '#77b300'] },
  { id: 'darkly', name: 'Darkly', desc: 'Flatly in night mode', mode: 'Dark', colors: ['#375a7f', '#444444', '#00bc8c'] },
  { id: 'flatly', name: 'Flatly', desc: 'Flat and modern', mode: 'Light', colors: ['#2c3e50', '#95a5a6', '#18bc9c'] },
  { id: 'journal', name: 'Journal', desc: 'Crisp like a new sheet of paper', mode: 'Light', colors: ['#eb6864', '#aaaaaa', '#22b24c'] },
  { id: 'litera', name: 'Litera', desc: 'The medium is the message', mode: 'Light', colors: ['#4582ec', '#adb5bd', '#02b875'] },
  { id: 'lumen', name: 'Lumen', desc: 'Light and shadow', mode: 'Light', colors: ['#158cba', '#f0f0f0', '#28b62c'] },
  { id: 'lux', name: 'Lux', desc: 'A touch of class', mode: 'Light', colors: ['#1a1a1a', '#999999', '#4bbf73'] },
  { id: 'materia', name: 'Materia', desc: 'Material is the metaphor', mode: 'Light', colors: ['#2196f3', '#ffffff', '#4caf50'] },
  { id: 'minty', name: 'Minty', desc: 'A fresh feel', mode: 'Light', colors: ['#78c2ad', '#f3969a', '#56cc9d'] },
  { id: 'morph', name: 'Morph', desc: 'A neumorphic layer', mode: 'Light', colors: ['#378dfc', '#d9e3f1', '#43cc29'] },
  { id: 'pulse', name: 'Pulse', desc: 'A trace of purple', mode: 'Light', colors: ['#593196', '#a991d4', '#13b955'] },
  { id: 'quartz', name: 'Quartz', desc: 'A glassmorphic layer', mode: 'Dark', colors: ['#e83283', '#686dc3', '#41d7a7'] },
  { id: 'sandstone', name: 'Sandstone', desc: 'A touch of warmth', mode: 'Light', colors: ['#325d88', '#8e8c84', '#93c54b'] },
  { id: 'simplex', name: 'Simplex', desc: 'Mini and minimalist', mode: 'Light', colors: ['#d9230f', '#777777', '#469408'] },
  { id: 'sketchy', name: 'Sketchy', desc: 'A hand-drawn look for mockups and mirth', mode: 'Light', colors: ['#333333', '#555555', '#28a745'] },
  { id: 'slate', name: 'Slate', desc: 'Shades of gunmetal gray', mode: 'Dark', colors: ['#3a3f44', '#7a8288', '#62c462'] },
  { id: 'solar', name: 'Solar', desc: 'A spin on Solarized', mode: 'Dark', colors: ['#b58900', '#839496', '#2aa198'] },
  { id: 'spacelab', name: 'Spacelab', desc: 'Silvery and sleek', mode: 'Light', colors: ['#446e9b', '#999999', '#3cb521'] },
  { id: 'superhero', name: 'Superhero', desc: 'The brave and the blue', mode: 'Dark', colors: ['#df6919', '#4e5d6c', '#5cb85c'] },
  { id: 'united', name: 'United', desc: 'Ubuntu orange and unique font', mode: 'Light', colors: ['#e95420', '#aea79f', '#38b44a'] },
  { id: 'vapor', name: 'Vapor', desc: 'A cyberpunk aesthetic', mode: 'Dark', colors: ['#6f42c1', '#ea39b8', '#3cf281'] },
  { id: 'yeti', name: 'Yeti', desc: 'A friendly foundation', mode: 'Light', colors: ['#008cba', '#eeeeee', '#43ac6a'] },
  { id: 'zephyr', name: 'Zephyr', desc: 'Breezy and beautiful', mode: 'Light', colors: ['#3459e6', '#ffffff', '#2fb380'] },
];

function renderThemeGrid() {
  const current = localStorage.getItem('bootswatch_theme') || 'default';
  const $grid = $('#themeGrid').empty();

  BOOTSWATCH_THEMES.forEach(t => {
    const isActive = t.id === current;
    const swatches = t.colors.map(c => `<span class="theme-swatch" style="background:${c};"></span>`).join('');
    const badgeClass = t.mode.includes('Dark') ? 'text-bg-dark' : 'text-bg-secondary';
    const cardHtml = `
      <div class="col">
        <div class="card h-100 theme-card p-3 ${isActive ? 'active-theme' : ''}" data-theme="${t.id}" role="button" tabindex="0">
          <div class="d-flex align-items-center justify-content-between mb-1">
            <h6 class="mb-0 fw-semibold">${esc(t.name)}</h6>
            <span class="theme-check ${isActive ? '' : 'd-none'}">
              <i class="bi bi-check-circle-fill text-success fs-5"></i>
            </span>
          </div>
          <div class="text-body-secondary small mb-2">${esc(t.desc)}</div>
          <div class="d-flex gap-1 align-items-center mt-auto">
            ${swatches}
            <span class="badge ${badgeClass} ms-auto small" style="font-size: 0.72rem;">${t.mode}</span>
          </div>
        </div>
      </div>
    `;
    $grid.append(cardHtml);
  });

  const found = BOOTSWATCH_THEMES.find(t => t.id === current);
  $('#currentThemeLabel').text(found ? found.name : 'Default');
}

function applyBootswatchTheme(themeId) {
  localStorage.setItem('bootswatch_theme', themeId);
  const darkThemes = ['cyborg', 'darkly', 'quartz', 'slate', 'solar', 'superhero', 'vapor'];
  if (darkThemes.includes(themeId)) {
    localStorage.setItem('theme', 'dark');
  } else if (themeId !== 'default') {
    localStorage.setItem('theme', 'light');
  }
  window.location.reload();
}

$(document).on('click', '.theme-card', function () {
  applyBootswatchTheme($(this).data('theme'));
});

$('#resetThemeBtn').on('click', function () {
  applyBootswatchTheme('default');
});

const initialTheme = localStorage.getItem('bootswatch_theme') || 'default';
const customFontThemes = ['cosmo', 'journal', 'lux', 'materia', 'minty', 'morph', 'sketchy', 'united'];
if (customFontThemes.includes(initialTheme)) {
  document.documentElement.setAttribute('data-theme-font', 'custom');
} else {
  document.documentElement.setAttribute('data-theme-font', 'classic');
}
renderThemeGrid();

// ============================================================================
// Extended State for Filters (Stock, Tags, Warranty, Location)
// ============================================================================
let activeLocationFilter = '';
let activeWarrantyFilter = false;

// Helpers
const byId = id => ITEMS.find(x => x.id === Number(id));
const modal = id => bootstrap.Modal.getOrCreateInstance(document.getElementById(id));

function swapModal(fromId, toId, prep) {
  const fromEl = document.getElementById(fromId);
  if (fromEl && fromEl.classList.contains('show')) {
    fromEl.addEventListener('hidden.bs.modal', () => {
      if (typeof prep === 'function') prep();
      modal(toId).show();
    }, { once: true });
    modal(fromId).hide();
  } else {
    if (typeof prep === 'function') prep();
    modal(toId).show();
  }
}

function swapTo(nextId, prep) {
  swapModal('detailModal', nextId, prep);
}

function showConfirmDialog({ title, message, confirmBtnText = 'Confirm', confirmBtnClass = 'btn-danger', icon = 'bi-exclamation-triangle-fill', onConfirm, onCancel }) {
  let isConfirmed = false;
  $('#confirmModalTitle').html(`<i class="bi ${icon} me-2 text-danger"></i>${title}`);
  $('#confirmModalMessage').html(message);

  const $btn = $('#confirmExecuteBtn');
  $btn.text(confirmBtnText).attr('class', `btn ${confirmBtnClass}`);

  $btn.off('click').one('click', function () {
    isConfirmed = true;
    modal('confirmModal').hide();
    if (typeof onConfirm === 'function') onConfirm();
  });

  const confirmEl = document.getElementById('confirmModal');
  const onHidden = function () {
    confirmEl.removeEventListener('hidden.bs.modal', onHidden);
    if (!isConfirmed && typeof onCancel === 'function') {
      onCancel();
    }
  };
  confirmEl.addEventListener('hidden.bs.modal', onHidden, { once: true });

  modal('confirmModal').show();
}

// ============================================================================
// Fuzzy Search Engine across all contents in rows
// ============================================================================
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const v0 = new Array(b.length + 1);
  const v1 = new Array(b.length + 1);
  for (let i = 0; i <= b.length; i++) v0[i] = i;
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
}

function isSubsequence(pattern, text) {
  let pIdx = 0;
  let tIdx = 0;
  while (pIdx < pattern.length && tIdx < text.length) {
    if (pattern[pIdx] === text[tIdx]) pIdx++;
    tIdx++;
  }
  return pIdx === pattern.length;
}

function matchToken(token, rowText, words) {
  if (!token) return true;
  if (rowText.includes(token)) return true;

  if (token.length >= 3) {
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w.length >= token.length && isSubsequence(token, w)) return true;
    }
  }

  const maxDist = token.length <= 4 ? 1 : (token.length <= 8 ? 2 : 3);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (Math.abs(w.length - token.length) <= maxDist) {
      if (levenshtein(token, w) <= maxDist) return true;
    }
  }

  return false;
}

function fuzzyMatchRow(row, query) {
  if (!query || !query.trim()) return true;

  const fields = [
    row.name || '',
    row.category || '',
    row.location || '',
    row.notes || '',
    row.condition || '',
    row.tags || '',
    (row.tags_list || []).join(' '),
    row.status || '',
    row.taken_out ? 'taken out' : 'in place',
    row.taken_to || '',
    row.expiry_date || '',
    row.warranty_expiry || '',
    row.quantity != null ? String(row.quantity) : '',
    row.amount_left != null && row.amount_left >= 0 ? `${row.amount_left}% ${row.amount_left}` : '',
    row.purchase_price != null ? String(row.purchase_price) : '',
    row.purchase_date || ''
  ];

  const fullText = fields.join(' ').toLowerCase();
  const cleanFullText = fullText.replace(/[^a-z0-9\s-]/g, ' ');
  const words = cleanFullText.split(/\s+/).filter(Boolean);

  const qLower = query.toLowerCase().trim();

  // Instant pass if substring match on raw or clean full text
  if (fullText.includes(qLower) || cleanFullText.includes(qLower)) return true;

  // Multi-term query: ALL tokens must match
  const tokens = qLower.split(/\s+/).filter(Boolean);
  return tokens.every(t => matchToken(t, fullText, words));
}

// Hide empty property rows in Card / Grid view (only show if present)
function hideEmptyCardViewRows() {
  $('.fixed-table-container.has-card-view .card-view, .bootstrap-table.has-card-view .card-view').each(function () {
    const $row = $(this);
    if ($row.is(':first-child') || $row.is(':last-child')) return;
    const title = $row.find('.card-view-title').text().trim().toLowerCase();
    if (title === 'item' || title === 'actions') return;

    const $val = $row.find('.card-view-value');
    if (!$val.length) return;
    const txt = $val.text().trim();
    if (txt === '—' || txt === '' || txt === 'None' || txt === 'N/A' || $val.find('.text-body-secondary:only-child').text().trim() === '—') {
      $row.addClass('d-none empty-field');
    } else {
      $row.removeClass('d-none empty-field');
    }
  });
}

// Custom Box / Location Code Generator (e.g. B1-A, B1-B, B2-A)
function getNextLocationCode() {
  const existingLocs = ITEMS.map(it => it.location || '').filter(Boolean);
  const codeRegex = /^([A-Za-z]+)(\d+)-([A-Za-z]+)$/;
  let maxBox = 1;
  let maxSlotIdx = -1;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  existingLocs.forEach(loc => {
    const m = loc.trim().match(codeRegex);
    if (m) {
      const bNum = parseInt(m[2], 10);
      const letter = m[3].toUpperCase();
      const sIdx = alphabet.indexOf(letter);
      if (bNum > maxBox) {
        maxBox = bNum;
        maxSlotIdx = sIdx;
      } else if (bNum === maxBox && sIdx > maxSlotIdx) {
        maxSlotIdx = sIdx;
      }
    }
  });

  if (maxSlotIdx === -1) {
    return 'B1-A';
  }

  if (maxSlotIdx < 25) {
    return `B${maxBox}-${alphabet[maxSlotIdx + 1]}`;
  } else {
    return `B${maxBox + 1}-A`;
  }
}

// ============================================================================
// Bootstrap Table Initialization
// ============================================================================
$tbl.bootstrapTable({
  data: ITEMS,
  idField: 'id',
  uniqueId: 'id',
  selectItemName: 'btSelectItem',
  maintainMetaData: true,
  clickToSelect: false,
  toolbar: '#toolbar',
  search: true,
  searchAlign: 'right',
  formatSearch: () => 'Search all contents (fuzzy)...',
  customSearch: function (data, text, filterColumns) {
    let result = data;
    if (text && text.trim()) {
      const q = text.trim();
      result = result.filter(row => fuzzyMatchRow(row, q));
    }
    const filterAlgo = this.options.filterOptions && this.options.filterOptions.filterAlgorithm;
    if (typeof filterAlgo === 'function') {
      result = result.filter(row => filterAlgo(row));
    }
    return result;
  },
  pagination: true,
  pageSize: 10,
  pageList: [10, 25, 50, 100],
  showColumns: true,
  showColumnsToggleAll: true,
  showToggle: true,
  cardView: $(window).width() < 768,
  iconsPrefix: 'bi',
  icons: {
    toggleOff: 'bi-grid-fill',
    toggleOn: 'bi-table',
    columns: 'bi-layout-three-columns'
  },
  formatToggleOn: () => 'Switch to Grid view',
  formatToggleOff: () => 'Switch to Table view',
  classes: 'table table-hover table-sm align-middle',
  formatNoMatches: () => 'No items found. Use “Add item” or “Import” to get started.',
  columns: [
    {
      field: 'state',
      checkbox: true,
      align: 'center',
      valign: 'middle'
    },
    {
      field: 'name',
      title: 'Item',
      sortable: true,
      formatter: (v, r) => {
        const imgHtml = (r.images && r.images.length)
          ? `<img src="${esc(r.images[0].url)}" class="rounded border flex-shrink-0" style="width:28px;height:28px;min-width:28px;object-fit:cover" alt="">`
          : '';
        const tagsHtml = (r.tags_list && r.tags_list.length)
          ? '<span class="d-inline-flex flex-wrap gap-1 ms-1">' + r.tags_list.map(t =>
              `<span class="badge bg-secondary-subtle text-secondary-emphasis tag-pill py-0 px-1 text-nowrap" style="font-size:0.68rem;" data-tag="${esc(t)}">#${esc(t)}</span>`
            ).join('') + '</span>'
          : '';
        const notesHtml = r.notes
          ? `<span class="small text-body-secondary text-truncate ms-1" style="max-width:220px;font-size:0.75rem;">· ${esc(r.notes)}</span>`
          : '';
        return `
          <div class="d-flex align-items-center gap-2 text-nowrap">
            ${imgHtml}
            <div class="d-flex align-items-center flex-wrap gap-1 text-truncate" style="max-width:320px;">
              <span class="fw-semibold text-truncate" title="${esc(v)}">${numfy(v)}</span>
              ${notesHtml}
              ${tagsHtml}
            </div>
          </div>
        `;
      }
    },
    {
      field: 'quantity',
      title: 'Qty',
      align: 'center',
      sortable: true,
      formatter: (v, r) => {
        const qty = v != null ? v : 1;
        const lowBadge = r.is_low_stock ? '<span class="badge text-bg-danger py-0 px-1 ms-1 text-nowrap" style="font-size:0.65rem;" title="Low stock alert!">Low</span>' : '';
        return `
          <div class="d-inline-flex align-items-center gap-1 text-nowrap">
            <span class="num fw-bold px-1">${qty}</span>
            ${lowBadge}
          </div>
        `;
      }
    },
    {
      field: 'category',
      title: 'Category',
      sortable: true,
      formatter: v => v ? '<span class="badge text-bg-secondary text-nowrap py-0 px-1.5">' + esc(v) + '</span>'
                        : '<span class="text-body-secondary">—</span>'
    },
    {
      field: 'location',
      title: 'Kept at',
      sortable: true,
      formatter: v => {
        if (!v) return '<span class="text-body-secondary">—</span>';
        const isBoxCode = /^[A-Za-z]+\d+-[A-Za-z0-9]+$/i.test(v.trim());
        if (isBoxCode) {
          return `<span class="badge font-monospace bg-primary-subtle text-primary-emphasis border border-primary-subtle py-0.5 px-2 loc-filter-trigger text-nowrap" role="button" data-loc="${esc(v)}" title="Filter by box ${esc(v)}"><i class="bi bi-box-seam me-1"></i>${esc(v)}</span>`;
        }
        return `<span class="loc-filter-trigger text-nowrap" role="button" data-loc="${esc(v)}" title="Filter by location"><i class="bi bi-geo-alt text-primary me-1"></i>${numfy(v)}</span>`;
      }
    },
    {
      field: 'condition',
      title: 'Condition',
      sortable: true,
      formatter: v => conditionBadge(v)
    },
    {
      field: 'amount_left',
      title: 'Left',
      sortable: true,
      align: 'center',
      formatter: v => amountLeftBadge(v)
    },
    {
      field: 'expiry_date',
      title: 'Expiry',
      sortable: true,
      formatter: expFmt
    },
    {
      field: 'warranty_expiry',
      title: 'Warranty',
      sortable: true,
      formatter: (v, r) => {
        if (!v) return '<span class="text-body-secondary">—</span>';
        let badge = '';
        if (r.warranty_status === 'expired') {
          badge = `<span class="badge text-bg-danger num py-0 px-1 text-nowrap" style="font-size:0.7rem;">Expired</span>`;
        } else if (r.warranty_status === 'soon') {
          badge = `<span class="badge text-bg-warning num py-0 px-1 text-nowrap" style="font-size:0.7rem;">${r.warranty_days_left}d left</span>`;
        } else {
          badge = `<span class="badge text-bg-info num py-0 px-1 text-nowrap" style="font-size:0.7rem;">${r.warranty_days_left}d left</span>`;
        }
        return `<div class="d-inline-flex align-items-center gap-1 text-nowrap"><span class="small text-body-secondary num">${esc(v)}</span>${badge}</div>`;
      }
    },
    {
      field: 'status',
      title: 'Status',
      sortable: true,
      formatter: (v, r) => r.taken_out
        ? `<div class="d-inline-flex align-items-center gap-1 text-nowrap"><span class="badge text-bg-warning py-0 px-1 text-nowrap">Taken out</span><span class="small text-body-secondary text-truncate" style="max-width:140px;" title="Taken to ${esc(r.taken_to)} on ${esc(r.taken_on)}">→ ${esc(r.taken_to)}</span></div>`
        : '<span class="badge text-bg-success py-0 px-1 text-nowrap">In place</span>'
    },
    { field: 'notes', title: 'Notes', visible: false },
    { field: 'tags', title: 'Tags', visible: false },
    { field: 'taken_to', title: 'Taken to', visible: false },
    {
      field: 'actions',
      title: 'Actions',
      align: 'right',
      switchable: false,
      searchable: false,
      formatter: (v, r) => '<div class="d-inline-flex align-items-center gap-1 text-nowrap">' +
        (r.taken_out
          ? '<button class="btn btn-sm btn-success py-0 px-2 act-return" data-id="' + r.id + '" title="Put back"><i class="bi bi-box-arrow-in-down me-1"></i>Put back</button>'
          : '<button class="btn btn-sm btn-warning py-0 px-2 act-take" data-id="' + r.id + '" title="Take out"><i class="bi bi-box-arrow-up-right me-1"></i>Take out</button>') +
        '<button class="btn btn-sm btn-outline-secondary py-0 px-1.5 act-print-qr" data-id="' + r.id + '" title="Print QR Label"><i class="bi bi-qr-code"></i></button>' +
        '<button class="btn btn-sm btn-primary py-0 px-1.5 act-edit" data-id="' + r.id + '" title="Edit"><i class="bi bi-pencil"></i></button>' +
        '<button class="btn btn-sm btn-danger py-0 px-1.5 act-delete" data-id="' + r.id + '" title="Delete"><i class="bi bi-trash"></i></button>' +
        '</div>'
    }
  ],
  onToggle: function (cardView) {
    $tbl.closest('.bootstrap-table').toggleClass('has-card-view', cardView);
    renderPageJump();
    if (cardView) hideEmptyCardViewRows();
  },
  onPostBody: function () {
    const isCard = $tbl.bootstrapTable('getOptions').cardView;
    $tbl.closest('.bootstrap-table').toggleClass('has-card-view', isCard);
    renderPageJump();
    if (isCard) hideEmptyCardViewRows();
  }
});

// Pagination: Direct page typing / jumping
function renderPageJump() {
  const $fixedPagination = $tbl.closest('.bootstrap-table').find('.fixed-table-pagination');
  if (!$fixedPagination.length) return;

  const opts = $tbl.bootstrapTable('getOptions');
  const totalPages = opts.totalPages || 1;
  const currentPage = opts.pageNumber || 1;

  let $allJumps = $fixedPagination.find('.page-jump-container');

  if (totalPages <= 1) {
    if ($allJumps.length) $allJumps.remove();
    return;
  }

  // Remove duplicate jump containers if any exist
  if ($allJumps.length > 1) {
    $allJumps.slice(1).remove();
    $allJumps = $allJumps.first();
  }

  // Target strictly div.pagination (the wrapper, not ul.pagination) so it is never duplicated
  let $target = $fixedPagination.find('div.pagination');
  if (!$target.length) {
    $target = $fixedPagination;
  }

  if (!$allJumps.length) {
    const $jump = $(`
      <div class="page-jump-container d-inline-flex align-items-center ms-sm-2 my-1">
        <label for="pageJumpInput" class="small text-body-secondary me-1 mb-0 text-nowrap">Go to:</label>
        <div class="input-group input-group-sm" style="width: 105px;">
          <input type="number" id="pageJumpInput" min="1" max="${totalPages}" value="${currentPage}"
                 class="form-control text-center page-jump-input num px-1"
                 placeholder="${currentPage}" aria-label="Page number">
          <button class="btn btn-primary btn-sm page-jump-btn" type="button" title="Jump to page">Go</button>
        </div>
        <span class="small text-body-secondary ms-1 text-nowrap">/ <span class="num">${totalPages}</span></span>
      </div>
    `);
    $target.append($jump);
  } else {
    // If it was somehow placed inside ul.pagination, move it to $target
    if ($allJumps.parent().is('ul.pagination')) {
      $allJumps.detach().appendTo($target);
    }
    $allJumps.find('.text-nowrap .num').text(totalPages);
    const $input = $allJumps.find('.page-jump-input');
    $input.attr('max', totalPages);
    if (!$input.is(':focus')) {
      $input.val(currentPage);
      $input.attr('placeholder', currentPage);
    }
  }
}

function performPageJump() {
  const $input = $('.page-jump-input');
  if (!$input.length) return;
  const val = $input.val().trim();
  if (!val) return;
  const targetPage = parseInt(val, 10);
  const opts = $tbl.bootstrapTable('getOptions');
  const totalPages = opts.totalPages || 1;

  if (isNaN(targetPage) || targetPage < 1 || targetPage > totalPages) {
    showModalAlert(`Please enter a page number between 1 and ${totalPages}.`, 'warning');
    $input.val(opts.pageNumber || 1);
    return;
  }

  if (targetPage !== opts.pageNumber) {
    $tbl.bootstrapTable('selectPage', targetPage);
  }
}

$(document).on('click', '.page-jump-btn', function (e) {
  e.preventDefault();
  performPageJump();
});

$(document).on('keydown', '.page-jump-input', function (e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    performPageJump();
    $(this).blur();
  }
});

$(document).on('change', '.page-jump-input', performPageJump);
$tbl.on('post-body.bs.table page-change.bs.table', renderPageJump);
renderPageJump();

// ============================================================================
// Enhanced Filtering (Category, Status, Stock, Tags, Expiry, Warranty, Location)
// ============================================================================
function updateFilterCardsUI() {
  const s = $('#fStatus').val();
  const x = $('#fExpiry').val();
  const st = $('#fStock').val();

  $('.filter-card').removeClass('active-filter border-2 border-primary border-success border-warning border-danger border-info bg-primary-subtle bg-success-subtle bg-warning-subtle bg-danger-subtle bg-info-subtle');
  $('.filter-card .filter-indicator').addClass('d-none');

  if (!s && !x && !st && !activeWarrantyFilter && !activeLocationFilter && !$('#fCategory').val() && !$('#fTag').val()) {
    const $allCard = $('.filter-card[data-filter-type="all"]');
    $allCard.addClass('active-filter border-primary border-2');
    $allCard.find('.filter-indicator').removeClass('d-none');
  } else {
    if (s === 'In place') {
      const $card = $('.filter-card[data-filter-type="status"][data-filter-val="In place"]');
      $card.addClass('active-filter border-success border-2 bg-success-subtle');
      $card.find('.filter-indicator').removeClass('d-none');
    } else if (s === 'Taken out') {
      const $card = $('.filter-card[data-filter-type="status"][data-filter-val="Taken out"]');
      $card.addClass('active-filter border-warning border-2 bg-warning-subtle');
      $card.find('.filter-indicator').removeClass('d-none');
    }

    if (st === 'low') {
      const $card = $('.filter-card[data-filter-type="stock"][data-filter-val="low"]');
      $card.addClass('active-filter border-danger border-2 bg-danger-subtle');
      $card.find('.filter-indicator').removeClass('d-none');
    }

    if (x === 'soon') {
      const $card = $('.filter-card[data-filter-type="expiry"][data-filter-val="soon"]');
      $card.addClass('active-filter border-warning border-2 bg-warning-subtle');
      $card.find('.filter-indicator').removeClass('d-none');
    } else if (x === 'expired') {
      const $card = $('.filter-card[data-filter-type="expiry"][data-filter-val="expired"]');
      $card.addClass('active-filter border-danger border-2 bg-danger-subtle');
      $card.find('.filter-indicator').removeClass('d-none');
    }

    if (activeWarrantyFilter) {
      const $card = $('.filter-card[data-filter-type="warranty"][data-filter-val="active"]');
      $card.addClass('active-filter border-info border-2 bg-info-subtle');
      $card.find('.filter-indicator').removeClass('d-none');
    }
  }

  // Active Location Pill
  if (activeLocationFilter) {
    $('#activeLocName').text(activeLocationFilter);
    $('#activeLocPill').removeClass('d-none').addClass('d-inline-flex');
  } else {
    $('#activeLocPill').addClass('d-none').removeClass('d-inline-flex');
  }
}

function applyFilters() {
  const cat = $('#fCategory').val();
  const stat = $('#fStatus').val();
  const exp = $('#fExpiry').val();
  const stock = $('#fStock').val();
  const cond = $('#fCondition').val();
  const amtLeft = $('#fAmountLeft').val();
  const tag = ($('#fTag').val() || '').toLowerCase();
  const wActive = activeWarrantyFilter;
  const loc = activeLocationFilter.toLowerCase();

  $tbl.bootstrapTable('filterBy', {}, {
    filterAlgorithm: (row) => {
      if (cat && row.category !== cat) return false;
      if (stat && row.status !== stat) return false;
      if (exp && row.expiry_status !== exp) return false;
      if (stock === 'in_stock' && (row.quantity || 0) <= 0) return false;
      if (stock === 'low' && !row.is_low_stock) return false;
      if (stock === 'out_of_stock' && (row.quantity || 0) > 0) return false;
      if (cond && row.condition !== cond) return false;
      if (amtLeft) {
        const val = row.amount_left != null ? row.amount_left : -1;
        if (amtLeft === 'full' && val < 75) return false;
        if (amtLeft === 'medium' && (val < 25 || val >= 75)) return false;
        if (amtLeft === 'low' && (val < 0 || val >= 25)) return false;
        if (amtLeft === 'empty' && val !== 0) return false;
      }
      if (tag && (!row.tags_list || !row.tags_list.map(t => t.toLowerCase()).includes(tag))) return false;
      if (wActive && !(row.warranty_status === 'active' || row.warranty_status === 'soon')) return false;
      if (loc && !row.location.toLowerCase().includes(loc)) return false;
      return true;
    }
  });

  const hasActive = cat || stat || exp || stock || cond || amtLeft || tag || wActive || loc;
  $('#fReset').toggleClass('d-none', !hasActive);
  updateFilterCardsUI();
}

$('#fCategory, #fStatus, #fStock, #fTag, #fExpiry, #fCondition, #fAmountLeft').on('change', applyFilters);

$('#fReset').on('click', function () {
  $('#fCategory').val('');
  $('#fStatus').val('');
  $('#fStock').val('');
  $('#fTag').val('');
  $('#fExpiry').val('');
  $('#fCondition').val('');
  $('#fAmountLeft').val('');
  activeWarrantyFilter = false;
  activeLocationFilter = '';
  applyFilters();
});

$('#navAllItemsBtn').on('click', function () {
  $('#fReset').trigger('click');
});

$('#clearActiveLoc').on('click', function (e) {
  e.stopPropagation();
  activeLocationFilter = '';
  applyFilters();
});

// Metric Cards Click
$(document).on('click', '.filter-card', function () {
  const type = $(this).data('filter-type');
  const val = $(this).data('filter-val');

  if (type === 'all') {
    $('#fStatus').val('');
    $('#fExpiry').val('');
    $('#fStock').val('');
    activeWarrantyFilter = false;
  } else if (type === 'status') {
    const cur = $('#fStatus').val();
    $('#fStatus').val(cur === val ? '' : val);
  } else if (type === 'expiry') {
    const cur = $('#fExpiry').val();
    $('#fExpiry').val(cur === val ? '' : val);
  } else if (type === 'stock') {
    const cur = $('#fStock').val();
    $('#fStock').val(cur === val ? '' : val);
  } else if (type === 'warranty') {
    activeWarrantyFilter = !activeWarrantyFilter;
  }

  applyFilters();
  document.getElementById('tbl')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

$(document).on('keydown', '.filter-card', function (e) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    $(this).trigger('click');
  }
});

// Clickable Tag Pills anywhere
$(document).on('click', '.tag-pill', function (e) {
  e.stopPropagation();
  const tag = $(this).data('tag');
  if (tag) {
    $('#fTag').val(tag);
    applyFilters();
    document.getElementById('tbl')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
});

// Clickable location in table
$(document).on('click', '.loc-filter-trigger', function (e) {
  e.stopPropagation();
  const loc = $(this).data('loc');
  if (loc) {
    activeLocationFilter = loc;
    applyFilters();
    document.getElementById('tbl')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
});

// Auto-generate or preset custom location code (e.g. B1-A)
$(document).on('click', '.btn-gen-loc-code', function (e) {
  e.preventDefault();
  const targetSelector = $(this).data('target');
  const nextCode = getNextLocationCode();
  if (targetSelector && $(targetSelector).length) {
    $(targetSelector).val(nextCode).trigger('input').focus();
  }
});

$(document).on('click', '.preset-loc-btn', function (e) {
  e.preventDefault();
  const targetSelector = $(this).closest('.loc-presets').data('target');
  const code = $(this).data('code');
  if (targetSelector && code && $(targetSelector).length) {
    $(targetSelector).val(code).trigger('input').focus();
  }
});

$(document).on('click', '.attn', function () {
  showDetail($(this).data('id'));
});

// ============================================================================
// Quick Quantity Increment / Decrement
// ============================================================================
function handleQuantityChange(id, delta) {
  $.post(`/items/${id}/adjust-quantity`, { delta: delta }, function (res) {
    if (res && res.quantity !== undefined) {
      const it = byId(id);
      if (it) {
        it.quantity = res.quantity;
        it.is_low_stock = res.is_low_stock;
        $tbl.bootstrapTable('updateByUniqueId', { id: id, row: it });
        if ($('#detailModal').hasClass('show')) {
          $('#dQty').text(res.quantity);
          updateDetailStockBadge(it);
        }
      }
    }
  }).fail(function () {
    showModalAlert('Failed to update quantity.', 'danger');
  });
}

$(document).on('click', '.act-qty-plus', function (e) {
  e.stopPropagation();
  handleQuantityChange($(this).data('id'), 1);
});

$(document).on('click', '.act-qty-minus', function (e) {
  e.stopPropagation();
  handleQuantityChange($(this).data('id'), -1);
});

$('#dQtyPlusBtn').on('click', function () {
  const id = $('#dTake').data('id');
  if (id) handleQuantityChange(id, 1);
});

$('#dQtyMinusBtn').on('click', function () {
  const id = $('#dTake').data('id');
  if (id) handleQuantityChange(id, -1);
});

function updateDetailStockBadge(it) {
  const q = it.quantity || 0;
  const minQ = it.min_quantity || 0;
  let html = '';
  if (q === 0) {
    html = '<span class="badge text-bg-danger">Out of stock</span>';
  } else if (it.is_low_stock) {
    html = '<span class="badge text-bg-danger">Low stock (' + q + ' &le; ' + minQ + ')</span>';
  } else {
    html = '<span class="badge text-bg-success">In stock</span>';
  }
  $('#dStockBadge').html(html);
}

function updateDetailAmountLeft(it) {
  const v = it.amount_left != null ? it.amount_left : -1;
  const $bar = $('#dAmountLeftBar');
  const $text = $('#dAmountLeftText');
  const $prog = $('#dAmountLeftProgress');

  if (v < 0) {
    $prog.addClass('opacity-50');
    $bar.css('width', '0%').attr('class', 'progress-bar bg-secondary');
    $text.text('N/A').attr('class', 'fw-bold num small text-body-secondary');
  } else {
    $prog.removeClass('opacity-50');
    const pct = Math.max(0, Math.min(100, Number(v)));
    let barColor = 'bg-success';
    let textColor = 'text-success-emphasis';
    if (pct < 25) {
      barColor = 'bg-danger';
      textColor = 'text-danger-emphasis';
    } else if (pct < 60) {
      barColor = 'bg-warning';
      textColor = 'text-warning-emphasis';
    }
    $bar.css('width', `${pct}%`).attr('class', `progress-bar ${barColor}`);
    $text.text(`${pct}%`).attr('class', `fw-bold num small ${textColor}`);
  }
}

function handleAmountLeftChange(id, delta, value) {
  const data = {};
  if (delta !== undefined) data.delta = delta;
  if (value !== undefined) data.value = value;

  $.post(`/items/${id}/adjust-amount-left`, data, function (res) {
    if (res && res.amount_left !== undefined) {
      const it = byId(id);
      if (it) {
        it.amount_left = res.amount_left;
        $tbl.bootstrapTable('updateByUniqueId', { id: id, row: it });
        if ($('#detailModal').hasClass('show')) {
          updateDetailAmountLeft(it);
        }
      }
    }
  }).fail(function () {
    showModalAlert('Failed to update fullness level.', 'danger');
  });
}

$(document).on('click', '.act-level-adjust', function () {
  const id = $('#dTake').data('id');
  const delta = $(this).data('delta');
  if (id) handleAmountLeftChange(id, delta, undefined);
});

$(document).on('click', '.act-level-set', function () {
  const id = $('#dTake').data('id');
  const val = $(this).data('val');
  if (id) handleAmountLeftChange(id, undefined, val);
});

function setAmountLeftUI(target, val) {
  const num = (val == null || val === '' || isNaN(val)) ? -1 : Math.max(-1, Math.min(100, parseInt(val, 10)));
  $(`#${target}AmountLeftRange`).val(num);
  $(`#${target}AmountLeftInput`).val(num);
  const $badge = $(`#${target}AmountLeftBadge`);
  if (num < 0) {
    $badge.text('N/A').attr('class', 'badge bg-secondary-subtle text-secondary-emphasis');
  } else {
    let color = 'bg-success-subtle text-success-emphasis';
    if (num < 25) color = 'bg-danger-subtle text-danger-emphasis';
    else if (num < 60) color = 'bg-warning-subtle text-warning-emphasis';
    $badge.text(`${num}%`).attr('class', `badge ${color}`);
  }
}

$(document).on('input', '#addAmountLeftRange', function () {
  setAmountLeftUI('add', $(this).val());
});

$(document).on('input', '#eAmountLeftRange', function () {
  setAmountLeftUI('e', $(this).val());
});

$(document).on('click', '.preset-amount-btn', function () {
  const target = $(this).data('target');
  const val = $(this).data('val');
  setAmountLeftUI(target, val);
});

$('#addModal').on('show.bs.modal', function () {
  setAmountLeftUI('add', -1);
  $('#addCondition').val('Good');
});

// ============================================================================
// Item Details Modal
// ============================================================================
function renderImages(it, idx) {
  const n = it.images ? it.images.length : 0;
  $('#dNoImg').toggleClass('d-none', n > 0);
  $('#dMainImg').toggleClass('d-none', n === 0);
  $('#dDelImg').toggleClass('d-none', n === 0);
  $('#dImgCount').text(n ? 'Image ' + (idx + 1) + ' of ' + n : '');
  if (n) {
    $('#dMainImg').attr('src', it.images[idx].url);
    $('#dDelImg').data('imgid', it.images[idx].id);
  }
  $('#dThumbs').html(n ? it.images.map((im, i) =>
    '<img src="' + esc(im.url) + '" data-idx="' + i + '" data-item="' + it.id + '" ' +
    'class="rounded border dthumb' + (i === idx ? ' border-primary border-3' : '') + '" ' +
    'style="width:64px;height:64px;object-fit:cover;cursor:pointer" alt="">').join('') : '');
}

function showDetail(id) {
  const it = byId(id);
  if (!it) return;

  $('#dName').html(numfy(it.name));

  // Badges
  let badgesHtml = '';
  if (it.category) badgesHtml += `<span class="badge text-bg-secondary me-1">${esc(it.category)}</span>`;
  badgesHtml += it.taken_out
    ? '<span class="badge text-bg-warning me-1">Taken out</span>'
    : '<span class="badge text-bg-success me-1">In place</span>';
  if (it.is_low_stock) badgesHtml += '<span class="badge text-bg-danger me-1">Low Stock</span>';
  if (it.warranty_status === 'active') badgesHtml += '<span class="badge text-bg-info me-1">Warranty Active</span>';
  $('#dBadges').html(badgesHtml);

  $('#dCat').text(it.category || '—');
  $('#dLoc').html(`<i class="bi bi-geo-alt text-primary me-1"></i>${esc(it.location)}`);

  // Quantity & Stock
  $('#dQty').text(it.quantity != null ? it.quantity : 1);
  $('#dMinQty').text(it.min_quantity != null ? it.min_quantity : 0);
  updateDetailStockBadge(it);

  $('#dStatus').html(it.taken_out
    ? 'Taken out → <strong>' + esc(it.taken_to) + '</strong><div class="small text-body-secondary">' + esc(it.taken_on) + '</div>'
    : 'In place');

  // Condition
  $('#dCondition').html(conditionBadge(it.condition));

  // Fullness / How much left
  updateDetailAmountLeft(it);

  // Tags
  if (it.tags_list && it.tags_list.length) {
    $('#dTags').html(it.tags_list.map(t =>
      `<span class="badge bg-secondary-subtle text-secondary-emphasis tag-pill me-1" data-tag="${esc(t)}">#${esc(t)}</span>`
    ).join(''));
  } else {
    $('#dTags').text('—');
  }

  $('#dExp').html(it.expiry_date ? '<span class="num">' + esc(it.expiry_date) + '</span> ' + expBadge(it) : '—');

  // Warranty
  if (it.warranty_expiry) {
    let wBadge = '';
    if (it.warranty_status === 'expired') wBadge = '<span class="badge text-bg-danger ms-1">Expired</span>';
    else if (it.warranty_status === 'soon') wBadge = `<span class="badge text-bg-warning ms-1">${it.warranty_days_left}d left</span>`;
    else wBadge = `<span class="badge text-bg-info ms-1">${it.warranty_days_left}d left</span>`;
    $('#dWarranty').html(`<span class="num">${esc(it.warranty_expiry)}</span> ${wBadge}`);
  } else {
    $('#dWarranty').text('—');
  }

  // Purchase info
  if (it.purchase_date || (it.purchase_price && it.purchase_price > 0)) {
    let pInfo = [];
    if (it.purchase_date) pInfo.push(`Date: <span class="num">${esc(it.purchase_date)}</span>`);
    if (it.purchase_price) pInfo.push(`Price: <span class="num">$${Number(it.purchase_price).toFixed(2)}</span>`);
    $('#dPurchase').html(pInfo.join(' &bull; '));
  } else {
    $('#dPurchase').text('—');
  }

  $('#dAdded').html('<span class="num">' + esc(it.created_at) + '</span>');
  $('#dNotes').text(it.notes || 'No notes.');
  $('#dUpload').attr('action', '/items/' + it.id + '/images').find('input[type=file]').val('');

  // Wire buttons with item id
  $('#dTake, #dReturn, #dEdit, #dDelete, #dPrintQrBtn, #dHistoryBtn').data('id', it.id);
  $('#dTake').toggleClass('d-none', !!it.taken_out);
  $('#dReturn').toggleClass('d-none', !it.taken_out);

  renderImages(it, 0);
  modal('detailModal').show();
}

$tbl.on('click-row.bs.table', function (e, row, $el, field) {
  if (field === 'actions' || field === 'state' || field === 'quantity') return;
  showDetail(row.id);
});

$(document).on('click', '.dthumb', function () {
  renderImages(byId($(this).data('item')), $(this).data('idx'));
});

// Edit & Take Out Modals
$(document).on('click', '.act-take', function () {
  const it = byId($(this).data('id'));
  swapTo('takeModal', () => {
    $('#takeForm').attr('action', '/items/' + it.id + '/take');
    $('#takeName').text(it.name);
    $('#takeInput').val('');
  });
});

$(document).on('click', '.act-edit', function () {
  const it = byId($(this).data('id'));
  swapTo('editModal', () => {
    $('#editForm').attr('action', '/items/' + it.id + '/edit');
    $('#eName').val(it.name);
    $('#eCat').val(it.category_id == null ? '' : String(it.category_id));
    $('#eLoc').val(it.location);
    $('#eQty').val(it.quantity != null ? it.quantity : 1);
    $('#eMinQty').val(it.min_quantity != null ? it.min_quantity : 0);
    $('#eCondition').val(it.condition || '');
    setAmountLeftUI('e', it.amount_left != null ? it.amount_left : -1);
    $('#eTags').val(it.tags || '');
    $('#eNotes').val(it.notes);
    $('#eExp').val(it.expiry_date || '');
    $('#ePurchDate').val(it.purchase_date || '');
    $('#ePurchPrice').val(it.purchase_price || '');
    $('#eWarrantyExp').val(it.warranty_expiry || '');
  });
});

$(document).on('click', '.act-return', function () {
  $('#actionForm').attr('action', '/items/' + $(this).data('id') + '/return').trigger('submit');
});

$(document).on('click', '.act-delete', function () {
  const id = $(this).data('id');
  const it = byId(id);
  if (!it) return;
  const isDetailOpen = document.getElementById('detailModal').classList.contains('show');

  const openConfirm = () => {
    showConfirmDialog({
      title: 'Delete Item',
      message: `Are you sure you want to delete <strong>“${esc(it.name)}”</strong>? This action cannot be undone.`,
      confirmBtnText: 'Delete item',
      confirmBtnClass: 'btn-danger',
      icon: 'bi-trash',
      onConfirm: () => {
        $('#actionForm').attr('action', '/items/' + it.id + '/delete').trigger('submit');
      },
      onCancel: () => {
        if (isDetailOpen) modal('detailModal').show();
      }
    });
  };

  if (isDetailOpen) {
    swapModal('detailModal', 'confirmModal', openConfirm);
  } else {
    openConfirm();
  }
});

// Category delete with modal confirmation
$(document).on('click', '.act-del-cat', function () {
  const catId = $(this).data('id');
  const catName = $(this).data('name');

  swapModal('catModal', 'confirmModal', () => {
    showConfirmDialog({
      title: 'Delete Category',
      message: `Are you sure you want to delete category <strong>“${esc(catName)}”</strong>? Its items will become uncategorised.`,
      confirmBtnText: 'Delete category',
      confirmBtnClass: 'btn-danger',
      icon: 'bi-trash',
      onConfirm: () => {
        $('#actionForm').attr('action', '/categories/' + catId + '/delete').trigger('submit');
      },
      onCancel: () => {
        modal('catModal').show();
      }
    });
  });
});

$('#dDelImg').on('click', function () {
  const imgId = $(this).data('imgid');
  if (!imgId) return;

  swapModal('detailModal', 'confirmModal', () => {
    showConfirmDialog({
      title: 'Remove Image',
      message: 'Are you sure you want to remove this image? This action cannot be undone.',
      confirmBtnText: 'Remove image',
      confirmBtnClass: 'btn-danger',
      icon: 'bi-trash',
      onConfirm: () => {
        $('#actionForm').attr('action', '/images/' + imgId + '/delete').trigger('submit');
      },
      onCancel: () => {
        modal('detailModal').show();
      }
    });
  });
});

const openId = parseInt(new URLSearchParams(location.search).get('open'), 10);
if (openId) {
  showDetail(openId);
  history.replaceState(null, '', location.pathname);
}

// ============================================================================
// Multi-Select & Bulk Actions
// ============================================================================
function updateBulkBar() {
  const selections = $tbl.bootstrapTable('getSelections');
  const count = selections ? selections.length : 0;
  const $bar = $('#bulkBar');
  if (count > 0) {
    $('#bulkCount').text(count);
    $('#bulkCountText').text(count === 1 ? 'item selected' : 'items selected');
    $bar.removeClass('d-none');
  } else {
    $bar.addClass('d-none');
  }
}

$tbl.on('check.bs.table uncheck.bs.table check-all.bs.table uncheck-all.bs.table check-some.bs.table uncheck-some.bs.table post-body.bs.table', updateBulkBar);

$('#bulkDeselect').on('click', function () {
  $tbl.bootstrapTable('uncheckAll');
  updateBulkBar();
});

$('#bulkEditBtn').on('click', function () {
  const selections = $tbl.bootstrapTable('getSelections');
  if (!selections.length) return;
  const ids = selections.map(r => r.id);
  $('#bulkEditIds').val(ids.join(','));
  $('#bulkEditCountLabel').text(ids.length);

  $('#bulkCatAction').val('keep').trigger('change');
  $('#bulkLocAction').val('keep').trigger('change');
  $('#bulkStatusAction').val('keep').trigger('change');
  $('#bulkExpAction').val('keep').trigger('change');
  $('#bulkQtyAction').val('keep').trigger('change');
  $('#bulkTagsAction').val('keep').trigger('change');
  $('#bulkNotesAction').val('keep').trigger('change');
  $('#bulkCondAction').val('keep').trigger('change');
  $('#bulkAmountLeftAction').val('keep').trigger('change');

  modal('bulkEditModal').show();
});

$('#bulkCatAction').on('change', function () {
  $('#bulkCatSelect').toggleClass('d-none', $(this).val() !== 'set');
});
$('#bulkLocAction').on('change', function () {
  $('#bulkLocInput').toggleClass('d-none', $(this).val() !== 'set');
});
$('#bulkStatusAction').on('change', function () {
  $('#bulkStatusTakenTo').toggleClass('d-none', $(this).val() !== 'take');
});
$('#bulkExpAction').on('change', function () {
  $('#bulkExpInput').toggleClass('d-none', $(this).val() !== 'set');
});
$('#bulkQtyAction').on('change', function () {
  $('#bulkQtyVal').toggleClass('d-none', $(this).val() === 'keep');
});
$('#bulkTagsAction').on('change', function () {
  $('#bulkTagsVal').toggleClass('d-none', $(this).val() === 'keep' || $(this).val() === 'clear');
});
$('#bulkNotesAction').on('change', function () {
  const v = $(this).val();
  $('#bulkNotesText').toggleClass('d-none', v !== 'append' && v !== 'replace');
});
$('#bulkCondAction').on('change', function () {
  $('#bulkCondVal').toggleClass('d-none', $(this).val() !== 'set');
});
$('#bulkAmountLeftAction').on('change', function () {
  $('#bulkAmountLeftVal').toggleClass('d-none', $(this).val() !== 'set');
});

$('#bulkTakeBtn').on('click', function () {
  const selections = $tbl.bootstrapTable('getSelections');
  if (!selections.length) return;
  const ids = selections.map(r => r.id);
  $('#bulkTakeIds').val(ids.join(','));
  $('#bulkTakeCountLabel').text(ids.length);
  $('#bulkTakeInput').val('');
  modal('bulkTakeModal').show();
});

$('#bulkReturnBtn').on('click', function () {
  const selections = $tbl.bootstrapTable('getSelections');
  if (!selections.length) return;
  const ids = selections.map(r => r.id);
  const count = ids.length;
  showConfirmDialog({
    title: `Put Back ${count} Item${count !== 1 ? 's' : ''}`,
    message: `Mark <strong>${count} selected item${count !== 1 ? 's' : ''}</strong> as back in their place?`,
    confirmBtnText: 'Put back',
    confirmBtnClass: 'btn-success',
    icon: 'bi-box-arrow-in-down',
    onConfirm: () => {
      const $form = $('#actionForm').empty().attr('action', '/items/bulk-return');
      ids.forEach(id => $form.append($('<input type="hidden" name="ids">').val(id)));
      $form.trigger('submit');
    }
  });
});

$('#bulkDeleteBtn').on('click', function () {
  const selections = $tbl.bootstrapTable('getSelections');
  if (!selections.length) return;
  const ids = selections.map(r => r.id);
  const count = ids.length;
  showConfirmDialog({
    title: `Delete ${count} Item${count !== 1 ? 's' : ''}`,
    message: `Are you sure you want to permanently delete <strong>${count} selected item${count !== 1 ? 's' : ''}</strong>? This action cannot be undone.`,
    confirmBtnText: `Delete item${count !== 1 ? 's' : ''}`,
    confirmBtnClass: 'btn-danger',
    icon: 'bi-trash',
    onConfirm: () => {
      const $form = $('#actionForm').empty().attr('action', '/items/bulk-delete');
      ids.forEach(id => $form.append($('<input type="hidden" name="ids">').val(id)));
      $form.trigger('submit');
    }
  });
});

// ============================================================================
// 1.1 Live Barcode & QR Code Scanner (html5-qrcode)
// ============================================================================
let html5QrScanner = null;
let isScannerRunning = false;

function playScanBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch (e) {}
}

function handleDecodedCode(decodedText, formatName = 'QR / Barcode') {
  playScanBeep();
  $('#scannerResultBox').removeClass('d-none');
  $('#scannerResultRaw').text(decodedText);
  $('#scannerResultFormat').text(formatName);

  const $btns = $('#scannerActionBtns').empty();
  const $preview = $('#scannerItemPreview').addClass('d-none');

  let matchedItem = null;

  // 1. Check if format is "item:<id>" or numeric id
  let cleanCode = decodedText.trim();
  let itemIdMatch = cleanCode.match(/^item:(\d+)$/i) || cleanCode.match(/^(\d+)$/);
  if (itemIdMatch) {
    matchedItem = byId(itemIdMatch[1]);
  }

  // 2. Check if URL contains open=<id>
  if (!matchedItem && cleanCode.includes('open=')) {
    try {
      const u = new URL(cleanCode);
      const op = u.searchParams.get('open');
      if (op) matchedItem = byId(op);
    } catch (e) {}
  }

  // 3. Match against item names, notes, or tags
  if (!matchedItem) {
    matchedItem = ITEMS.find(i => i.name.toLowerCase() === cleanCode.toLowerCase() ||
                                  (i.notes && i.notes.toLowerCase().includes(cleanCode.toLowerCase())) ||
                                  (i.tags && i.tags.toLowerCase().includes(cleanCode.toLowerCase())));
  }

  // 4. Check if code represents a location: "loc:<location>"
  let locMatch = cleanCode.match(/^loc:(.+)$/i);
  let matchedLoc = locMatch ? locMatch[1].trim() : (ALL_LOCATIONS.find(l => l.toLowerCase() === cleanCode.toLowerCase()) || null);

  if (matchedItem) {
    $preview.removeClass('d-none');
    $('#scannerItemName').text(matchedItem.name);
    $('#scannerItemLoc').text(matchedItem.location);
    if (matchedItem.images && matchedItem.images.length) {
      $('#scannerItemImg').attr('src', matchedItem.images[0].url).removeClass('d-none');
    } else {
      $('#scannerItemImg').addClass('d-none');
    }

    $btns.append(`
      <button class="btn btn-success btn-sm" id="scannerOpenItemBtn" data-id="${matchedItem.id}">
        <i class="bi bi-box-arrow-up-right me-1"></i> View Item Details
      </button>
    `);
  } else if (matchedLoc) {
    $btns.append(`
      <button class="btn btn-info btn-sm text-white" id="scannerFilterLocBtn" data-loc="${esc(matchedLoc)}">
        <i class="bi bi-geo-alt-fill me-1"></i> Show Items at "${esc(matchedLoc)}"
      </button>
    `);
  } else {
    $btns.append(`
      <button class="btn btn-primary btn-sm" id="scannerAddNewBtn" data-code="${esc(cleanCode)}">
        <i class="bi bi-plus-lg me-1"></i> Add New Item with this Barcode
      </button>
      <button class="btn btn-outline-secondary btn-sm" id="scannerSearchTableBtn" data-code="${esc(cleanCode)}">
        <i class="bi bi-search me-1"></i> Search Inventory
      </button>
    `);
  }
}

$(document).on('click', '#scannerOpenItemBtn', function () {
  const id = $(this).data('id');
  modal('scannerModal').hide();
  showDetail(id);
});

$(document).on('click', '#scannerFilterLocBtn', function () {
  const loc = $(this).data('loc');
  modal('scannerModal').hide();
  activeLocationFilter = loc;
  applyFilters();
});

$(document).on('click', '#scannerAddNewBtn', function () {
  const code = $(this).data('code');
  modal('scannerModal').hide();
  $('#addModal').find('input[name="name"]').val(code);
  $('#addModal').find('textarea[name="notes"]').val(`Barcode / Serial: ${code}`);
  modal('addModal').show();
});

$(document).on('click', '#scannerSearchTableBtn', function () {
  const code = $(this).data('code');
  modal('scannerModal').hide();
  $tbl.bootstrapTable('resetSearch', code);
});

// Start/Stop camera scanner
async function startCameraScanner() {
  if (isScannerRunning) return;
  const cameraId = $('#scannerCameraSelect').val();
  if (!cameraId) {
    showModalAlert('Please select a camera to start.', 'warning');
    return;
  }

  if (!html5QrScanner) {
    html5QrScanner = new Html5Qrcode('qr-reader');
  }

  $('#qrReaderPlaceholder').addClass('d-none');
  try {
    await html5QrScanner.start(
      cameraId,
      { fps: 10, qrbox: { width: 220, height: 220 } },
      (decodedText, decodedResult) => {
        const fmt = decodedResult?.result?.format?.formatName || 'Barcode / QR';
        handleDecodedCode(decodedText, fmt);
      },
      () => {}
    );
    isScannerRunning = true;
    $('#scannerToggleBtn').html('<i class="bi bi-stop-fill me-1"></i>Stop').removeClass('btn-primary').addClass('btn-danger');
  } catch (err) {
    showModalAlert('Could not start camera scanner: ' + err, 'danger');
  }
}

async function stopCameraScanner() {
  if (html5QrScanner && isScannerRunning) {
    try {
      await html5QrScanner.stop();
    } catch (e) {}
    isScannerRunning = false;
  }
  $('#qrReaderPlaceholder').removeClass('d-none');
  $('#scannerToggleBtn').html('<i class="bi bi-play-fill me-1"></i>Start').removeClass('btn-danger').addClass('btn-primary');
}

$('#scannerToggleBtn').on('click', function () {
  if (isScannerRunning) {
    stopCameraScanner();
  } else {
    startCameraScanner();
  }
});

// Modal shown/hidden hooks for camera
document.getElementById('scannerModal')?.addEventListener('shown.bs.modal', async () => {
  if (window.Html5Qrcode) {
    try {
      const devices = await Html5Qrcode.getCameras();
      const $sel = $('#scannerCameraSelect').empty();
      if (devices && devices.length) {
        devices.forEach((d, idx) => {
          $sel.append(`<option value="${d.id}">${d.label || 'Camera ' + (idx + 1)}</option>`);
        });
        startCameraScanner();
      } else {
        $sel.append('<option value="">No cameras detected</option>');
      }
    } catch (e) {
      $('#scannerCameraSelect').html('<option value="">Camera access denied or unavailable</option>');
    }
  }
});

document.getElementById('scannerModal')?.addEventListener('hidden.bs.modal', () => {
  stopCameraScanner();
  $('#scannerResultBox').addClass('d-none');
});

// File upload scanner
$('#scannerFileInput').on('change', function (e) {
  const file = e.target.files[0];
  if (!file) return;

  if (!html5QrScanner) {
    html5QrScanner = new Html5Qrcode('qr-reader');
  }

  html5QrScanner.scanFile(file, true)
    .then(decodedText => {
      handleDecodedCode(decodedText, 'Image File');
    })
    .catch(err => {
      showModalAlert('No barcode or QR code found in this image. Try another photo.', 'warning');
    });
});

// Manual entry
$('#scannerManualBtn').on('click', function () {
  const val = $('#scannerManualInput').val().trim();
  if (val) handleDecodedCode(val, 'Manual Entry');
});
$('#scannerManualInput').on('keydown', function (e) {
  if (e.key === 'Enter') $('#scannerManualBtn').trigger('click');
});

// ============================================================================
// 1.2 Storage Box & Item QR Code Generator & Label Printing (qrcode.js)
// ============================================================================
let qrInstance = null;

function updateQrPreview() {
  const type = $('#qrLabelTypeSelect').val();
  const $box = $('#labelPreviewQr').empty();
  const includeText = $('#qrIncludeText').is(':checked');
  const includeDate = $('#qrIncludeDate').is(':checked');

  if (type === 'item') {
    $('#qrItemSelectGroup').removeClass('d-none');
    $('#qrLocSelectGroup').addClass('d-none');
    $('#qrBatchSelectGroup').addClass('d-none');
    $('#qrSingleLabelPreview').removeClass('d-none');
    $('#qrBatchNotice').addClass('d-none');

    const itId = $('#qrItemSelect').val();
    const it = byId(itId) || ITEMS[0];
    if (!it) return;

    $('#labelPreviewTitle').text(it.name);
    $('#labelPreviewSubtitle').text(includeText ? it.location : '');
    const dateStr = includeDate ? new Date().toLocaleDateString() : '';
    $('#labelPreviewFooter').text(dateStr ? `Home Inventory • ${dateStr}` : 'Home Inventory');

    // QR Payload: direct deep link URL or compact code
    const payload = `${window.location.origin}/?open=${it.id}`;
    if (window.QRCode) {
      new QRCode(document.getElementById('labelPreviewQr'), {
        text: payload,
        width: 130,
        height: 130,
        correctLevel: QRCode.CorrectLevel.M
      });
    }
  } else if (type === 'location') {
    $('#qrItemSelectGroup').addClass('d-none');
    $('#qrLocSelectGroup').removeClass('d-none');
    $('#qrBatchSelectGroup').addClass('d-none');
    $('#qrSingleLabelPreview').removeClass('d-none');
    $('#qrBatchNotice').addClass('d-none');

    const loc = $('#qrLocCustomInput').val().trim() || 'Storage Box';
    $('#labelPreviewTitle').text(loc);
    const count = ITEMS.filter(i => i.location.toLowerCase().includes(loc.toLowerCase())).length;
    $('#labelPreviewSubtitle').text(includeText ? `Storage Box (${count} item${count !== 1 ? 's' : ''})` : '');
    $('#labelPreviewFooter').text('Scan to explore contents');

    const payload = `loc:${loc}`;
    if (window.QRCode) {
      new QRCode(document.getElementById('labelPreviewQr'), {
        text: payload,
        width: 130,
        height: 130,
        correctLevel: QRCode.CorrectLevel.M
      });
    }
  } else if (type === 'batch') {
    $('#qrItemSelectGroup').addClass('d-none');
    $('#qrLocSelectGroup').addClass('d-none');
    $('#qrBatchSelectGroup').removeClass('d-none');
    $('#qrSingleLabelPreview').addClass('d-none');
    $('#qrBatchNotice').removeClass('d-none');
    const selCount = $tbl.bootstrapTable('getSelections').length;
    $('#qrBatchSelectedCount').text(selCount);
  }
}

$('#qrLabelTypeSelect, #qrItemSelect, #qrIncludeText, #qrIncludeDate').on('change', updateQrPreview);
$('#qrLocCustomInput').on('input change', updateQrPreview);

$(document).on('click', '.act-print-qr', function () {
  const id = $(this).data('id');
  $('#qrLabelTypeSelect').val('item');
  $('#qrItemSelect').val(id);
  updateQrPreview();
  modal('qrPrintModal').show();
});

$('#dPrintQrBtn').on('click', function () {
  const id = $(this).data('id');
  $('#qrLabelTypeSelect').val('item');
  $('#qrItemSelect').val(id);
  updateQrPreview();
  modal('qrPrintModal').show();
});

// Trigger Printing via @media print
$('#triggerPrintBtn').on('click', function () {
  const type = $('#qrLabelTypeSelect').val();
  const $printArea = $('#printableArea').empty();

  if (type === 'item') {
    const it = byId($('#qrItemSelect').val()) || ITEMS[0];
    if (!it) return;
    const card = $(`
      <div class="print-label-card">
        <h3>${esc(it.name)}</h3>
        <div class="meta">${esc(it.location)}${it.category ? ' &bull; ' + esc(it.category) : ''}</div>
        <div id="printQrSlot"></div>
        <div class="meta" style="margin-top: 2mm;">Qty: ${it.quantity || 1} &bull; Home Inventory</div>
      </div>
    `);
    $printArea.append(card);
    new QRCode(document.getElementById('printQrSlot'), {
      text: `${window.location.origin}/?open=${it.id}`,
      width: 140,
      height: 140,
      correctLevel: QRCode.CorrectLevel.M
    });
  } else if (type === 'location') {
    const loc = $('#qrLocCustomInput').val().trim() || 'Storage Box';
    const count = ITEMS.filter(i => i.location.toLowerCase().includes(loc.toLowerCase())).length;
    const card = $(`
      <div class="print-label-card">
        <h3>STORAGE BOX</h3>
        <h4>${esc(loc)}</h4>
        <div class="meta">${count} item${count !== 1 ? 's' : ''} stored inside</div>
        <div id="printQrSlot"></div>
        <div class="meta" style="margin-top: 2mm;">Scan to view box contents</div>
      </div>
    `);
    $printArea.append(card);
    new QRCode(document.getElementById('printQrSlot'), {
      text: `loc:${loc}`,
      width: 140,
      height: 140,
      correctLevel: QRCode.CorrectLevel.M
    });
  } else if (type === 'batch') {
    const batchMode = $('#qrBatchFilterSelect').val();
    let targetItems = [];
    if (batchMode === 'selected') {
      targetItems = $tbl.bootstrapTable('getSelections');
      if (!targetItems.length) targetItems = ITEMS;
    } else if (batchMode === 'in_place') {
      targetItems = ITEMS.filter(i => !i.taken_out);
    } else {
      targetItems = ITEMS;
    }

    const grid = $('<div class="print-sheet-grid"></div>');
    $printArea.append(grid);

    targetItems.forEach((it, idx) => {
      const slotId = `batchQrSlot_${idx}`;
      grid.append(`
        <div class="print-label-card">
          <h4>${esc(it.name)}</h4>
          <div class="meta">${esc(it.location)}</div>
          <div id="${slotId}"></div>
          <div class="meta" style="margin-top: 1mm;">Qty: ${it.quantity || 1}</div>
        </div>
      `);
      new QRCode(document.getElementById(slotId), {
        text: `${window.location.origin}/?open=${it.id}`,
        width: 100,
        height: 100,
        correctLevel: QRCode.CorrectLevel.M
      });
    });
  }

  window.print();
});

// ============================================================================
// 3.1 Location Tree / Room-by-Room Explorer
// ============================================================================
function buildLocationHierarchy() {
  const tree = {};

  ITEMS.forEach(it => {
    const rawLoc = it.location || 'Unspecified';
    // Delimiters: ' / ', '/', ' > ', or '>'
    const parts = rawLoc.split(/\s*[\/>]\s*/).filter(p => p.trim());
    let current = tree;
    let accumulatedPath = '';

    parts.forEach((part, idx) => {
      accumulatedPath = accumulatedPath ? `${accumulatedPath} / ${part}` : part;
      if (!current[part]) {
        current[part] = {
          _name: part,
          _path: accumulatedPath,
          _count: 0,
          _children: {}
        };
      }
      current[part]._count++;
      current = current[part]._children;
    });
  });

  return tree;
}

function renderLocationTree(filterText = '') {
  const tree = buildLocationHierarchy();
  const $container = $('#locationTreeContainer').empty();

  function renderBranch(nodes, $parent) {
    Object.keys(nodes).sort().forEach(key => {
      const node = nodes[key];
      const hasChildren = Object.keys(node._children).length > 0;
      const matchesFilter = !filterText || node._path.toLowerCase().includes(filterText.toLowerCase());

      if (filterText && !matchesFilter) return;

      const $item = $(`
        <div class="list-group-item d-flex justify-content-between align-items-center loc-tree-branch p-2">
          <div class="d-flex align-items-center gap-2 text-truncate">
            <i class="bi ${hasChildren ? 'bi-folder-fill text-warning' : 'bi-geo-alt-fill text-primary'}"></i>
            <span class="fw-semibold loc-tree-click" role="button" data-path="${esc(node._path)}" title="Click to filter inventory">${esc(node._name)}</span>
            <span class="badge text-bg-light border num">${node._count}</span>
          </div>
          <div class="d-flex gap-1 align-items-center">
            <button class="btn btn-sm btn-outline-secondary py-0 px-2 act-print-loc-qr" data-loc="${esc(node._path)}" title="Print Box QR">
              <i class="bi bi-qr-code"></i>
            </button>
            <button class="btn btn-sm btn-outline-primary py-0 px-2 loc-tree-click" data-path="${esc(node._path)}" title="Show items">
              View
            </button>
          </div>
        </div>
      `);
      $parent.append($item);

      if (hasChildren) {
        const $subContainer = $('<div class="loc-tree-sub mb-1"></div>');
        renderBranch(node._children, $subContainer);
        $parent.append($subContainer);
      }
    });
  }

  renderBranch(tree, $container);
}

$('#locTreeSearchInput').on('input', function () {
  renderLocationTree($(this).val().trim());
});

$(document).on('click', '.loc-tree-click', function () {
  const path = $(this).data('path');
  activeLocationFilter = path;
  applyFilters();
  modal('locationTreeModal').hide();
});

$(document).on('click', '.act-print-loc-qr', function (e) {
  e.stopPropagation();
  const loc = $(this).data('loc');
  modal('locationTreeModal').hide();
  $('#qrLabelTypeSelect').val('location');
  $('#qrLocCustomInput').val(loc);
  updateQrPreview();
  modal('qrPrintModal').show();
});

document.getElementById('locationTreeModal')?.addEventListener('shown.bs.modal', () => {
  renderLocationTree();
});

// ============================================================================
// 3.2 Item Movement & Activity Log
// ============================================================================
function showItemHistory(itemId) {
  const it = byId(itemId);
  if (!it) return;

  $('#histItemName').text(it.name);
  $('#histItemMeta').html(`Location: <strong>${esc(it.location)}</strong> &bull; Added on: <span class="num">${esc(it.created_at)}</span>`);
  const $timeline = $('#histTimelineContainer').html('<div class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary"></div></div>');

  $.get(`/items/${itemId}/history`, function (records) {
    $timeline.empty();
    if (!records || !records.length) {
      $timeline.html('<div class="text-center py-4 text-body-secondary"><i class="bi bi-clock-history fs-2 mb-2 d-block"></i>No movement history recorded yet.</div>');
      modal('historyModal').show();
      return;
    }

    records.forEach(r => {
      let dotClass = 'dot-info';
      if (r.action.toLowerCase().includes('created')) dotClass = 'dot-success';
      else if (r.action.toLowerCase().includes('taken')) dotClass = 'dot-warning';
      else if (r.action.toLowerCase().includes('returned') || r.action.toLowerCase().includes('back')) dotClass = 'dot-success';
      else if (r.action.toLowerCase().includes('quantity')) dotClass = 'dot-info';

      $timeline.append(`
        <div class="timeline-item">
          <div class="timeline-dot ${dotClass}"></div>
          <div class="d-flex justify-content-between align-items-baseline">
            <span class="fw-semibold small">${esc(r.action)}</span>
            <span class="small text-body-secondary num">${esc(r.timestamp)}</span>
          </div>
          <div class="small text-body-secondary mt-1">${esc(r.details || '')}</div>
        </div>
      `);
    });

    modal('historyModal').show();
  }).fail(function () {
    showModalAlert('Failed to load item activity history.', 'danger');
  });
}

$('#dHistoryBtn').on('click', function () {
  const id = $(this).data('id');
  if (id) {
    swapModal('detailModal', 'historyModal', () => showItemHistory(id));
  }
});

// ============================================================================
// 4.2 Database Backup & Restore
// ============================================================================
$('#restoreSubmitBtn').on('click', function () {
  const fileInput = document.getElementById('restoreFileInput');
  if (!fileInput || !fileInput.files.length) {
    showModalAlert('Please select a valid .db backup file to restore.', 'warning');
    return;
  }

  showConfirmDialog({
    title: 'Restore Database',
    message: 'Are you sure you want to restore this backup? <strong>Current data will be replaced.</strong> A safety copy (<code>inventory.db.bak</code>) will be saved on the server.',
    confirmBtnText: 'Restore Database',
    confirmBtnClass: 'btn-danger',
    icon: 'bi-database-fill-gear',
    onConfirm: () => {
      document.getElementById('restoreBackupForm').submit();
    }
  });
});

// ============================================================================
// 4.3 Global Keyboard Shortcuts
// ============================================================================
$(document).on('keydown', function (e) {
  const tag = (e.target.tagName || '').toUpperCase();
  const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;

  // Escape clears search / filters and closes open modals
  if (e.key === 'Escape') {
    const $openModal = $('.modal.show');
    if ($openModal.length) {
      bootstrap.Modal.getInstance($openModal[0])?.hide();
    } else {
      $('#fReset').trigger('click');
    }
    return;
  }

  if (isInput) return; // Do not trigger shortcuts while typing

  const key = e.key.toLowerCase();

  // / or Ctrl+K -> Focus search
  if (key === '/' || (e.ctrlKey && key === 'k')) {
    e.preventDefault();
    $('.bootstrap-table .search input').focus();
  } else if (key === 'n') {
    e.preventDefault();
    modal('addModal').show();
  } else if (key === 's') {
    e.preventDefault();
    modal('scannerModal').show();
  } else if (key === 'p') {
    e.preventDefault();
    updateQrPreview();
    modal('qrPrintModal').show();
  } else if (key === 'l') {
    e.preventDefault();
    modal('locationTreeModal').show();
  } else if (key === 'b') {
    e.preventDefault();
    modal('backupModal').show();
  } else if (key === 't') {
    e.preventDefault();
    modal('themeModal').show();
  } else if (key === 'd') {
    e.preventDefault();
    toggleThemeWithRadialTransition();
  } else if (e.key === '?') {
    e.preventDefault();
    modal('shortcutsModal').show();
  }
});
