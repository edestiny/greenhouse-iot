// ============================================================
// 微信登录 — 静默登录 + Token 本地缓存
// 所有状态用模块级变量管理，不依赖 getApp()
// ============================================================
const { request } = require('./request');

let _token = null;
let _userInfo = null;
let _loginPromise = null;

const getToken = () => _token;
const getUserInfo = () => _userInfo;
const getLoginPromise = () => _loginPromise;

const login = () => {
  if (_loginPromise) return _loginPromise;

  _loginPromise = new Promise((resolve, reject) => {
    const cachedToken = wx.getStorageSync('access_token');
    const cachedUser = wx.getStorageSync('user_info');

    if (cachedToken && cachedUser) {
      _token = cachedToken;
      _userInfo = cachedUser;
      resolve(cachedUser);
      verifyToken().catch(() => doRealLogin().then(resolve).catch(reject));
      return;
    }

    doRealLogin().then(resolve).catch(reject);
  });

  return _loginPromise;
};

const doRealLogin = () => {
  return new Promise((resolve, reject) => {
    wx.login({
      success: ({ code }) => {
        request({ url: '/auth/login', method: 'POST', data: { code } })
          .then((res) => {
            const { access_token, user } = res.data;
            wx.setStorageSync('access_token', access_token);
            wx.setStorageSync('user_info', user);
            _token = access_token;
            _userInfo = user;
            resolve(user);
          })
          .catch(reject);
      },
      fail: (err) => reject({ code: -1, message: '微信登录失败', detail: err }),
    });
  });
};

const verifyToken = () => request({ url: '/auth/me' });

const logout = () => {
  wx.removeStorageSync('access_token');
  wx.removeStorageSync('user_info');
  _token = null;
  _userInfo = null;
  _loginPromise = null;
};

module.exports = { login, logout, getToken, getUserInfo, getLoginPromise };
