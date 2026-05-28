// ============================================================
// 温室 IoT 远程监控系统 — 小程序入口
// ============================================================

// ⚠️ 强制加载桥接模块 — 防止 lazyCodeLoading 下编译缓存残留
//    旧版缓存中 index.js 仍 require('../../utils/api/device')
//    此 require 确保该模块无论如何都被打包进主包
require('./utils/api/device');

// 【必须最先加载】日志拦截器 — 将所有 console 写入本地文件
const logger = require('./utils/logger');

const { login } = require('./utils/auth');
const { connectSocket } = require('./utils/socket');
const { EventBus } = require('./utils/eventBus');

App({
  globalData: {
    userInfo: null,
    token: null,
    eventBus: new EventBus(),
    selectedDeviceId: null,
    socketConnected: false,
  },

  onLaunch() {
    // 初始化日志系统 — 所有 console 输出同步写入本地文件
    logger.init();

    // 静默登录
    login()
      .then((user) => {
        this.globalData.userInfo = user;
        console.log('[App] 登录成功', user.uid);
      })
      .catch((err) => {
        console.error('[App] 登录失败', err);
      });
  },

  onShow() {
    // 每次回到前台，尝试重连 WebSocket
    if (!this.globalData.socketConnected && this.globalData.selectedDeviceId) {
      connectSocket(this.globalData.selectedDeviceId);
    }
  },

  onHide() {
    // 进入后台时刷新日志缓冲区
    logger.flush();
  },
});
