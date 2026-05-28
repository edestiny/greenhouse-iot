// ============================================================
// 告警模块
// ============================================================
const db = require('../../database');
const { AppError } = require('../../middleware/errorHandler');
const { sendConfig } = require('../../services/mqtt');

// ---- 参数配置 ----
const getConfig = (req, res) => {
  const { deviceId } = req.params;
  const device = db.prepare('SELECT id FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.user.uid);
  if (!device) throw new AppError(404, '设备不存在或无权访问');

  const config = db.prepare('SELECT * FROM device_configs WHERE device_id = ?').get(deviceId);
  res.json({ code: 200, data: config || null });
};

const updateConfig = (req, res) => {
  const { deviceId } = req.params;
  const { humidity_min, ph_min, ph_max, light_min, report_interval } = req.body;

  const device = db.prepare('SELECT id FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.user.uid);
  if (!device) throw new AppError(404, '设备不存在或无权访问');

  // 更新数据库
  db.prepare(`
    UPDATE device_configs
    SET humidity_min = ?, ph_min = ?, ph_max = ?, light_min = ?,
        report_interval = ?, updated_at = CURRENT_TIMESTAMP
    WHERE device_id = ?
  `).run(
    humidity_min ?? 40,
    ph_min ?? 6.0,
    ph_max ?? 7.5,
    light_min ?? 500,
    report_interval ?? 5,
    deviceId
  );

  // 下发到设备
  const config = { humidityMin: humidity_min, phMin: ph_min, phMax: ph_max, lightMin: light_min };
  sendConfig(deviceId, config);

  res.json({ code: 200, message: '配置已保存并下发到设备' });
};

// ---- 告警列表 ----
const getAlerts = (req, res) => {
  const alerts = db.prepare(`
    SELECT * FROM alerts
    WHERE device_id IN (SELECT id FROM devices WHERE user_id = ?)
    ORDER BY created_at DESC
    LIMIT 50
  `).all(req.user.uid);

  res.json({ code: 200, data: alerts });
};

// ---- Routes ----
const router = require('express').Router();
const { auth } = require('../../middleware/auth');

router.get('/alerts', auth, getAlerts);
router.get('/config/:deviceId', auth, getConfig);
router.put('/config/:deviceId', auth, updateConfig);

module.exports = router;
