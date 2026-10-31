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

// Custom alert banners (used for non-intrusive status notifications)
function showBannerAlert(msg, type = 'info', autoDismissMs = 4500) {
  const iconMap = {
    success: 'bi-check-circle-fill text-success',
    danger: 'bi-exclamation-octagon-fill text-danger',
    warning: 'bi-exclamation-triangle-fill text-warning',
    secondary: 'bi-info-circle-fill text-primary',
    info: 'bi-info-circle-fill text-primary'
  };
  const icon = iconMap[type] || iconMap.info;
  const alertId = 'banner-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  const html = `
    <div id="${alertId}" class="alert alert-${type} alert-custom alert-dismissible fade show" role="alert">
      <i class="bi ${icon} alert-icon"></i>
      <div class="alert-content">${esc(msg)}</div>
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
  `;
  let $container = $('#alertContainer');
  if (!$container.length) {
    $container = $('<div id="alertContainer" class="mb-3"></div>').prependTo('main.container');
  }
  const $alert = $(html).appendTo($container);
  if (autoDismissMs > 0) {
    setTimeout(() => {
      const el = document.getElementById(alertId);
      if (el) {
        bootstrap.Alert.getOrCreateInstance(el).close();
      }
    }, autoDismissMs);
  }
}

// Auto-dismiss initial success/info alert banners after 5 seconds to keep view clean
setTimeout(() => {
  $('#alertContainer .alert-success, #alertContainer .alert-secondary').each(function () {
    bootstrap.Alert.getOrCreateInstance(this).close();
  });
}, 5000);

$tbl.bootstrapTable({
  data: ITEMS,
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
    {field: 'name', title: 'Item', sortable: true,
     formatter: (v, r) => '<div class="d-flex align-items-center gap-2">' +
       (r.images.length ? '<img src="' + esc(r.images[0].url) + '" class="rounded border" style="width:40px;height:40px;object-fit:cover" alt="">' : '') +
       '<div><div class="fw-semibold">' + numfy(v) + '</div>' +
       (r.notes ? '<div class="small text-body-secondary text-truncate" style="max-width:340px">' + esc(r.notes) + '</div>' : '') +
       '</div></div>'},
    {field: 'category', title: 'Category', sortable: true,
     formatter: v => v ? '<span class="badge text-bg-secondary">' + esc(v) + '</span>'
                       : '<span class="text-body-secondary">—</span>'},
    {field: 'location', title: 'Kept at', sortable: true,
     formatter: v => '<i class="bi bi-geo-alt text-body-secondary"></i> ' + numfy(v)},
    {field: 'expiry_date', title: 'Expiry', sortable: true, formatter: expFmt},
    {field: 'status', title: 'Status', sortable: true,
     formatter: (v, r) => r.taken_out
       ? '<span class="badge text-bg-warning">Taken out</span>' +
         '<div class="small">→ ' + esc(r.taken_to) + '</div>' +
         '<div class="small text-body-secondary">' + esc(r.taken_on) + '</div>'
       : '<span class="badge text-bg-success">In place</span>'},
    {field: 'notes', title: 'Notes', visible: false},
    {field: 'taken_to', title: 'Taken to', visible: false},
    {field: 'actions', title: 'Actions', align: 'right', switchable: false, searchable: false,
     formatter: (v, r) => '<div class="text-nowrap">' +
       (r.taken_out
         ? '<button class="btn btn-sm btn-success act-return" data-id="' + r.id + '"><i class="bi bi-box-arrow-in-down"></i> Put back</button> '
         : '<button class="btn btn-sm btn-outline-warning act-take" data-id="' + r.id + '"><i class="bi bi-box-arrow-up-right"></i> Take out</button> ') +
       '<button class="btn btn-sm btn-outline-secondary act-edit" data-id="' + r.id + '" title="Edit"><i class="bi bi-pencil"></i></button> ' +
       '<button class="btn btn-sm btn-outline-danger act-delete" data-id="' + r.id + '" title="Delete"><i class="bi bi-trash"></i></button>' +
       '</div>'}
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
          <button class="btn btn-outline-secondary page-jump-btn" type="button" title="Jump to page">Go</button>
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

// category / status filters
function applyFilters() {
  const f = {};
  const c = $('#fCategory').val(), s = $('#fStatus').val();
  if (c) f.category = [c];
  if (s) f.status = [s];
  const x = $('#fExpiry').val();
  if (x) f.expiry_status = [x];
  $tbl.bootstrapTable('filterBy', f);
}
$('#fCategory, #fStatus, #fExpiry').on('change', applyFilters);
$(document).on('click', '.exp-card', function () {
  $('#fExpiry').val($(this).data('exp'));
  applyFilters();
  document.getElementById('tbl').scrollIntoView({behavior: 'smooth', block: 'center'});
});
$(document).on('click', '.attn', function () { showDetail($(this).data('id')); });

// row actions
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
function showConfirmDialog({ title, message, confirmBtnText = 'Confirm', confirmBtnClass = 'btn-danger', icon = 'bi-exclamation-triangle', onConfirm, onCancel }) {
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
      message: `Delete category <strong>“${esc(catName)}”</strong>? Its items will become uncategorised.`,
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

// ---- item details modal ----
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
  if (field === 'actions') return;
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

// re-open the details after uploading/removing an image
const openId = parseInt(new URLSearchParams(location.search).get('open'), 10);
if (openId) { showDetail(openId); history.replaceState(null, '', location.pathname); }
