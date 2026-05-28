// ============================================================
// 设备管理模块
// ============================================================
const { v4: uuidv4 } = require('uuid');
const db = require('../../database');
const { AppError } = require('../../middleware/errorHandler');

// ---- Controller ----
const getDevices = (req, res) => {
  const devices = db.prepare(`
    SELECT id, name, is_online, last_seen, created_at
    FROM devices
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(req.user.uid);

  res.json({ code: 200, data: devices });
};

const getDeviceDetail = (req, res) => {
  const device = db.prepare(`
    SELECT d.*, dc.*
    FROM devices d
    LEFT JOIN device_configs dc ON d.id = dc.device_id
    WHERE d.id = ? AND d.user_id = ?
  `).get(req.params.id, req.user.uid);

  if (!device) {
    throw new AppError(404, '设备不存在或无权访问');
  }

  // 获取最新一条传感器数据
  const latest = db.prepare(`
    SELECT * FROM sensor_data
    WHERE device_id = ?
    ORDER BY recorded_at DESC
    LIMIT 1
  `).get(req.params.id);

  res.json({
    code: 200,
    data: { ...device, latestSensor: latest || null },
  });
};

const bindDevice = (req, res) => {
  const { code } = req.body;
  if (!code || code.length < 6) {
    throw new AppError(400, '无效的激活码');
  }

  // 简单激活码验证（实际可改为查表或算法校验）
  const deviceId = `GH-${code}-${uuidv4().slice(0, 4)}`;

  // 检查是否已绑定
  const existing = db.prepare('SELECT id FROM devices WHERE id = ?').get(deviceId);
  if (existing) {
    throw new AppError(400, '该设备已绑定');
  }

  db.prepare('INSERT INTO devices (id, user_id) VALUES (?, ?)').run(deviceId, req.user.uid);
  db.prepare('INSERT INTO device_configs (device_id) VALUES (?)').run(deviceId);

  res.json({
    code: 200,
    data: { deviceId, message: '绑定成功' },
  });
};

const updateDevice = (req, res) => {
  const { name } = req.body;
  const result = db.prepare(
    'UPDATE devices SET name = ? WHERE id = ? AND user_id = ?'
  ).run(name, req.params.id, req.user.uid);

  if (result.changes === 0) {
    throw new AppError(404, '设备不存在或无权操作');
  }

  res.json({ code: 200, message: '更新成功' });
};

const unbindDevice = (req, res) => {
  // 解绑：删除设备及相关数据
  db.prepare('DELETE FROM alerts WHERE device_id = ?').run(req.params.id);
  db.prepare('DELETE FROM control_logs WHERE device_id = ?').run(req.params.id);
  db.prepare('DELETE FROM sensor_data WHERE device_id = ?').run(req.params.id);
  db.prepare('DELETE FROM sensor_data_minute WHERE device_id = ?').run(req.params.id);
  db.prepare('DELETE FROM device_configs WHERE device_id = ?').run(req.params.id);
  const result = db.prepare(
    'DELETE FROM devices WHERE id = ? AND user_id = ?'
  ).run(req.params.id, req.user.uid);

  if (result.changes === 0) {
    throw new AppError(404, '设备不存在或无权操作');
  }

  res.json({ code: 200, message: '解绑成功' });
};

// ---- Routes ----
const router = require('express').Router();
const { auth } = require('../../middleware/auth');

router.get('/', auth, getDevices);
router.get('/:id', auth, getDeviceDetail);
router.post('/bind', auth, bindDevice);
router.put('/:id', auth, updateDevice);
router.post('/:id/unbind', auth, unbindDevice);

module.exports = router;
