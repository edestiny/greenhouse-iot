// ============================================================
// 传感器数据 API
// ============================================================
const { request } = require('../utils/request');

/** 获取最新一条传感器数据 */
const getLatestSensor = (deviceId) => request({ url: `/sensors/latest?deviceId=${deviceId}` });

/** 查询历史数据 */
const getHistory = (deviceId, params) =>
  request({
    url: `/sensors/history?deviceId=${deviceId}`,
    data: params,
  });

module.exports = { getLatestSensor, getHistory };
