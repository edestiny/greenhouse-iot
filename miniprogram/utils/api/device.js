// ============================================================
// 设备管理 API（内联版本 — 兼容编译缓存路径）
// ============================================================
const { request } = require('../request');

/** 获取已绑定设备列表 */
const getDevices = () => request({ url: '/devices' });

/** 获取单个设备详情 */
const getDeviceDetail = (deviceId) => request({ url: `/devices/${deviceId}` });

/** 绑定设备 */
const bindDevice = (code) =>
  request({ url: '/devices/bind', method: 'POST', data: { code } });

/** 解绑设备 */
const unbindDevice = (deviceId) =>
  request({ url: `/devices/${deviceId}/unbind`, method: 'POST' });

/** 修改设备名称 */
const updateDeviceName = (deviceId, name) =>
  request({ url: `/devices/${deviceId}`, method: 'PUT', data: { name } });

module.exports = { getDevices, getDeviceDetail, bindDevice, unbindDevice, updateDeviceName };
