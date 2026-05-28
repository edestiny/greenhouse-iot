// ============================================================
// 参数设置页 — 修改温室设备阈值参数
// 路径：subpackages/device/settings/index.js
// 进入方式：设备仪表盘 → 点击"参数设置"
// ============================================================

// 引入设备配置服务（封装了 /config API）
const { getConfig, updateConfig } = require('../../../services/config');

/**
 * 页面：设备参数设置
 * 功能：
 *   1. 加载当前设备的配置参数
 *   2. 通过滑块调整阈值参数
 *   3. 保存配置并下发到设备（通过 MQTT）
 *   4. 参数校验（如 pH 最小值 < 最大值）
 */
Page({

  // ==================== 页面数据 ====================
  data: {
    deviceId: '',              // 设备 ID（从页面参数获取）

    loading: true,             // 是否正在加载配置
    saving: false,             // 是否正在保存配置

    // -------- 传感器阈值参数 --------
    humidityMin: 40,          // 湿度下限（%）
    phMin: 6.0,             // 土壤 pH 最小值
    phMax: 7.5,             // 土壤 pH 最大值
    lightMin: 500,            // 光照强度下限（lux）

    // -------- 设备上报间隔 --------
    reportInterval: 5,         // 传感器数据上报间隔（秒）

    // -------- 滑块组件范围配置 --------
    // 注意：微信小程序 slider 组件只支持 min/max 属性
    // 这里用 data 驱动 WXML 中的范围显示
    humidityRange: { min: 10,  max: 90 },    // 湿度范围（%）
    phRange:      { min: 4.0, max: 9.0 },    // pH 范围
    lightRange:   { min: 100, max: 50000 },   // 光照范围（lux）
    intervalRange:{ min: 2,   max: 60 },       // 上报间隔范围（秒）
  },

  // ==================== 生命周期 ====================
  /**
   * 页面加载 — 获取设备 ID 并加载配置
   * @param {Object} options - 页面参数
   * @param {string} options.deviceId - 设备 ID
   */
  onLoad(options) {
    const { deviceId } = options;
    this.setData({ deviceId });
    this.loadConfig(deviceId);
  },

  // ==================== 数据加载 ====================
  /**
   * 从后端加载设备配置参数
   * 后端返回的配置格式：{ humidity_min, ph_min, ph_max, light_min, report_interval }
   * 如果设备没有保存过配置，使用 data 中的默认值
   * @param {string} deviceId - 设备 ID
   */
  async loadConfig(deviceId) {
    try {
      const res = await getConfig(deviceId);

      if (res.data) {
        // 后端返回了配置，更新页面数据
        // 使用 ?? 空值合并运算符：只有 null/undefined 时才用默认值
        const c = res.data;
        this.setData({
          humidityMin:   c.humidity_min ?? 40,
          phMin:         c.ph_min       ?? 6.0,
          phMax:         c.ph_max       ?? 7.5,
          lightMin:      c.light_min   ?? 500,
          reportInterval: c.report_interval ?? 5,
          loading: false,
        });
      } else {
        // 后端没有配置数据，使用默认值
        this.setData({ loading: false });
      }

    } catch (err) {
      console.error('[Settings] 加载配置失败', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载配置失败', icon: 'none' });
    }
  },

  // ==================== 事件处理 ====================
  /**
   * 滑块滑动事件
   * WXML 中的 slider 组件触发 bindchanging/bindchange 时调用
   * @param {Object} e - 事件对象
   * @param {string} e.currentTarget.dataset.field - 对应的 data 字段名
   * @param {number} e.detail.value - 滑块当前值
   */
  onSliderChange(e) {
    const { field } = e.currentTarget.dataset;
    // 使用 setData 的路径语法动态更新对应字段
    // 例如：field = 'phMin' → 更新 this.data.phMin
    this.setData({ [field]: e.detail.value });
  },

  /**
   * 保存配置按钮点击
   * 流程：
   *   1. 前端校验参数合法性
   *   2. 调用 updateConfig() 保存到后端
   *   3. 后端通过 MQTT 下发配置到设备
   *   4. 保存成功后返回上一页
   */
  async onSave() {
    const { deviceId, humidityMin, phMin, phMax, lightMin, reportInterval } = this.data;

    // -------- 1. 参数校验 --------
    // pH 最小值不能大于等于最大值
    if (phMin >= phMax) {
      wx.showToast({ title: 'pH 最小值不能大于最大值', icon: 'none' });
      return;  // 终止保存流程
    }

    // -------- 2. 显示保存中状态 --------
    this.setData({ saving: true });

    try {
      // -------- 3. 调用后端 API 保存配置 --------
      // 后端会将配置写入数据库，并通过 MQTT 下发到设备
      await updateConfig(deviceId, {
        humidity_min:   humidityMin,
        ph_min:         phMin,
        ph_max:         phMax,
        light_min:      lightMin,
        report_interval: reportInterval,
      });

      // -------- 4. 保存成功提示 --------
      wx.showToast({
        title: '配置已保存并下发到设备',
        icon: 'success',   // 成功图标（绿色对勾）
      });

      // 1.5 秒后自动返回上一页（让用户看到成功提示）
      setTimeout(() => wx.navigateBack(), 1500);

    } catch (err) {
      // -------- 5. 保存失败处理 --------
      // 显示后端返回的错误信息，或默认提示
      wx.showToast({
        title: err.message || '保存失败',
        icon: 'none',
      });
    } finally {
      // 无论成功失败，都关闭 saving 状态
      this.setData({ saving: false });
    }
  },
});
