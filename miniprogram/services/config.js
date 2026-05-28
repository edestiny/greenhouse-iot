// ============================================================
// 设备参数配置 API
// ============================================================
const { request } = require('../utils/request');

/** 获取设备配置参数 */
const getConfig = (deviceId) => request({ url: `/config/${deviceId}` });

/** 更新配置并下发到设备 */
const updateConfig = (deviceId, config) =>
  request({
    url: `/config/${deviceId}`,
    method: 'PUT',
    data: config,
  });

module.exports = { getConfig, updateConfig };
