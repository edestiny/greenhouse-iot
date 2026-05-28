// ============================================================
// 设备列表页 — 首页
// requires: services/device (设备列表API), utils/util (时间格式化)
// ============================================================
const { getDevices } = require('../../services/device');
const { formatTimeRelative } = require('../../utils/util');
const logger = require('../../utils/logger');

Page({
  data: {
    devices: [],
    loading: true,
    hasDevices: false,
  },

  /**
   * 页面就绪后，把 Storage 中的日志导出到本地文件
   * 路径: wx.env.USER_DATA_PATH/console.log
   */
  onReady() {
    try {
      var logs = logger.getLogs();
      var fs = wx.getFileSystemManager();
      var path = wx.env.USER_DATA_PATH + '/console.log';
      fs.writeFileSync(path, logs.join('\n'), 'utf8');
    } catch (e) {
      // 导出失败不影响正常功能
    }
  },

  onShow() {
    this.loadDevices();
  },

  onPullDownRefresh() {
    this.loadDevices().finally(() => wx.stopPullDownRefresh());
  },

  async loadDevices() {
    try {
      this.setData({ loading: true });
      const res = await getDevices();
      const devices = (res.data || []).map((d) => ({
        ...d,
        lastSeenText: d.last_seen ? formatTimeRelative(d.last_seen) : '从未上线',
      }));
      this.setData({
        devices,
        loading: false,
        hasDevices: devices.length > 0,
      });
    } catch (err) {
      console.error('[Index] 加载设备失败', err);
      this.setData({ loading: false });
      if (err.code !== -1) {
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      }
    }
  },

  /** 点击设备卡片 → 进入仪表盘 */
  onDeviceTap(e) {
    const { id } = e.currentTarget.dataset;
    const device = this.data.devices.find((d) => d.id === id);
    if (!device) return;

    getApp().globalData.selectedDeviceId = id;

    wx.navigateTo({
      url: `/subpackages/device/dashboard/index?deviceId=${id}&name=${encodeURIComponent(device.name || '')}`,
    });
  },

  /** 绑定新设备 */
  onBindDevice() {
    wx.navigateTo({ url: '/pages/bind/bind' });
  },
});
