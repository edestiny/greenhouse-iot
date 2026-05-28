// ============================================================
// 设备绑定页
// ============================================================
const { bindDevice } = require('../../services/device');

Page({
  data: {
    code: '',
    loading: false,
    error: '',
  },

  onCodeInput(e) {
    this.setData({ code: e.detail.value.trim(), error: '' });
  },

  async onBind() {
    const { code } = this.data;
    if (!code) {
      this.setData({ error: '请输入设备激活码' });
      return;
    }
    if (code.length < 6) {
      this.setData({ error: '激活码长度不正确' });
      return;
    }

    this.setData({ loading: true, error: '' });

    try {
      await bindDevice(code);
      wx.showToast({ title: '绑定成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1500);
    } catch (err) {
      this.setData({
        error: err.message || '绑定失败，请检查激活码是否正确',
        loading: false,
      });
    }
  },

  /** 扫码绑定 */
  onScanCode() {
    wx.scanCode({
      success: (res) => {
        this.setData({ code: res.result, error: '' });
      },
      fail: () => {
        wx.showToast({ title: '扫描失败', icon: 'none' });
      },
    });
  },
});
