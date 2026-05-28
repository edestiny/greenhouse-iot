// ============================================================
// WebSocket 连接管理 — 断线重连 + 数据分发
// ============================================================
const { WS_URL } = require('../config/env');

let socket = null;
let reconnectTimer = null;
let reconnectCount = 0;
let deviceId = null;
let manualClose = false;

/**
 * 连接 WebSocket，接收实时传感器推送
 * @param {string} deviceId - 设备 ID
 */
const connectSocket = (deviceId_) => {
  deviceId = deviceId_;
  manualClose = false;

  if (socket) {
    socket.close();
    socket = null;
  }

  const token = wx.getStorageSync('access_token') || '';
  const url = token
    ? `${WS_URL}?device=${deviceId}&token=${token}`
    : `${WS_URL}?device=${deviceId}`;

  socket = wx.connectSocket({ url });

  socket.onOpen(() => {
    console.log('[WS] 已连接');
    getApp().globalData.socketConnected = true;
    reconnectCount = 0;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  });

  socket.onMessage((res) => {
    try {
      const msg = JSON.parse(res.data);
      // 根据消息类型分发给不同事件
      switch (msg.type) {
        case 'sensor_update':
          getApp().globalData.eventBus.emit('sensor_update', msg.data);
          break;
        case 'device_status':
          getApp().globalData.eventBus.emit('device_status', msg.data);
          break;
        case 'alert':
          getApp().globalData.eventBus.emit('alert', msg.data);
          break;
        default:
          getApp().globalData.eventBus.emit('message', msg);
      }
    } catch (e) {
      console.error('[WS] 消息解析失败', e);
    }
  });

  socket.onError((err) => {
    console.error('[WS] 连接错误', err);
    getApp().globalData.socketConnected = false;
  });

  socket.onClose(() => {
    console.log('[WS] 已断开');
    getApp().globalData.socketConnected = false;

    if (!manualClose) {
      // 断线重连，间隔递增：3s → 6s → 12s → 30s (max)
      const delays = [3000, 6000, 12000, 30000];
      const delay = delays[Math.min(reconnectCount, delays.length - 1)];
      reconnectCount++;
      console.log(`[WS] ${delay / 1000}s 后重连 (第 ${reconnectCount} 次)`);
      reconnectTimer = setTimeout(() => {
        if (deviceId) connectSocket(deviceId);
      }, delay);
    }
  });
};

/**
 * 主动关闭 WebSocket
 */
const closeSocket = () => {
  manualClose = true;
  if (socket) {
    socket.close();
    socket = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  getApp().globalData.socketConnected = false;
  deviceId = null;
};

module.exports = { connectSocket, closeSocket };
