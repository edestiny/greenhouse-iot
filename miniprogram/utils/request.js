// ============================================================
// HTTP 请求封装 — 统一鉴权 + 错误处理 + Token 刷新
// ============================================================
const { BASE_URL } = require('../config/env');

const request = (options) => {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('access_token');
    const header = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.header || {}),
    };

    wx.request({
      url: `${BASE_URL}${options.url}`,
      method: options.method || 'GET',
      data: options.data || {},
      header,
      success: (res) => {
        // Token 过期，尝试刷新
        if (res.statusCode === 401) {
          return refreshTokenAndRetry(options).then(resolve).catch(reject);
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject({
            code: res.statusCode,
            message: res.data?.message || `请求失败 (${res.statusCode})`,
          });
        }
      },
      fail: (err) => {
        reject({ code: -1, message: '网络连接失败，请检查网络设置', detail: err });
      },
    });
  });
};

// Token 过期复用原请求
const refreshTokenAndRetry = (options) => {
  return new Promise((resolve, reject) => {
    wx.login({
      success: ({ code }) => {
        const token = wx.getStorageSync('access_token');
        wx.request({
          url: `${BASE_URL}/auth/login`,
          method: 'POST',
          data: { code },
          header: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          success: (res) => {
            if (res.data?.data?.access_token) {
              wx.setStorageSync('access_token', res.data.data.access_token);
              // 重试原请求
              request(options).then(resolve).catch(reject);
            } else {
              // 刷新失败，跳转登录
              wx.removeStorageSync('access_token');
              reject({ code: 401, message: '登录已过期，请重新打开小程序' });
            }
          },
          fail: () => reject({ code: -1, message: '刷新登录失败' }),
        });
      },
      fail: () => reject({ code: -1, message: '获取登录码失败' }),
    });
  });
};

module.exports = { request };
