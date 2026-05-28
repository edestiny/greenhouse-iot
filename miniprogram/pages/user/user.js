// ============================================================
// 个人中心
// ============================================================
const { logout } = require('../../utils/auth');

Page({
  data: {
    userInfo: null,
    deviceCount: 0,
    appVersion: '1.0.0',
  },

  onShow() {
    const app = getApp();
    this.setData({
      userInfo: app.globalData.userInfo,
    });
  },

  /** 退出登录 */
  onLogout() {
    wx.showModal({
      title: '确认退出',
      content: '退出后需要重新登录',
      success: (res) => {
        if (res.confirm) {
          logout();
          this.setData({ userInfo: null });
          wx.reLaunch({ url: '/pages/index/index' });
        }
      },
    });
  },

  /** 跳转告警历史 */
  onAlertHistory() {
    wx.navigateTo({ url: '/subpackages/device/alerts/index' });
  },

  /** 关于 */
  onAbout() {
    wx.showModal({
      title: '温室管家 v1.0.0',
      content: '基于 Arduino + 微信小程序的 IoT 温室远程监控与自动控制系统。\n\n通过 MQTT 协议实时采集温湿度、土壤pH、水位、光照数据，支持远程灌溉与补光控制。',
      showCancel: false,
    });
  },
});
