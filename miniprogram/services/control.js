// ============================================================
// 远程控制 API — 水泵 / 补光灯
// ============================================================
const { request } = require('../utils/request');

/** 控制水泵 */
const controlPump = (deviceId, action) =>
  request({
    url: '/control/pump',
    method: 'POST',
    data: { deviceId, action },
  });

/** 控制补光灯 */
const controlLamp = (deviceId, action) =>
  request({
    url: '/control/lamp',
    method: 'POST',
    data: { deviceId, action },
  });

module.exports = { controlPump, controlLamp };
