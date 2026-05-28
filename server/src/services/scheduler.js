// ============================================================
// 定时任务调度器
// ============================================================
const db = require('../database');
const config = require('../config');

/**
 * 数据清理：秒级数据聚合到分钟表，删除 7 天前原始数据
 */
const cleanupSensorData = () => {
  console.log('[Scheduler] 执行传感器数据清理...');

  try {
    // 聚合到分钟表
    db.exec(`
      INSERT OR IGNORE INTO sensor_data_minute
        (device_id, temperature, humidity, soil_ph, water_level, light, recorded_at)
      SELECT
        device_id,
        ROUND(AVG(temperature), 1),
        ROUND(AVG(humidity), 1),
        ROUND(AVG(soil_ph), 1),
        ROUND(AVG(water_level), 1),
        ROUND(AVG(light), 1),
        strftime('%Y-%m-%d %H:%M:00', recorded_at)
      FROM sensor_data
      WHERE recorded_at < datetime('now', '-' || @days || ' days')
      GROUP BY device_id, strftime('%Y-%m-%d %H:%M:00', recorded_at)
    `, { days: config.sensor.retentionDays });

    // 删除秒级原始数据
    const result = db.prepare(
      `DELETE FROM sensor_data WHERE recorded_at < datetime('now', '-' || ? || ' days')`
    ).run(config.sensor.retentionDays);

    console.log(`[Scheduler] 清理完成，删除 ${result.changes} 条记录`);
  } catch (err) {
    console.error('[Scheduler] 数据清理失败', err);
  }
};

/**
 * 设备离线检测
 */
const checkOfflineDevices = () => {
  const threshold = config.device.offlineThreshold;
  const result = db.prepare(`
    UPDATE devices
    SET is_online = 0
    WHERE is_online = 1
      AND last_seen < datetime('now', '-' || ? || ' seconds')
  `).run(threshold);

  if (result.changes > 0) {
    console.log(`[Scheduler] 标记 ${result.changes} 个设备为离线`);
  }
};

/**
 * 启动所有定时任务
 */
const start = () => {
  // 每天凌晨 3 点清理数据
  const now = new Date();
  const next3am = new Date(now);
  next3am.setHours(3, 0, 0, 0);
  if (next3am <= now) next3am.setDate(next3am.getDate() + 1);

  const delayTo3am = next3am.getTime() - now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  setTimeout(() => {
    cleanupSensorData();
    setInterval(cleanupSensorData, dayMs);
  }, delayTo3am);

  console.log(`[Scheduler] 数据清理将在 ${new Date(Date.now() + delayTo3am).toLocaleString()} 首次执行`);

  // 每 60 秒检查离线设备
  setInterval(checkOfflineDevices, 60000);
  console.log('[Scheduler] 离线检测每 60 秒执行');

  console.log('[Scheduler] 定时任务已启动');
};

module.exports = { start };
