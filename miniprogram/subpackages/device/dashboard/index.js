// ============================================================
// 实时仪表盘 — 核心页面
// ============================================================
const { connectSocket, closeSocket } = require('../../../utils/socket');
const { getLatestSensor } = require('../../../services/sensor');
const { getConfig } = require('../../../services/config');
const { controlPump, controlLamp } = require('../../../services/control');
const { formatTime, throttle } = require('../../../utils/util');
const { CONTROL_THROTTLE } = require('../../../config/env');

Page({
  data: {
    deviceId: '',
    deviceName: '',
    isOnline: false,
    sensorData: {
      temperature: '--',
      humidity: '--',
      soilPH: '--',
      waterLevel: '--',
      light: '--',
    },
    config: {},
    pumpState: false,
    lampState: false,
    lastUpdate: '',
    controlDisabled: false,  // 手动控制节流锁
  },

  onLoad(options) {
    const { deviceId, name } = options;
    this.setData({
      deviceId,
      deviceName: decodeURIComponent(name || '我的温室'),
    });

    // 先拉取最新值（覆盖 WS 连接前的空白）
    this.loadLatestData(deviceId);
    this.loadConfig(deviceId);

    // 建立 WebSocket
    connectSocket(deviceId);

    // 监听推送
    getApp().globalData.eventBus.on('sensor_update', this.onSensorUpdate.bind(this));
    getApp().globalData.eventBus.on('device_status', this.onDeviceStatus.bind(this));
  },

  onUnload() {
    closeSocket();
    getApp().globalData.eventBus.off('sensor_update');
    getApp().globalData.eventBus.off('device_status');
  },

  onSensorUpdate(data) {
    this.setData({
      sensorData: {
        temperature: data.temp != null ? Number(data.temp).toFixed(1) : '--',
        humidity: data.humidity != null ? Number(data.humidity).toFixed(0) : '--',
        soilPH: data.soilPH != null ? Number(data.soilPH).toFixed(1) : '--',
        waterLevel: data.waterLevel != null ? Number(data.waterLevel).toFixed(0) : '--',
        light: data.light != null ? Number(data.light).toFixed(0) : '--',
      },
      pumpState: !!data.pumpState,
      lampState: !!data.lampState,
      lastUpdate: formatTime(new Date()),
    });
  },

  onDeviceStatus(data) {
    this.setData({
      isOnline: !!data.online,
      pumpState: !!data.pumpState,
      lampState: !!data.lampState,
    });
  },

  async loadLatestData(deviceId) {
    try {
      const res = await getLatestSensor(deviceId);
      if (res.data) {
        this.onSensorUpdate(res.data);
      }
    } catch (err) {
      console.error('[Dashboard] 获取最新数据失败', err);
    }
  },

  async loadConfig(deviceId) {
    try {
      const res = await getConfig(deviceId);
      if (res.data) {
        this.setData({ config: res.data });
      }
    } catch (err) {
      console.error('[Dashboard] 获取配置失败', err);
    }
  },

  /** 手动控制水泵（节流） */
  onTogglePump: throttle(async function () {
    const action = this.data.pumpState ? 'off' : 'on';
    try {
      await controlPump(this.data.deviceId, action);
      wx.showToast({ title: action === 'on' ? '水泵已开启' : '水泵已关闭', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: err.message || '控制失败', icon: 'none' });
    }
  }, CONTROL_THROTTLE),

  /** 手动控制补光灯（节流） */
  onToggleLamp: throttle(async function () {
    const action = this.data.lampState ? 'off' : 'on';
    try {
      await controlLamp(this.data.deviceId, action);
      wx.showToast({ title: action === 'on' ? '补光灯已开启' : '补光灯已关闭', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: err.message || '控制失败', icon: 'none' });
    }
  }, CONTROL_THROTTLE),

  /** 跳转历史数据 */
  onHistory() {
    wx.navigateTo({
      url: `/subpackages/device/history/index?deviceId=${this.data.deviceId}`,
    });
  },

  /** 跳转参数设置 */
  onSettings() {
    wx.navigateTo({
      url: `/subpackages/device/settings/index?deviceId=${this.data.deviceId}`,
    });
  },
});
