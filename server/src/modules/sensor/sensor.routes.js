// ============================================================
// 传感器数据模块
// ============================================================
const db = require('../../database');
const { AppError } = require('../../middleware/errorHandler');

// ---- Controller ----
const getLatest = (req, res) => {
  const { deviceId } = req.query;
  if (!deviceId) throw new AppError(400, '缺少 deviceId 参数');

  // 验证设备归属
  const device = db.prepare('SELECT id FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.user.uid);
  if (!device) throw new AppError(404, '设备不存在或无权访问');

  const data = db.prepare(`
    SELECT temperature as temp, humidity, soil_ph as soilPH,
           water_level as waterLevel, light,
           pump_state as pumpState, lamp_state as lampState,
           recorded_at as ts
    FROM sensor_data
    WHERE device_id = ?
    ORDER BY recorded_at DESC
    LIMIT 1
  `).get(deviceId);

  res.json({ code: 200, data: data || null });
};

const getHistory = (req, res) => {
  const { deviceId, start, end, interval } = req.query;
  if (!deviceId) throw new AppError(400, '缺少 deviceId 参数');

  const device = db.prepare('SELECT id FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.user.uid);
  if (!device) throw new AppError(404, '设备不存在或无权访问');

  // 根据时间范围选择查询秒级或分钟级表
  const startDate = start ? new Date(parseInt(start) * 1000).toISOString() : new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const endDate = end ? new Date(parseInt(end) * 1000).toISOString() : new Date().toISOString();

  // 判断用哪张表：超过 7 天用聚合表
  const useMinute = interval === '1h' || interval === '6h' || interval === '1d';

  const table = useMinute ? 'sensor_data_minute' : 'sensor_data';
  const colTemp = useMinute ? 'temperature' : 'temperature';
  const colHum = useMinute ? 'humidity' : 'humidity';
  const colPH = useMinute ? 'soil_ph' : 'soil_ph';
  const colWater = useMinute ? 'water_level' : 'water_level';
  const colLight = useMinute ? 'light' : 'light';

  const data = db.prepare(`
    SELECT ${colTemp} as temperature, ${colHum} as humidity,
           ${colPH} as soil_ph, ${colWater} as water_level,
           ${colLight} as light, recorded_at
    FROM ${table}
    WHERE device_id = ?
      AND recorded_at >= ?
      AND recorded_at <= ?
    ORDER BY recorded_at ASC
    LIMIT 500
  `).all(deviceId, startDate, endDate);

  res.json({ code: 200, data });
};

// ---- Routes ----
const router = require('express').Router();
const { auth } = require('../../middleware/auth');

router.get('/latest', auth, getLatest);
router.get('/history', auth, getHistory);

module.exports = router;
