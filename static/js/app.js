// Home Inventory front-end. ITEMS is injected by templates/index.html
const $tbl = $('#tbl');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
  c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

// digits get the monospace font; entities like &#39; are left alone
const numfy = s => esc(s).replace(/(&#?\w+;)|(\d+)/g,
  (m, ent, d) => ent ? ent : '<span class="num">' + d + '</span>');

function expBadge(r) {
  if (!r.expiry_date) return '';
  if (r.expiry_status === 'expired')
    return '<span class="badge text-bg-danger num">Expired ' + Math.abs(r.days_left) + 'd ago</span>';
  if (r.days_left === 0) return '<span class="badge text-bg-warning num">Expires today</span>';
  if (r.expiry_status === 'soon')
    return '<span class="badge text-bg-warning num">' + r.days_left + 'd left</span>';
  return '<span class="badge bg-success-subtle text-success-emphasis num">' + r.days_left + 'd left</span>';
}

const expFmt = (v, r) => v
  ? '<div class="num">' + esc(v) + '</div><div>' + expBadge(r) + '</div>'
  : '<span class="text-body-secondary">—</span>';

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

  // Determine click origin coordinates
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

  // If user prefers reduced motion, switch directly
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    applyTheme();
    return;
  }

  // 1. Native View Transitions API with circular clip-path (Chrome 111+, Edge, Safari 18+)
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
        {
          clipPath: clipPath
        },
        {
          duration: 480,
          easing: 'ease-in-out',
          pseudoElement: '::view-transition-new(root)'
        }
      );
    });
    return;
  }

  // 2. GSAP Radial Overlay Fallback for browsers without native View Transitions
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

  // 3. Simple fallback
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
// Modal Alert & Notification System (replaces inline alert banners & browser alerts)
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

// Backward compatibility alias for any existing showBannerAlert callers
function showBannerAlert(msg, type = 'info') {
  showModalAlert(msg, type);
}

// Auto-display any server flash messages in the Alert Modal
const flashDataEl = document.getElementById('flashMessagesJson');
if (flashDataEl) {
  try {
    const flashes = JSON.parse(flashDataEl.getAttribute('data-flashes') || '[]');
    if (flashes.length > 0) {
      if (flashes.length === 1) {
        const [cat, text] = flashes[0];
        const titleMap = { success: 'Success', danger: 'Error', warning: 'Warning', info: 'Notice' };
        showModalAlert({
          title: titleMap[cat] || 'Notice',
          message: esc(text),
          type: cat || 'info'
        });
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
  if (themeId === 'default') {
    localStorage.setItem('bootswatch_theme', 'default');
  } else {
    localStorage.setItem('bootswatch_theme', themeId);
  }

  // Set dark attribute if dark theme, light if light theme
  const darkThemes = ['cyborg', 'darkly', 'quartz', 'slate', 'solar', 'superhero', 'vapor'];
  if (darkThemes.includes(themeId)) {
    localStorage.setItem('theme', 'dark');
  } else if (themeId !== 'default') {
    localStorage.setItem('theme', 'light');
  }

  // Reload the page to cleanly load the theme's native styles and default motions
  window.location.reload();
}

$(document).on('click', '.theme-card', function () {
  const themeId = $(this).data('theme');
  applyBootswatchTheme(themeId);
});

$('#resetThemeBtn').on('click', function () {
  applyBootswatchTheme('default');
});

// Initialize themes & fonts on page load
const initialTheme = localStorage.getItem('bootswatch_theme') || 'default';
const customFontThemes = ['cosmo', 'journal', 'lux', 'materia', 'minty', 'morph', 'sketchy', 'united'];
if (customFontThemes.includes(initialTheme)) {
  document.documentElement.setAttribute('data-theme-font', 'custom');
} else {
  document.documentElement.setAttribute('data-theme-font', 'classic');
}
renderThemeGrid();

$tbl.bootstrapTable({
  data: ITEMS,
  idField: 'id',
  selectItemName: 'btSelectItem',
  maintainMetaData: true,
  clickToSelect: false,
  toolbar: '#toolbar',
  search: true,
  searchAlign: 'right',
  pagination: true,
  pageSize: 10,
  pageList: [10, 25, 50, 100],
  showColumns: true,
  showColumnsToggleAll: true,
  iconsPrefix: 'bi',
  classes: 'table table-hover',
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
      formatter: (v, r) => '<div class="d-flex align-items-center gap-2">' +
        (r.images.length ? '<img src="' + esc(r.images[0].url) + '" class="rounded border" style="width:40px;height:40px;object-fit:cover" alt="">' : '') +
        '<div><div class="fw-semibold">' + numfy(v) + '</div>' +
        (r.notes ? '<div class="small text-body-secondary text-truncate" style="max-width:clamp(140px, 35vw, 340px)">' + esc(r.notes) + '</div>' : '') +
        '</div></div>'
    },
    {
      field: 'category',
      title: 'Category',
      sortable: true,
      formatter: v => v ? '<span class="badge text-bg-secondary">' + esc(v) + '</span>'
                        : '<span class="text-body-secondary">—</span>'
    },
    {
      field: 'location',
      title: 'Kept at',
      sortable: true,
      formatter: v => '<i class="bi bi-geo-alt text-body-secondary"></i> ' + numfy(v)
    },
    {
      field: 'expiry_date',
      title: 'Expiry',
      sortable: true,
      formatter: expFmt
    },
    {
      field: 'status',
      title: 'Status',
      sortable: true,
      formatter: (v, r) => r.taken_out
        ? '<span class="badge text-bg-warning">Taken out</span>' +
          '<div class="small">→ ' + esc(r.taken_to) + '</div>' +
          '<div class="small text-body-secondary">' + esc(r.taken_on) + '</div>'
        : '<span class="badge text-bg-success">In place</span>'
    },
    {field: 'notes', title: 'Notes', visible: false},
    {field: 'taken_to', title: 'Taken to', visible: false},
    {
      field: 'actions',
      title: 'Actions',
      align: 'right',
      switchable: false,
      searchable: false,
      formatter: (v, r) => '<div class="text-nowrap">' +
        (r.taken_out
          ? '<button class="btn btn-sm btn-success act-return" data-id="' + r.id + '"><i class="bi bi-box-arrow-in-down"></i> Put back</button> '
          : '<button class="btn btn-sm btn-warning act-take" data-id="' + r.id + '"><i class="bi bi-box-arrow-up-right"></i> Take out</button> ') +
        '<button class="btn btn-sm btn-primary act-edit" data-id="' + r.id + '" title="Edit"><i class="bi bi-pencil"></i></button> ' +
        '<button class="btn btn-sm btn-danger act-delete" data-id="' + r.id + '" title="Delete"><i class="bi bi-trash"></i></button>' +
        '</div>'
    }
  ]
});

// Pagination: Direct page typing / jumping
function renderPageJump() {
  const $pagination = $tbl.closest('.bootstrap-table').find('.fixed-table-pagination .pagination');
  if (!$pagination.length) return;

  const opts = $tbl.bootstrapTable('getOptions');
  const totalPages = opts.totalPages || 1;
  const currentPage = opts.pageNumber || 1;

  let $jump = $pagination.find('.page-jump-container');

  if (totalPages <= 1) {
    if ($jump.length) $jump.remove();
    return;
  }

  if (!$jump.length) {
    $jump = $(`
      <div class="page-jump-container d-inline-flex align-items-center ms-2 my-1">
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
    $pagination.append($jump);
  } else {
    $jump.find('.text-nowrap .num').text(totalPages);
    const $input = $jump.find('.page-jump-input');
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
    showBannerAlert(`Please enter a page number between 1 and ${totalPages}.`, 'warning', 3500);
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

$(document).on('change', '.page-jump-input', function () {
  performPageJump();
});

// Hook into table events so pagination jump control stays synchronized
$tbl.on('post-body.bs.table page-change.bs.table', function () {
  renderPageJump();
});
renderPageJump();

// Category, Status, and Expiry filters
function updateFilterCardsUI() {
  const s = $('#fStatus').val();
  const x = $('#fExpiry').val();

  $('.filter-card').removeClass('active-filter border-2 border-primary border-success border-warning border-danger bg-primary-subtle bg-success-subtle bg-warning-subtle bg-danger-subtle');
  $('.filter-card .filter-indicator').addClass('d-none');

  if (!s && !x) {
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

    if (x === 'soon') {
      const $card = $('.filter-card[data-filter-type="expiry"][data-filter-val="soon"]');
      $card.addClass('active-filter border-warning border-2 bg-warning-subtle');
      $card.find('.filter-indicator').removeClass('d-none');
    } else if (x === 'expired') {
      const $card = $('.filter-card[data-filter-type="expiry"][data-filter-val="expired"]');
      $card.addClass('active-filter border-danger border-2 bg-danger-subtle');
      $card.find('.filter-indicator').removeClass('d-none');
    }
  }
}

function applyFilters() {
  const f = {};
  const c = $('#fCategory').val(), s = $('#fStatus').val(), x = $('#fExpiry').val();
  if (c) f.category = [c];
  if (s) f.status = [s];
  if (x) f.expiry_status = [x];
  $tbl.bootstrapTable('filterBy', f);

  if (c || s || x) {
    $('#fReset').removeClass('d-none');
  } else {
    $('#fReset').addClass('d-none');
  }

  updateFilterCardsUI();
}

$('#fCategory, #fStatus, #fExpiry').on('change', applyFilters);

$('#fReset').on('click', function () {
  $('#fCategory').val('');
  $('#fStatus').val('');
  $('#fExpiry').val('');
  applyFilters();
});

// Top summary metric cards act as toggleable filter buttons
$(document).on('click', '.filter-card', function () {
  const type = $(this).data('filter-type');
  const val = $(this).data('filter-val');

  if (type === 'all') {
    // Clear status and expiry filters to show all items
    $('#fStatus').val('');
    $('#fExpiry').val('');
  } else if (type === 'status') {
    const current = $('#fStatus').val();
    // Toggle: if already active, toggle off; otherwise activate
    $('#fStatus').val(current === val ? '' : val);
  } else if (type === 'expiry') {
    const current = $('#fExpiry').val();
    // Toggle: if already active, toggle off; otherwise activate
    $('#fExpiry').val(current === val ? '' : val);
  }

  applyFilters();
  const tblEl = document.getElementById('tbl');
  if (tblEl) {
    tblEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
});

$(document).on('keydown', '.filter-card', function (e) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    $(this).trigger('click');
  }
});

// Initialize filter cards state
updateFilterCardsUI();

$(document).on('click', '.attn', function () {
  showDetail($(this).data('id'));
});

// Row actions and modals
const byId = id => ITEMS.find(x => x.id === id);
const modal = id => bootstrap.Modal.getOrCreateInstance(document.getElementById(id));

// Open another modal, first closing the active one if it is open
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

// Modal dialog confirmation utility (replaces native window.confirm / alert)
function showConfirmDialog({ title, message, confirmBtnText = 'Confirm', confirmBtnClass = 'btn-danger', icon = 'bi-exclamation-triangle-fill', onConfirm, onCancel }) {
  let isConfirmed = false;
  $('#confirmModalTitle').html(`<i class="bi ${icon} me-2 text-danger"></i>${title}`);
  $('#confirmModalMessage').html(message);

  const $btn = $('#confirmExecuteBtn');
  $btn.text(confirmBtnText)
      .attr('class', `btn ${confirmBtnClass}`);

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
    $('#eNotes').val(it.notes);
    $('#eExp').val(it.expiry_date || '');
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

document.getElementById('takeModal').addEventListener('shown.bs.modal',
  () => document.getElementById('takeInput').focus());

// ---- Item details modal ----
function renderImages(it, idx) {
  const n = it.images.length;
  $('#dNoImg').toggleClass('d-none', n > 0);
  $('#dMainImg').toggleClass('d-none', n === 0);
  $('#dDelImg').toggleClass('d-none', n === 0);
  $('#dImgCount').text(n ? 'Image ' + (idx + 1) + ' of ' + n : '');
  if (n) {
    $('#dMainImg').attr('src', it.images[idx].url);
    $('#dDelImg').data('imgid', it.images[idx].id);
  }
  $('#dThumbs').html(it.images.map((im, i) =>
    '<img src="' + esc(im.url) + '" data-idx="' + i + '" data-item="' + it.id + '" ' +
    'class="rounded border dthumb' + (i === idx ? ' border-primary border-3' : '') + '" ' +
    'style="width:64px;height:64px;object-fit:cover;cursor:pointer" alt="">').join(''));
}

function showDetail(id) {
  const it = byId(id);
  if (!it) return;
  $('#dName').html(numfy(it.name));
  $('#dBadges').html(
    (it.category ? '<span class="badge text-bg-secondary me-1">' + esc(it.category) + '</span>' : '') +
    (it.taken_out ? '<span class="badge text-bg-warning">Taken out</span>'
                  : '<span class="badge text-bg-success">In place</span>'));
  $('#dCat').text(it.category || '—');
  $('#dLoc').text(it.location);
  $('#dStatus').html(it.taken_out
    ? 'Taken out → <strong>' + esc(it.taken_to) + '</strong><div class="small text-body-secondary">' + esc(it.taken_on) + '</div>'
    : 'In place');
  $('#dExp').html(it.expiry_date ? '<span class="num">' + esc(it.expiry_date) + '</span> ' + expBadge(it) : '—');
  $('#dAdded').html('<span class="num">' + esc(it.created_at) + '</span>');
  $('#dNotes').text(it.notes || 'No notes.');
  $('#dUpload').attr('action', '/items/' + it.id + '/images').find('input[type=file]').val('');
  $('#dTake, #dReturn, #dEdit, #dDelete').data('id', it.id);
  $('#dTake').toggleClass('d-none', !!it.taken_out);
  $('#dReturn').toggleClass('d-none', !it.taken_out);
  renderImages(it, 0);
  modal('detailModal').show();
}

$tbl.on('click-row.bs.table', function (e, row, $el, field) {
  if (field === 'actions' || field === 'state') return;
  showDetail(row.id);
});

$(document).on('click', '.dthumb', function () {
  renderImages(byId($(this).data('item')), $(this).data('idx'));
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

// Re-open details after uploading/removing an image
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

$tbl.on('check.bs.table uncheck.bs.table check-all.bs.table uncheck-all.bs.table check-some.bs.table uncheck-some.bs.table post-body.bs.table', function () {
  updateBulkBar();
});

$('#bulkDeselect').on('click', function () {
  $tbl.bootstrapTable('uncheckAll');
  updateBulkBar();
});

// Bulk Edit Modal & dynamic toggles
$('#bulkEditBtn').on('click', function () {
  const selections = $tbl.bootstrapTable('getSelections');
  if (!selections.length) return;
  const ids = selections.map(r => r.id);
  $('#bulkEditIds').val(ids.join(','));
  $('#bulkEditCountLabel').text(ids.length);

  // Reset form inputs
  $('#bulkCatAction').val('keep').trigger('change');
  $('#bulkLocAction').val('keep').trigger('change');
  $('#bulkStatusAction').val('keep').trigger('change');
  $('#bulkExpAction').val('keep').trigger('change');
  $('#bulkNotesAction').val('keep').trigger('change');
  $('#bulkCatSelect').val('');
  $('#bulkLocInput').val('');
  $('#bulkStatusTakenTo').val('');
  $('#bulkExpInput').val('');
  $('#bulkNotesText').val('');

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
$('#bulkNotesAction').on('change', function () {
  const v = $(this).val();
  $('#bulkNotesText').toggleClass('d-none', v !== 'append' && v !== 'replace');
});

// Bulk Take Out
$('#bulkTakeBtn').on('click', function () {
  const selections = $tbl.bootstrapTable('getSelections');
  if (!selections.length) return;
  const ids = selections.map(r => r.id);
  $('#bulkTakeIds').val(ids.join(','));
  $('#bulkTakeCountLabel').text(ids.length);
  $('#bulkTakeInput').val('');
  modal('bulkTakeModal').show();
});

const bulkTakeEl = document.getElementById('bulkTakeModal');
if (bulkTakeEl) {
  bulkTakeEl.addEventListener('shown.bs.modal', function () {
    const input = document.getElementById('bulkTakeInput');
    if (input) input.focus();
  });
}

// Bulk Put Back
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

// Bulk Delete
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
// Network Modal & URL Copy
// ============================================================================
$('#copyNetworkUrlBtn').on('click', function () {
  const url = $('#networkUrlInput').val();
  if (!url) return;

  function onCopySuccess() {
    const netModal = document.getElementById('networkModal');
    if (netModal) {
      const inst = bootstrap.Modal.getInstance(netModal);
      if (inst) inst.hide();
    }
    showModalAlert({
      title: 'Link Copied',
      message: `The local network address has been copied to your clipboard:<br><code class="d-inline-block mt-2 p-2 bg-body-tertiary rounded user-select-all">${esc(url)}</code>`,
      type: 'success'
    });
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(onCopySuccess).catch(() => {
      fallbackCopy(url);
    });
  } else {
    fallbackCopy(url);
  }
});

function fallbackCopy(text) {
  const input = document.getElementById('networkUrlInput');
  if (input) {
    input.focus();
    input.select();
    try {
      document.execCommand('copy');
      const netModal = document.getElementById('networkModal');
      if (netModal) {
        const inst = bootstrap.Modal.getInstance(netModal);
        if (inst) inst.hide();
      }
      showModalAlert({
        title: 'Link Copied',
        message: `The local network address has been copied to your clipboard:<br><code class="d-inline-block mt-2 p-2 bg-body-tertiary rounded user-select-all">${esc(text)}</code>`,
        type: 'success'
      });
    } catch (e) {
      showModalAlert({
        title: 'Copy Notice',
        message: 'Could not copy automatically. Please select and copy the URL manually.',
        type: 'warning'
      });
    }
  }
}
