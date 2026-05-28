// ============================================================
// 历史数据页 — 查看传感器历史趋势
// 路径：subpackages/device/history/index.js
// 进入方式：设备仪表盘 → 点击"查看历史"
// ============================================================

// 引入传感器数据服务（封装了 /sensors/history API）
const { getHistory } = require('../../../services/sensor');

// 引入时间格式化工具（转为 "YYYY-MM-DD HH:mm:ss" 格式）
const { formatTime } = require('../../../utils/util');

/**
 * 页面：历史数据页
 * 功能：
 *   1. 支持切换时间范围（天/周/月）
 *   2. 支持切换传感器类型（温度/湿度/pH/水位/光照）
 *   3. 自动计算统计数据（平均/最大/最小/当前值）
 *   4. 数据来自后端时序数据库（SQLite + 聚合查询）
 */
Page({

  // ==================== 页面数据 ====================
  data: {
    deviceId: '',                  // 设备 ID（从页面参数获取）
    period: 'day',                 // 时间范围：day | week | month
    sensorType: 'temperature',      // 当前查看的传感器类型
    dataPoints: [],                 // 时序数据点列表（用于图表渲染）
    stats: {                       // 统计数据
      avg: '--',
      max: '--',
      min: '--',
      current: '--',
    },
    loading: true,                 // 是否正在加载
  },

  // ==================== 传感器类型配置（非响应式，放在 data 外）====================
  /**
   * 传感器类型列表
   * 每个类型包含：
   *   - key:     对应后端字段名
   *   - label:   显示名称
   *   - unit:    单位
   */
  sensorTypes: [
    { key: 'temperature', label: '温度',   unit: '°C' },
    { key: 'humidity',    label: '湿度',   unit: '%' },
    { key: 'soilPH',     label: '土壤pH', unit: '' },
    { key: 'waterLevel',  label: '水位',   unit: '%' },
    { key: 'light',       label: '光照',   unit: 'lux' },
  ],

  // ==================== 生命周期 ====================
  /**
   * 页面加载 — 获取设备 ID 并加载历史数据
   * @param {Object} options - 页面参数（url query）
   * @param {string} options.deviceId - 设备 ID
   */
  onLoad(options) {
    // 从页面路径参数中获取设备 ID
    // 例如：/subpackages/device/history/index?deviceId=xxx
    this.setData({ deviceId: options.deviceId });
    this.loadHistory();
  },

  // ==================== 事件处理 ====================
  /**
   * 切换时间范围（天/周/月）
   * 触发方式：WXML 中 bindtap 调用，data-period 指定范围
   * @param {Object} e - 点击事件对象
   * @param {string} e.currentTarget.dataset.period - 时间范围
   */
  onPeriodChange(e) {
    const { period } = e.currentTarget.dataset;
    // 更新 period 后立即重新加载历史数据
    // setData 回调函数确保数据更新完成后再发起请求
    this.setData({ period }, () => this.loadHistory());
  },

  /**
   * 切换传感器类型（温度/湿度/pH等）
   * 触发方式：WXML 中 bindtap 调用，data-type 指定传感器类型
   * @param {Object} e - 点击事件对象
   * @param {string} e.currentTarget.dataset.type - 传感器类型 key
   */
  onTypeChange(e) {
    const { type } = e.currentTarget.dataset;
    this.setData({ sensorType: type }, () => this.loadHistory());
  },

  // ==================== 数据加载 ====================
  /**
   * 加载历史数据
   * 流程：
   *   1. 根据 period 计算时间范围和聚合粒度
   *   2. 调用 getHistory() 获取时序数据
   *   3. 格式化数据点（添加 time 文本、提取对应传感器数值）
   *   4. 计算统计数据（平均/最大/最小/当前值）
   *   5. 更新页面数据
   */
  async loadHistory() {
    // 显示 loading 状态
    this.setData({ loading: true });

    // -------- 1. 计算时间范围 --------
    const end = Date.now();       // 结束时间：当前时间
    let start = end;              // 起始时间：默认与结束时间相同
    let interval = '5m';         // 数据聚合粒度（默认 5 分钟）

    switch (this.data.period) {
      case 'day':
        // 查看最近 1 天，粒度 5 分钟（友好显示）
        start = end - 24 * 3600 * 1000;
        interval = '5m';
        break;
      case 'week':
        // 查看最近 7 天，粒度 1 小时（减少数据点数量）
        start = end - 7 * 24 * 3600 * 1000;
        interval = '1h';
        break;
      case 'month':
        // 查看最近 30 天，粒度 6 小时（大幅减少数据点）
        start = end - 30 * 24 * 3600 * 1000;
        interval = '6h';
        break;
    }

    try {
      // -------- 2. 调用后端 API 获取历史数据 --------
      // 注意：后端使用 Unix 时间戳（秒级），需要除以 1000
      const res = await getHistory(this.data.deviceId, {
        start: Math.floor(start / 1000),  // 转为秒级时间戳
        end: Math.floor(end / 1000),
        interval,                            // 数据聚合粒度
      });

      // -------- 3. 格式化数据点 --------
      const points = (res.data || []).map((p) => ({
        ...p,
        // 将 Unix 时间戳转为可读时间字符串
        time: formatTime(p.recorded_at),
        // 提取当前传感器类型对应的数值
        // 如果数据点为 null，默认设为 0
        value: Number(p[this.data.sensorType] || 0),
      }));

      // -------- 4. 计算统计数据 --------
      // 过滤掉无效数值（NaN）
      const values = points.map((p) => p.value).filter((v) => !isNaN(v));

      const stats = {
        // 平均值（保留两位小数）
        avg: values.length
          ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)
          : '--',
        // 最大值
        max: values.length ? Math.max(...values).toFixed(1) : '--',
        // 最小值
        min: values.length ? Math.min(...values).toFixed(1) : '--',
        // 当前值（最后一个数据点）
        current: values.length ? values[values.length - 1].toFixed(1) : '--',
      };

      // -------- 5. 更新页面数据 --------
      this.setData({ dataPoints: points, stats, loading: false });

    } catch (err) {
      // 加载失败：打印错误日志，关闭 loading，提示用户
      console.error('[History] 加载失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },
});
