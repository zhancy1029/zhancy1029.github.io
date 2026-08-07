/* 核心逻辑：不依赖 DOM，可在浏览器与 Node 中运行 */
(function (global) {
  'use strict';

  var WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  function pad2(n) { return String(n).padStart(2, '0'); }

  function toDateKey(y, m, d) { return y + '-' + pad2(m) + '-' + pad2(d); }

  function parseDateKey(key) {
    var parts = key.split('-').map(Number);
    return { y: parts[0], m: parts[1], d: parts[2] };
  }

  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }

  function dateToObj(date) {
    return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() };
  }

  function keyToDate(key) {
    var o = parseDateKey(key);
    return new Date(o.y, o.m - 1, o.d);
  }

  function nextDateKey(key) {
    var dt = keyToDate(key);
    dt.setDate(dt.getDate() + 1);
    var o = dateToObj(dt);
    return toDateKey(o.y, o.m, o.d);
  }

  function todayKey() {
    var o = dateToObj(new Date());
    return toDateKey(o.y, o.m, o.d);
  }

  function weekdayCN(key) {
    return WEEKDAY_CN[keyToDate(key).getDay()];
  }

  /* 生成某月日历格子，周日在最左。inMonth=false 表示相邻月份补位 */
  function monthGrid(year, month) {
    var firstDow = new Date(year, month - 1, 1).getDay();
    var lead = firstDow;
    var dim = daysInMonth(year, month);
    var total = Math.ceil((lead + dim) / 7) * 7;
    var cells = [];
    for (var i = 0; i < total; i++) {
      var dayNum = i - lead + 1;
      if (dayNum >= 1 && dayNum <= dim) {
        cells.push({ y: year, m: month, d: dayNum, inMonth: true, key: toDateKey(year, month, dayNum) });
      } else {
        var dt = new Date(year, month - 1, dayNum);
        var o = dateToObj(dt);
        cells.push({ y: o.y, m: o.m, d: o.d, inMonth: false, key: toDateKey(o.y, o.m, o.d) });
      }
    }
    return cells;
  }

  /* 时间 "HH:MM" -> 分钟；"24:00" -> 1440 */
  function timeToMin(t) {
    var h = parseInt(t.slice(0, 2), 10);
    var m = parseInt(t.slice(3, 5), 10);
    return h * 60 + m;
  }

  /* 把 "9:00" 等输入规范为 "HH:MM"，非法返回 null；允许 24:00 */
  function normalizeTime(input) {
    var s = String(input || '').trim();
    var m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    var h = parseInt(m[1], 10);
    var min = parseInt(m[2], 10);
    if (h < 0 || h > 24 || min < 0 || min > 59) return null;
    if (h === 24 && min !== 0) return null;
    return pad2(h) + ':' + pad2(min);
  }

  var PARTS = [
    { id: 'morning', label: '上午', time: '8:00-12:00', start: 8 * 60, end: 12 * 60 },
    { id: 'afternoon', label: '下午', time: '12:00-18:00', start: 12 * 60, end: 18 * 60 },
    { id: 'evening', label: '晚上', time: '18:00-24:00', start: 18 * 60, end: 24 * 60 }
  ];

  /* 某日三个 part 的颜色 */
  function partColors(programs, dateKey) {
    var dayPrograms = programs.filter(function (p) { return p.date === dateKey; });
    return PARTS.map(function (part) { return partColor(dayPrograms, part); });
  }

  function partColor(dayPrograms, part) {
    var inPart = dayPrograms.filter(function (p) {
      return timeToMin(p.start) < part.end && timeToMin(p.end) > part.start;
    });
    if (inPart.length === 0) return 'gray';
    if (inPart.every(function (p) { return p.status === 'free'; })) return 'green';
    if (inPart.every(function (p) { return p.status === 'busy'; })) {
      return coversFully(inPart, part.start, part.end) ? 'red' : 'yellow';
    }
    return 'yellow';
  }

  /* 非空闲时段并集是否完整覆盖 [start, end) */
  function coversFully(programs, start, end) {
    var ints = programs
      .map(function (p) { return [timeToMin(p.start), timeToMin(p.end)]; })
      .sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var cur = start;
    for (var i = 0; i < ints.length; i++) {
      if (ints[i][0] > cur) return false;
      cur = Math.max(cur, ints[i][1]);
      if (cur >= end) return true;
    }
    return cur >= end;
  }

  /* 跨日输入拆分为逐日片段 */
  function splitProgram(startDate, startTime, endDate, endTime) {
    var pieces = [];
    if (startDate === endDate) {
      pieces.push({ date: startDate, start: startTime, end: endTime });
      return pieces;
    }
    if (timeToMin(startTime) < 24 * 60) {
      pieces.push({ date: startDate, start: startTime, end: '24:00' });
    }
    var d = nextDateKey(startDate);
    while (d !== endDate) {
      pieces.push({ date: d, start: '00:00', end: '24:00' });
      d = nextDateKey(d);
    }
    if (timeToMin(endTime) > 0) {
      pieces.push({ date: endDate, start: '00:00', end: endTime });
    }
    return pieces;
  }

  /* 校验输入，返回错误信息或 null */
  function validateInput(startDate, startTime, endDate, endTime) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return '日期格式不正确';
    if (!startTime || !endTime) return '请填写时间（时:分）';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) return '开始时间格式应为 时:分';
    if (!/^(24:00|([01]\d|2[0-3]):[0-5]\d)$/.test(endTime)) return '结束时间格式应为 时:分（可为24:00）';
    if (endDate < startDate) return '结束日期不能早于开始日期';
    if (endDate === startDate && timeToMin(endTime) <= timeToMin(startTime)) return '结束时间必须晚于开始时间';
    return null;
  }

  function overlaps(aStart, aEnd, bStart, bEnd) {
    return timeToMin(aStart) < timeToMin(bEnd) && timeToMin(bStart) < timeToMin(aEnd);
  }

  function findOverlap(programs, date, start, end, excludeId) {
    return programs.find(function (p) {
      return p.date === date && p.id !== excludeId && overlaps(start, end, p.start, p.end);
    }) || null;
  }

  /* 相邻日程间的空档分级：返回 CSS 间距类名 */
  function gapTier(gapMin) {
    if (gapMin <= 0) return '';
    if (gapMin <= 30) return 'gap-small';
    if (gapMin < 120) return 'gap-med';
    return 'gap-large';
  }

  function uid() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function shortDate(key) {
    var o = parseDateKey(key);
    return pad2(o.m) + '-' + pad2(o.d);
  }

  var Core = {
    pad2: pad2,
    toDateKey: toDateKey,
    parseDateKey: parseDateKey,
    daysInMonth: daysInMonth,
    keyToDate: keyToDate,
    nextDateKey: nextDateKey,
    todayKey: todayKey,
    weekdayCN: weekdayCN,
    monthGrid: monthGrid,
    timeToMin: timeToMin,
    normalizeTime: normalizeTime,
    PARTS: PARTS,
    partColors: partColors,
    partColor: partColor,
    coversFully: coversFully,
    splitProgram: splitProgram,
    validateInput: validateInput,
    overlaps: overlaps,
    findOverlap: findOverlap,
    gapTier: gapTier,
    uid: uid,
    shortDate: shortDate
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  else global.Core = Core;
})(typeof window !== 'undefined' ? window : globalThis);
