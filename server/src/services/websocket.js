// ============================================================
// WebSocket 服务
// 职责：小程序连接管理，实时数据推送
// ============================================================
const { WebSocketServer } = require('ws');
const url = require('url');

let wss = null;

// deviceId → Set<ws>
const deviceSubscribers = new Map();

const initWebSocket = (server) => {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    const params = url.parse(req.url, true).query;
    const deviceId = params.device;

    if (!deviceId) {
      ws.close(4001, '缺少 device 参数');
      return;
    }

    ws._deviceId = deviceId;

    // 注册订阅
    if (!deviceSubscribers.has(deviceId)) {
      deviceSubscribers.set(deviceId, new Set());
    }
    deviceSubscribers.get(deviceId).add(ws);

    console.log(`[WS] 客户端连接 → 设备: ${deviceId}, 当前订阅数: ${deviceSubscribers.get(deviceId).size}`);

    // 发送确认消息
    ws.send(JSON.stringify({ type: 'connected', deviceId }));

    ws.on('close', () => {
      const subs = deviceSubscribers.get(deviceId);
      if (subs) {
        subs.delete(ws);
        if (subs.size === 0) deviceSubscribers.delete(deviceId);
      }
      console.log(`[WS] 客户端断开 → 设备: ${deviceId}`);
    });

    ws.on('error', (err) => {
      console.error('[WS] 客户端错误', err);
    });
  });

  console.log('[WS] WebSocket 服务已启动');
};

/**
 * 向指定设备的所有小程序客户端广播消息
 */
const broadcastToDevice = (deviceId, message) => {
  const subs = deviceSubscribers.get(deviceId);
  if (!subs || subs.size === 0) return;

  const data = JSON.stringify(message);
  subs.forEach((ws) => {
    if (ws.readyState === 1) {  // OPEN
      ws.send(data);
    }
  });
};

module.exports = { initWebSocket, broadcastToDevice };
