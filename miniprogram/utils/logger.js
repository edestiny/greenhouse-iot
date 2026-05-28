// ============================================================
// 日志拦截器 v3 — 使用 wx.setStorageSync 存储日志
//
// 存储 key: __console_logs__
// 最多保留 300 条，DevTools 可通过读取 Storage 文件获取
// ============================================================

var MAX_ENTRIES = 300;
var _rawLog, _rawWarn, _rawError;

// 生成时间戳
function timePrefix() {
  var d = new Date();
  var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
  return '[' + d.getFullYear() + '-' +
    pad(d.getMonth() + 1) + '-' +
    pad(d.getDate()) + ' ' +
    pad(d.getHours()) + ':' +
    pad(d.getMinutes()) + ':' +
    pad(d.getSeconds()) + ']';
}

// 格式化任意值
function stringify(val) {
  if (val === null) return 'null';
  if (val === undefined) return 'undefined';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (val instanceof Error) return val.message + '\n' + (val.stack || '');
  try { return JSON.stringify(val); } catch (e) { return String(val); }
}

// 写入一条日志到 Storage
function pushLog(level, args) {
  try {
    var line = timePrefix() + ' [' + level + '] ' +
      Array.prototype.map.call(args, stringify).join(' ');
    
    var logs = wx.getStorageSync('__console_logs__') || [];
    logs.push(line);
    if (logs.length > MAX_ENTRIES) {
      logs = logs.slice(-MAX_ENTRIES);
    }
    wx.setStorageSync('__console_logs__', logs);
  } catch (e) {
    // Storage 满了就放弃
  }
}

// 清空日志（页面就绪后可调用）
function clearLogs() {
  try { wx.setStorageSync('__console_logs__', []); } catch (e) {}
}

// 获取全部日志
function getLogs() {
  try { return wx.getStorageSync('__console_logs__') || []; } catch (e) { return []; }
}

/**
 * 初始化 — App.onLaunch 最开头调用
 */
function init() {
  _rawLog = console.log.bind(console);
  _rawWarn = console.warn.bind(console);
  _rawError = console.error.bind(console);

  // 清空旧日志
  clearLogs();

  // 劫持 console.log
  console.log = function () {
    _rawLog.apply(console, arguments);
    pushLog('LOG', arguments);
  };

  // 劫持 console.warn
  console.warn = function () {
    _rawWarn.apply(console, arguments);
    pushLog('WARN', arguments);
  };

  // 劫持 console.error
  console.error = function () {
    _rawError.apply(console, arguments);
    pushLog('ERROR', arguments);
  };

  console.log('[logger] ====== 会话开始 ======');

  return true;
}

/**
 * flush — 保留接口兼容性（v3 每写入即持久化，无需 flush）
 */
function flush() {
  // no-op: setStorageSync 本身就是同步持久化的
}

module.exports = { init: init, flush: flush, getLogs: getLogs, clearLogs: clearLogs };
