// ============================================================
// 远程控制模块 — 水泵 / 补光灯
// ============================================================
const db = require('../../database');
const { AppError } = require('../../middleware/errorHandler');
const { sendCommand } = require('../../services/mqtt');

// 手动控制频率限制（秒）
const CONTROL_COOLDOWN = 5;

// ---- Controller ----
const controlPump = async (req, res, next) => {
  try {
    const { deviceId, action } = req.body;
    if (!deviceId || !action) throw new AppError(400, '缺少 deviceId 或 action 参数');
    if (!['on', 'off'].includes(action)) throw new AppError(400, 'action 只能是 on 或 off');

    // 验证设备归属
    const device = db.prepare('SELECT id FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.user.uid);
    if (!device) throw new AppError(404, '设备不存在或无权操作');

    // 频率限制
    const lastCmd = db.prepare(`
      SELECT created_at FROM control_logs
      WHERE device_id = ? AND action LIKE 'pump_%'
      ORDER BY created_at DESC LIMIT 1
    `).get(deviceId);

    if (lastCmd) {
      const elapsed = (Date.now() - new Date(lastCmd.created_at + 'Z').getTime()) / 1000;
      if (elapsed < CONTROL_COOLDOWN) {
        throw new AppError(429, `操作过于频繁，请 ${Math.ceil(CONTROL_COOLDOWN - elapsed)} 秒后再试`);
      }
    }

    // 下发指令
    sendCommand(deviceId, `pump_${action}`);

    // 记录日志
    db.prepare('INSERT INTO control_logs (device_id, action, source, result) VALUES (?, ?, ?, ?)')
      .run(deviceId, `pump_${action}`, 'manual', 'success');

    res.json({ code: 200, message: `水泵已${action === 'on' ? '开启' : '关闭'}` });
  } catch (err) {
    next(err);
  }
};

const controlLamp = async (req, res, next) => {
  try {
    const { deviceId, action } = req.body;
    if (!deviceId || !action) throw new AppError(400, '缺少 deviceId 或 action 参数');
    if (!['on', 'off'].includes(action)) throw new AppError(400, 'action 只能是 on 或 off');

    const device = db.prepare('SELECT id FROM devices WHERE id = ? AND user_id = ?').get(deviceId, req.user.uid);
    if (!device) throw new AppError(404, '设备不存在或无权操作');

    // 频率限制
    const lastCmd = db.prepare(`
      SELECT created_at FROM control_logs
      WHERE device_id = ? AND action LIKE 'lamp_%'
      ORDER BY created_at DESC LIMIT 1
    `).get(deviceId);

    if (lastCmd) {
      const elapsed = (Date.now() - new Date(lastCmd.created_at + 'Z').getTime()) / 1000;
      if (elapsed < CONTROL_COOLDOWN) {
        throw new AppError(429, `操作过于频繁，请 ${Math.ceil(CONTROL_COOLDOWN - elapsed)} 秒后再试`);
      }
    }

    sendCommand(deviceId, `lamp_${action}`);

    db.prepare('INSERT INTO control_logs (device_id, action, source, result) VALUES (?, ?, ?, ?)')
      .run(deviceId, `lamp_${action}`, 'manual', 'success');

    res.json({ code: 200, message: `补光灯已${action === 'on' ? '开启' : '关闭'}` });
  } catch (err) {
    next(err);
  }
};

// ---- Routes ----
const router = require('express').Router();
const { auth } = require('../../middleware/auth');

router.post('/pump', auth, controlPump);
router.post('/lamp', auth, controlLamp);

module.exports = router;
