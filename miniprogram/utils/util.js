// ============================================================
// 工具函数
// ============================================================

/**
 * 格式化时间戳为可读时间
 */
const formatTime = (date) => {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const sec = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${min}:${sec}`;
};

/**
 * 格式化时间戳为简短时间（只显示时:分）
 */
const formatTimeShort = (date) => {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  const hour = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${hour}:${min}`;
};

/**
 * 格式化时间戳为相对时间（刚刚/X分钟前/X小时前/X天前）
 */
const formatTimeRelative = (date) => {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  const now = Date.now();
  const diff = now - d.getTime();

  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return formatTime(d);
};

/**
 * 传感器状态判定
 */
const getSensorStatus = {
  temperature: (value) => {
    if (value < 15) return { level: 'low', label: '偏低', color: '#3498db' };
    if (value > 35) return { level: 'high', label: '偏高', color: '#e74c3c' };
    return { level: 'normal', label: '正常', color: '#2ecc71' };
  },
  humidity: (value) => {
    if (value < 30) return { level: 'low', label: '干燥', color: '#f39c12' };
    if (value > 90) return { level: 'high', label: '潮湿', color: '#3498db' };
    return { level: 'normal', label: '适宜', color: '#2ecc71' };
  },
  soilPH: (value) => {
    if (value < 5.5) return { level: 'low', label: '过酸', color: '#e74c3c' };
    if (value > 8.0) return { level: 'high', label: '过碱', color: '#e74c3c' };
    return { level: 'normal', label: '正常', color: '#2ecc71' };
  },
  waterLevel: (value) => {
    if (value < 20) return { level: 'critical', label: '缺水', color: '#e74c3c' };
    if (value < 50) return { level: 'low', label: '偏低', color: '#f39c12' };
    return { level: 'normal', label: '充足', color: '#2ecc71' };
  },
  light: (value) => {
    if (value < 300) return { level: 'low', label: '过暗', color: '#f39c12' };
    if (value > 50000) return { level: 'high', label: '过强', color: '#e74c3c' };
    return { level: 'normal', label: '充足', color: '#2ecc71' };
  },
};

/**
 * 防抖
 */
const debounce = (fn, delay = 300) => {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
};

/**
 * 节流
 */
const throttle = (fn, interval = 5000) => {
  let lastTime = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastTime >= interval) {
      lastTime = now;
      fn.apply(this, args);
    }
  };
};

module.exports = {
  formatTime,
  formatTimeShort,
  formatTimeRelative,
  getSensorStatus,
  debounce,
  throttle,
};
