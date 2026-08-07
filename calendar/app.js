'use strict';

/* ===== 站点配置：如更换仓库或路径，只改这里 ===== */
var SITE = {
  repo: 'zhancy1029/zhancy1029.github.io',
  dataPath: 'calendar/data.json'
};
var LS_TOKEN = 'schedule_gh_token';

var state = {
  programs: [],
  config: { ownerName: '', guestViewMode: 'status', viewKey: null, busyOptions: ['工作', '通勤', '吃饭', '学习'] },
  viewYear: 2026,
  viewMonth: 8,
  selectedKey: null,
  dirty: false,
  editingId: null,
  token: '',
  manage: false
};

/* ===== DOM ===== */
function $(id) { return document.getElementById(id); }
var els = {
  siteTitle: $('siteTitle'),
  siteSub: $('siteSub'),
  monthLabel: $('monthLabel'),
  grid: $('grid'),
  sidebar: $('sidebar'),
  btnPrev: $('btnPrev'),
  btnNext: $('btnNext'),
  btnToday: $('btnToday'),
  btnGuestMode: $('btnGuestMode'),
  btnManage: $('btnManage'),
  modalRoot: $('modalRoot'),
  toast: $('toast'),
  guestModeTag: $('guestModeTag')
};

/* ===== 初始化 ===== */
function init() {
  var now = new Date();
  state.viewYear = now.getFullYear();
  state.viewMonth = now.getMonth() + 1;
  state.token = localStorage.getItem(LS_TOKEN) || '';
  state.manage = !!state.token;
  var params = new URLSearchParams(window.location.search);
  if (params.get('admin') === '1') openManage();
  bindEvents();
  renderAll();
  loadData();
}

function bindEvents() {
  els.btnPrev.addEventListener('click', function () { shiftMonth(-1); });
  els.btnNext.addEventListener('click', function () { shiftMonth(1); });
  els.btnToday.addEventListener('click', function () { selectDate(Core.todayKey(), true); });
  els.btnGuestMode.addEventListener('click', toggleGuestVisibility);
  els.btnManage.addEventListener('click', openManage);
  els.sidebar.addEventListener('click', onSidebarClick);
  els.sidebar.addEventListener('input', function () { onFormChange(); });
  els.sidebar.addEventListener('change', function () { onFormChange(); });
  window.addEventListener('beforeunload', function (e) {
    if (state.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

/* ===== 数据加载 ===== */
function loadData() {
  loadFromUrl('data.json')
    .then(function (text) { applyData(text); })
    .catch(function () {
      return loadFromUrl('https://raw.githubusercontent.com/' + SITE.repo + '/main/' + SITE.dataPath)
        .then(function (text) { applyData(text); })
        .catch(function () {
          return loadFromUrl('https://raw.githubusercontent.com/' + SITE.repo + '/master/' + SITE.dataPath)
            .then(function (text) { applyData(text); })
            .catch(function () {
              showToast('无法加载数据文件，请确认网站已部署');
              renderAll();
            });
        });
    });
}

function loadFromUrl(url) {
  return fetch(url, { cache: 'no-store' }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  });
}

function applyData(text) {
  try {
    var parsed = JSON.parse(text);
    state.programs = Array.isArray(parsed.programs) ? parsed.programs : [];
    state.config = Object.assign({}, state.config, parsed.config || {});
  } catch (e) {
    showToast('数据文件解析失败');
  }
  state.dirty = false;
  renderAll();
}

/* ===== 渲染 ===== */
function renderAll() {
  renderMonthLabel();
  renderSiteSub();
  renderGuestModeButton();
  renderManageButton();
  renderGrid();
  renderSidebar();
}

function renderMonthLabel() {
  els.monthLabel.textContent = state.viewYear + '年' + state.viewMonth + '月';
}

function renderSiteSub() {
  els.siteSub.textContent = state.config.ownerName || '';
}

function renderGuestModeButton() {
  var full = state.config.guestViewMode === 'full';
  els.btnGuestMode.textContent = full ? '恢复仅状态' : '对游客全开放';
  els.btnGuestMode.classList.toggle('active', full);
  els.btnGuestMode.style.display = state.manage ? '' : 'none';
  els.guestModeTag.textContent = '游客可见：' + (full ? '全开放（显示内容）' : '仅状态');
  els.guestModeTag.classList.toggle('tag-full', full);
}

function renderManageButton() {
  els.btnManage.style.display = state.manage ? '' : 'none';
  els.btnManage.classList.toggle('active', state.manage);
}

function shiftMonth(delta) {
  var dt = new Date(state.viewYear, state.viewMonth - 1 + delta, 1);
  state.viewYear = dt.getFullYear();
  state.viewMonth = dt.getMonth() + 1;
  renderMonthLabel();
  renderGrid();
}

function renderGrid() {
  els.grid.innerHTML = '';
  var cells = Core.monthGrid(state.viewYear, state.viewMonth);
  for (var i = 0; i < cells.length; i++) {
    (function (cell) {
      var div = document.createElement('div');
      div.className = 'cal-cell' + (cell.inMonth ? '' : ' out');
      var colors = Core.partColors(state.programs, cell.key);
      var partsHtml = Core.PARTS.map(function (p, idx) {
        return '<div class="part p-' + colors[idx] + '" title="' + p.label + ' ' + p.time + '"></div>';
      }).join('');
      div.innerHTML = partsHtml + '<div class="date-badge">' + cell.d + '</div>';
      if (cell.key === Core.todayKey()) div.classList.add('today');
      if (cell.key === state.selectedKey) div.classList.add('selected');
      div.addEventListener('click', function () { selectDate(cell.key, !cell.inMonth); });
      els.grid.appendChild(div);
    })(cells[i]);
  }
}

function selectDate(key, switchMonth) {
  state.selectedKey = key;
  if (switchMonth) {
    var o = Core.parseDateKey(key);
    state.viewYear = o.y;
    state.viewMonth = o.m;
    renderMonthLabel();
  }
  renderGrid();
  renderSidebar();
}

function shiftSelectedDay(delta) {
  if (!state.selectedKey) return;
  var dt = Core.keyToDate(state.selectedKey);
  dt.setDate(dt.getDate() + delta);
  var o = { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
  selectDate(Core.toDateKey(o.y, o.m, o.d), false);
}

function renderSidebar() {
  var key = state.selectedKey;
  if (!key) {
    els.sidebar.innerHTML = '<div class="side-empty">点击日期查看当日日程</div>' + programLegendHtml();
    return;
  }
  var o = Core.parseDateKey(key);
  var dayPrograms = state.programs
    .filter(function (p) { return p.date === key; })
    .sort(function (a, b) { return Core.timeToMin(a.start) - Core.timeToMin(b.start); });
  var fullVisible = state.manage || state.config.guestViewMode === 'full';

  var html = '';
  html += '<div class="side-head">'
    + '<button class="day-nav" data-action="prev-day" title="前一天">‹</button>'
    + '<div class="side-title">' + o.m + '月' + o.d + '日 <span class="weekday">' + Core.weekdayCN(key) + '</span></div>'
    + '<button class="day-nav" data-action="next-day" title="后一天">›</button>'
    + '</div>';
  html += '<div class="side-sub">' + dayPrograms.length + ' 条日程</div>';

  if (dayPrograms.length === 0) {
    html += '<div class="side-empty">当日暂无日程</div>';
  } else {
    html += '<ul class="program-list">';
    for (var i = 0; i < dayPrograms.length; i++) {
      var p = dayPrograms[i];
      var gapCls = '';
      if (i > 0) {
        gapCls = Core.gapTier(Core.timeToMin(p.start) - Core.timeToMin(dayPrograms[i - 1].end));
      }
      var dotCls = p.status === 'free' ? 'dot-green' : 'dot-orange';
      var text = (state.manage || fullVisible) ? esc(p.content) : (p.status === 'free' ? '空闲' : '非空闲');
      html += '<li class="program-item' + (gapCls ? ' ' + gapCls : '') + (state.manage ? ' manageable' : '') + '">'
        + '<span class="dot ' + dotCls + '"></span>'
        + '<span class="p-time">' + p.start + '-' + p.end + '</span>'
        + '<span class="p-text">' + text + '</span>'
        + (state.manage ? '<span class="p-actions">'
            + '<button class="mini" data-action="edit" data-id="' + p.id + '">编辑</button>'
            + '<button class="mini danger" data-action="delete" data-id="' + p.id + '">删除</button>'
          + '</span>' : '')
        + '</li>';
    }
    html += '</ul>';
  }

  if (state.manage) html += renderFormHtml(key);
  if (state.manage && state.dirty) {
    html += '<div class="save-bar">'
      + '<button class="primary" data-action="save">保存并发布</button>'
      + '<button class="ghost" data-action="discard">撤销修改</button>'
      + '</div>';
  }
  if (!state.manage && state.config.guestViewMode === 'status') {
    html += '<div class="guest-note">具体事项内容仅日程主人可见</div>';
  }
  html += programLegendHtml();
  els.sidebar.innerHTML = html;
}

function programLegendHtml() {
  return '<div class="prog-legend">'
    + '<span class="lg"><i class="dot dot-green"></i>空闲</span>'
    + '<span class="lg"><i class="dot dot-orange"></i>非空闲</span>'
    + '</div>';
}

function renderFormHtml(key) {
  var editing = null;
  if (state.editingId) {
    editing = state.programs.find(function (p) { return p.id === state.editingId; }) || null;
  }
  var sDate = editing ? editing.date : key;
  var sTime = editing ? editing.start : '09:00';
  var eDate = editing ? editing.date : key;
  var eTime = editing ? editing.end : '10:00';
  var status = editing ? editing.status : 'free';
  var content = editing ? editing.content : '';
  var locked = editing ? ' disabled' : '';
  return '<div class="side-form">'
    + '<div class="form-title">' + (editing ? '编辑日程' : '添加日程') + '</div>'
    + '<div class="form-grid">'
    + '<label>开始日期<input type="date" id="f-sDate" value="' + sDate + '"' + locked + '></label>'
    + '<label>开始时间<input type="text" id="f-sTime" value="' + sTime + '" placeholder="09:00" inputmode="numeric"></label>'
    + '<label>结束日期<input type="date" id="f-eDate" value="' + eDate + '"' + locked + '></label>'
    + '<label>结束时间<input type="text" id="f-eTime" value="' + eTime + '" placeholder="10:00" inputmode="numeric"></label>'
    + '</div>'
    + '<div class="status-row">'
    + '<label class="radio"><input type="radio" name="f-status" value="free"' + (status === 'free' ? ' checked' : '') + '> <i class="dot dot-green"></i>空闲</label>'
    + '<label class="radio"><input type="radio" name="f-status" value="busy"' + (status === 'busy' ? ' checked' : '') + '> <i class="dot dot-orange"></i>非空闲</label>'
    + '</div>'
    + buildPresetsHtml()
    + '<label class="content-row">事项内容'
    + '<input type="text" id="f-content" placeholder="选空闲时自动为“空闲”" value="' + esc(content) + '"' + (status === 'free' ? ' disabled' : '') + '>'
    + '</label>'
    + '<div id="splitPreview" class="preview"></div>'
    + '<div class="form-actions">'
    + (editing
      ? '<button class="primary" data-action="update">保存修改</button><button class="ghost" data-action="cancel-edit">取消</button>'
      : '<button class="primary" data-action="add">添加</button>')
    + '</div>'
    + '</div>';
}

/* ===== 侧边栏交互 ===== */
function onSidebarClick(e) {
  var btn = e.target.closest('[data-action]');
  if (!btn) return;
  var action = btn.dataset.action;
  var id = btn.dataset.id;
  if (action === 'prev-day') shiftSelectedDay(-1);
  else if (action === 'next-day') shiftSelectedDay(1);
  else if (action === 'edit') startEdit(id);
  else if (action === 'delete') deleteProgram(id);
  else if (action === 'save') saveToRepo();
  else if (action === 'discard') discardChanges();
  else if (action === 'add') submitAdd();
  else if (action === 'update') submitUpdate();
  else if (action === 'cancel-edit') { state.editingId = null; renderSidebar(); }
  else if (action === 'preset-pick') presetPick(btn);
  else if (action === 'preset-add') presetAdd();
  else if (action === 'preset-del') presetDel(Number(btn.dataset.index));
  else if (action === 'preset-rename') presetRename(Number(btn.dataset.index));
}

function buildPresetsHtml() {
  var opts = state.config.busyOptions || [];
  var chips = opts.map(function (o) {
    return '<button type="button" class="chip" data-action="preset-pick" data-value="' + esc(o) + '">' + esc(o) + '</button>';
  }).join('');
  var rows = opts.map(function (o, i) {
    return '<div class="preset-row"><span>' + esc(o) + '</span>'
      + '<button type="button" class="mini" data-action="preset-rename" data-index="' + i + '">改</button>'
      + '<button type="button" class="mini danger" data-action="preset-del" data-index="' + i + '">删</button>'
      + '</div>';
  }).join('');
  return '<div class="presets">'
    + '<div class="presets-head"><span>常用事项</span></div>'
    + '<div class="preset-chips">' + (chips || '<span class="hint-inline">暂无常用项</span>') + '</div>'
    + '<details class="preset-manager"><summary>管理常用选项（不影响已添加日程）</summary>'
    + '<div class="preset-edit-list">' + (rows || '<span class="hint-inline">暂无常用项</span>') + '</div>'
    + '<div class="preset-add-row"><input type="text" id="f-preset-name" placeholder="新常用事项" maxlength="12">'
    + '<button type="button" class="primary" data-action="preset-add">添加</button></div>'
    + '</details>'
    + '</div>';
}

function presetPick(btn) {
  var val = btn.dataset.value;
  var radios = document.querySelectorAll('input[name="f-status"]');
  for (var i = 0; i < radios.length; i++) radios[i].checked = radios[i].value === 'busy';
  syncContentField();
  var c = $('f-content');
  if (c) { c.disabled = false; c.value = val; }
  updatePreview();
}

function presetAdd() {
  var input = $('f-preset-name');
  if (!input) return;
  var name = input.value.trim().slice(0, 12);
  if (!name) { showToast('请输入事项名称'); return; }
  var opts = state.config.busyOptions || (state.config.busyOptions = []);
  if (opts.indexOf(name) !== -1) { showToast('该选项已存在'); return; }
  opts.push(name);
  state.dirty = true;
  renderSidebar();
  showToast('已添加常用项（不影响已添加日程）');
}

function presetDel(idx) {
  var opts = state.config.busyOptions || [];
  if (idx < 0 || idx >= opts.length) return;
  if (!confirm('删除常用项「' + opts[idx] + '」？已添加的日程内容不受影响。')) return;
  opts.splice(idx, 1);
  state.dirty = true;
  renderSidebar();
  showToast('已删除常用项');
}

function presetRename(idx) {
  var opts = state.config.busyOptions || [];
  if (idx < 0 || idx >= opts.length) return;
  var name = prompt('输入新名称：', opts[idx]);
  if (name === null) return;
  name = name.trim().slice(0, 12);
  if (!name) { showToast('名称不能为空'); return; }
  if (opts.indexOf(name) !== -1 && opts.indexOf(name) !== idx) { showToast('该名称已存在'); return; }
  opts[idx] = name;
  state.dirty = true;
  renderSidebar();
  showToast('已修改常用项（不影响已添加日程）');
}

function onFormChange() {
  syncContentField();
  updatePreview();
}

function syncContentField() {
  var checked = document.querySelector('input[name="f-status"]:checked');
  var status = checked ? checked.value : 'free';
  var c = $('f-content');
  if (c) {
    c.disabled = status === 'free';
    c.placeholder = status === 'free' ? '空闲事项内容固定为“空闲”' : '填写事项内容';
  }
}

function updatePreview() {
  var el = $('splitPreview');
  if (!el) return;
  var f = readForm();
  if (f.error) { el.textContent = ''; return; }
  var pieces = Core.splitProgram(f.sDate, f.sTime, f.eDate, f.eTime);
  if (pieces.length > 1) {
    el.textContent = '将拆分为 ' + pieces.length + ' 条：'
      + pieces.map(function (p) { return p.date.slice(5) + ' ' + p.start + '-' + p.end; }).join('，');
  } else {
    el.textContent = '';
  }
}

function readForm() {
  var sDateEl = $('f-sDate');
  var sTimeEl = $('f-sTime');
  var eDateEl = $('f-eDate');
  var eTimeEl = $('f-eTime');
  var contentEl = $('f-content');
  if (!sDateEl || !sTimeEl || !eDateEl || !eTimeEl || !contentEl) return { error: '表单未就绪' };
  var sDate = sDateEl.value;
  var eDate = eDateEl.value;
  var sTime = Core.normalizeTime(sTimeEl.value);
  var eTime = Core.normalizeTime(eTimeEl.value);
  var checked = document.querySelector('input[name="f-status"]:checked');
  var status = checked ? checked.value : 'free';
  var contentRaw = contentEl.value.trim();
  var err = Core.validateInput(sDate, sTime, eDate, eTime);
  if (err) return { error: err };
  if (status === 'free') return { sDate: sDate, sTime: sTime, eDate: eDate, eTime: eTime, status: status, content: '空闲' };
  if (!contentRaw) return { error: '非空闲事项请填写内容' };
  return { sDate: sDate, sTime: sTime, eDate: eDate, eTime: eTime, status: status, content: contentRaw };
}

function startEdit(id) {
  state.editingId = id;
  renderSidebar();
}

function submitAdd() {
  var input = readForm();
  if (input.error) { showToast(input.error); return; }
  var pieces = Core.splitProgram(input.sDate, input.sTime, input.eDate, input.eTime);
  for (var i = 0; i < pieces.length; i++) {
    var hit = Core.findOverlap(state.programs, pieces[i].date, pieces[i].start, pieces[i].end, null);
    if (hit) {
      showToast('与 ' + pieces[i].date + ' ' + hit.start + '-' + hit.end + ' 的日程重叠');
      return;
    }
  }
  if (pieces.length > 1) {
    var list = pieces.map(function (p) { return p.date + ' ' + p.start + '-' + p.end; }).join('\n');
    if (!confirm('该时段跨 ' + pieces.length + ' 天，将自动拆分为 ' + pieces.length + ' 条独立日程：\n' + list + '\n确定添加？')) return;
  }
  for (var j = 0; j < pieces.length; j++) {
    state.programs.push({
      id: Core.uid(),
      date: pieces[j].date,
      start: pieces[j].start,
      end: pieces[j].end,
      status: input.status,
      content: input.content
    });
  }
  state.dirty = true;
  state.editingId = null;
  state.selectedKey = input.sDate;
  renderAll();
  showToast('已添加 ' + pieces.length + ' 条日程，记得保存并发布');
}

function submitUpdate() {
  var editing = state.programs.find(function (p) { return p.id === state.editingId; });
  if (!editing) return;
  var input = readForm();
  if (input.error) { showToast(input.error); return; }
  var hit = Core.findOverlap(state.programs, editing.date, input.sTime, input.eTime, editing.id);
  if (hit) {
    showToast('与 ' + hit.start + '-' + hit.end + ' 的日程重叠');
    return;
  }
  editing.start = input.sTime;
  editing.end = input.eTime;
  editing.status = input.status;
  editing.content = input.content;
  state.dirty = true;
  state.editingId = null;
  renderAll();
  showToast('已修改，记得保存并发布');
}

function deleteProgram(id) {
  var p = state.programs.find(function (x) { return x.id === id; });
  if (!p) return;
  if (!confirm('删除 ' + p.date + ' ' + p.start + '-' + p.end + ' 这条日程？')) return;
  state.programs = state.programs.filter(function (x) { return x.id !== id; });
  if (state.editingId === id) state.editingId = null;
  state.dirty = true;
  renderAll();
  showToast('已删除，记得保存并发布');
}

function discardChanges() {
  if (!confirm('放弃未保存的修改？')) return;
  state.editingId = null;
  loadData();
}

/* ===== GitHub 保存 ===== */
function getRepoFile() {
  var url = 'https://api.github.com/repos/' + SITE.repo + '/contents/' + SITE.dataPath;
  return fetch(url, {
    headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + state.token }
  }).then(function (res) {
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('GitHub 请求失败（' + res.status + '），请检查令牌');
    return res.json();
  });
}

function putRepoFile(content, sha) {
  var url = 'https://api.github.com/repos/' + SITE.repo + '/contents/' + SITE.dataPath;
  var body = { message: '更新日程数据', content: b64encode(content) };
  if (sha) body.sha = sha;
  return fetch(url, {
    method: 'PUT',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + state.token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  }).then(function (res) {
    if (res.ok) return res.json();
    return res.json().then(function (j) {
      var msg = (j && j.message) ? j.message : '保存失败（' + res.status + '）';
      if (res.status === 401 || res.status === 403) msg = '令牌无效或权限不足：请检查令牌有效期及 Contents 读写权限';
      if (res.status === 404) msg = '保存失败：请确认仓库与路径配置正确';
      throw new Error(msg);
    }).catch(function (e) {
      if (e instanceof Error && e.message) throw e;
      throw new Error('保存失败（' + res.status + '）');
    });
  });
}

function saveToRepo(successMsg) {
  if (!state.token) {
    showToast('请先输入 GitHub 管理令牌');
    openManage();
    return Promise.resolve(false);
  }
  return getRepoFile()
    .then(function (file) {
      var payload = { config: state.config, programs: state.programs };
      return putRepoFile(JSON.stringify(payload, null, 2) + '\n', file ? file.sha : undefined);
    })
    .then(function () {
      state.dirty = false;
      renderAll();
      showToast(successMsg || '已发布，1-3 分钟后游客可见');
      return true;
    })
    .catch(function (err) {
      showToast((err && err.name === 'TypeError') ? '网络错误：无法连接 GitHub' : (err && err.message || '保存失败，请重试'));
      return false;
    });
}

function b64encode(str) {
  var bytes = new TextEncoder().encode(str);
  var bin = '';
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/* ===== 游客可见范围 ===== */
function toggleGuestVisibility() {
  if (!state.token) {
    showToast('请输入管理令牌后，才能更改游客可见范围');
    openManage();
    return;
  }
  var next = state.config.guestViewMode === 'full' ? 'status' : 'full';
  var extra = state.dirty ? '（如有未保存的日程修改，将一并发布）' : '';
  if (next === 'full' && !confirm('将对游客全开放：所有访客都能看到每条日程的具体内容。确定？' + extra)) return;
  var prev = state.config.guestViewMode;
  state.config.guestViewMode = next;
  saveToRepo(next === 'full' ? '已对游客全开放，1-3 分钟后生效' : '已恢复为仅状态可见，1-3 分钟后生效')
    .then(function (ok) {
      if (!ok) {
        state.config.guestViewMode = prev;
        renderAll();
      }
    });
}

/* ===== 管理面板 ===== */
function openManage() {
  var hasToken = !!state.token;
  var helpHtml =
    '<ol>'
    + '<li>打开 <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noopener">Fine-grained tokens</a>，点 Generate new token</li>'
    + '<li>名称随意（如 schedule-calendar）；有效期按需选择（到期后需重新生成并更新）</li>'
    + '<li>Repository access 选 Only select repositories，勾选 zhancy1029/zhancy1029.github.io</li>'
    + '<li>Permissions → Repository permissions → Contents 设为 <b>Read and write</b></li>'
    + '<li>Generate token 并复制（只显示一次），粘贴到上方输入框</li>'
    + '</ol>';
  var html = '<div class="modal-mask" id="manageModal">'
    + '<div class="modal">'
    + '<div class="modal-head">管理</div>'
    + '<div class="modal-body">'
    + '<section>'
    + '<h3>GitHub 令牌</h3>'
    + '<p class="hint">用于把日程保存回你的仓库。令牌仅保存在本浏览器中，请勿在公共电脑上勾选“记住”。</p>'
    + '<input type="password" id="mg-token" placeholder="粘贴 GitHub 令牌" value="' + esc(state.token) + '" autocomplete="off">'
    + '<label class="checkbox"><input type="checkbox" id="mg-remember"' + (hasToken ? ' checked' : '') + '> 记住令牌</label>'
    + '<div class="row">'
    + '<button class="primary" data-action="mg-save-token">保存令牌</button>'
    + (hasToken ? '<button class="ghost danger-text" data-action="mg-clear-token">清除令牌并退出管理</button>' : '')
    + '</div>'
    + '<details class="help"><summary>如何创建令牌（首次使用）</summary>' + helpHtml + '</details>'
    + '</section>'
    + '<section>'
    + '<h3>游客可见范围</h3>'
    + '<p class="hint">当前：' + (state.config.guestViewMode === 'full' ? '全开放（游客可见具体内容）' : '仅状态（游客只能看到空闲/非空闲）') + '</p>'
    + '<button class="primary" data-action="mg-toggle-visibility">' + (state.config.guestViewMode === 'full' ? '恢复为仅状态' : '对游客全开放') + '</button>'
    + '</section>'
    + '<section>'
    + '<h3>数据</h3>'
    + '<p class="hint">' + (state.dirty ? '有未保存的修改，保存并发布后游客才能看到。' : '与仓库数据一致。') + '</p>'
    + '<button class="ghost" data-action="mg-reload">重新加载仓库数据</button>'
    + '</section>'
    + '</div>'
    + '<div class="modal-foot"><button class="ghost" data-action="mg-close">关闭</button></div>'
    + '</div>'
    + '</div>';
  els.modalRoot.innerHTML = html;
  els.modalRoot.querySelector('[data-action="mg-close"]').addEventListener('click', closeManage);
  els.modalRoot.querySelector('[data-action="mg-save-token"]').addEventListener('click', saveToken);
  var clearBtn = els.modalRoot.querySelector('[data-action="mg-clear-token"]');
  if (clearBtn) clearBtn.addEventListener('click', clearToken);
  els.modalRoot.querySelector('[data-action="mg-toggle-visibility"]').addEventListener('click', function () {
    closeManage();
    toggleGuestVisibility();
  });
  els.modalRoot.querySelector('[data-action="mg-reload"]').addEventListener('click', function () {
    if (state.dirty && !confirm('当前有未保存的修改，重新加载将丢失，继续？')) return;
    closeManage();
    loadData();
  });
  els.modalRoot.querySelector('#manageModal').addEventListener('click', function (e) {
    if (e.target.id === 'manageModal') closeManage();
  });
}

function closeManage() {
  els.modalRoot.innerHTML = '';
}

function saveToken() {
  var t = $('mg-token').value.trim();
  if (!t) { showToast('请输入令牌'); return; }
  state.token = t;
  if ($('mg-remember').checked) localStorage.setItem(LS_TOKEN, t);
  else localStorage.removeItem(LS_TOKEN);
  state.manage = true;
  closeManage();
  renderAll();
  showToast('已进入管理模式');
}

function clearToken() {
  state.token = '';
  state.manage = false;
  localStorage.removeItem(LS_TOKEN);
  closeManage();
  renderAll();
  showToast('已退出管理');
}

/* ===== 工具 ===== */
function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

var toastTimer = null;
function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { els.toast.classList.remove('show'); }, 3400);
}

init();
