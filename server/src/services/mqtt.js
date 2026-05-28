// ============================================================
// MQTT 客户端服务
// 职责：连接 Broker，订阅设备 Topic，接收传感器数据，下发配置/指令
// ============================================================
const mqtt = require('mqtt');
const config = require('../config');
const db = require('../database');
const { broadcastToDevice } = require('./websocket');

let client = null;

const initMQTT = () => {
  return new Promise((resolve, reject) => {
    client = mqtt.connect(config.mqtt.brokerUrl, {
      username: config.mqtt.username || undefined,
      password: config.mqtt.password || undefined,
      clean: true,
      connectTimeout: 10000,
      reconnectPeriod: 0, // 本地开发无 Broker 时不重连
    });

    client.on('connect', () => {
      console.log('[MQTT] 已连接 Broker:', config.mqtt.brokerUrl);

      // 订阅所有设备的上报 Topic
      client.subscribe(['greenhouse/+/sensor', 'greenhouse/+/status'], { qos: 1 }, (err) => {
        if (err) {
          console.error('[MQTT] 订阅失败', err);
          reject(err);
        } else {
          console.log('[MQTT] 已订阅 greenhouse/+/sensor, greenhouse/+/status');
          resolve();
        }
      });
    });

    client.on('reconnect', () => {
      console.log('[MQTT] 正在重连...');
    });

    client.on('error', (err) => {
      console.error('[MQTT] 连接错误', err);
      reject(err);
    });

    // ============ 消息处理 ============
    client.on('message', async (topic, payload) => {
      const parts = topic.split('/');
      const deviceId = parts[1];
      const msgType = parts[2];

      try {
        const data = JSON.parse(payload.toString());

        if (msgType === 'sensor') {
          await handleSensorData(deviceId, data);
        } else if (msgType === 'status') {
          await handleDeviceStatus(deviceId, data);
        }
      } catch (err) {
        console.error('[MQTT] 消息解析失败', topic, err);
      }
    });
  });
};

// ---- 处理传感器数据 ----
const handleSensorData = async (deviceId, data) => {
  const { temp, humidity, soilPH, waterLevel, light, pumpState, lampState, ts } = data;

  // 1. 写入传感器数据表
  const stmt = db.prepare(`
    INSERT INTO sensor_data (device_id, temperature, humidity, soil_ph, water_level, light, pump_state, lamp_state, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(deviceId, temp, humidity, soilPH, waterLevel, light, pumpState ? 1 : 0, lampState ? 1 : 0, new Date(ts * 1000).toISOString());

  // 2. 更新设备最后在线时间
  db.prepare('UPDATE devices SET is_online = 1, last_seen = datetime("now") WHERE id = ?').run(deviceId);

  // 3. 通过 WebSocket 推送给已连接的小程序
  broadcastToDevice(deviceId, {
    type: 'sensor_update',
    data: { temp, humidity, soilPH, waterLevel, light, pumpState, lampState, ts },
  });

  // 4. 检查告警条件
  await checkAlerts(deviceId, { temp, humidity, soilPH, waterLevel, light });
};

// ---- 处理设备状态 ----
const handleDeviceStatus = async (deviceId, data) => {
  db.prepare('UPDATE devices SET is_online = ?, last_seen = datetime("now") WHERE id = ?')
    .run(1, deviceId);

  broadcastToDevice(deviceId, {
    type: 'device_status',
    data: { online: true, uptime: data.uptime, pumpState: data.pump, lampState: data.lamp },
  });
};

// ---- 告警检查 ----
const checkAlerts = async (deviceId, data) => {
  const configRow = db.prepare('SELECT * FROM device_configs WHERE device_id = ?').get(deviceId);
  if (!configRow) return;

  const alerts = [];

  if (data.soilPH < configRow.ph_min) {
    alerts.push({ type: 'ph_low', level: 'warning', message: `土壤 pH 过低: ${data.soilPH} (下限: ${configRow.ph_min})` });
  }
  if (data.soilPH > configRow.ph_max) {
    alerts.push({ type: 'ph_high', level: 'warning', message: `土壤 pH 过高: ${data.soilPH} (上限: ${configRow.ph_max})` });
  }
  if (data.waterLevel < 20) {
    alerts.push({ type: 'water_low', level: 'critical', message: `水位过低: ${data.waterLevel}%` });
  }

  const insertAlert = db.prepare(
    'INSERT INTO alerts (device_id, type, level, message) VALUES (?, ?, ?, ?)'
  );

  for (const alert of alerts) {
    insertAlert.run(deviceId, alert.type, alert.level, alert.message);
    broadcastToDevice(deviceId, {
      type: 'alert',
      data: { deviceId, ...alert },
    });
  }
};

// ---- 下发配置到设备 ----
const sendConfig = (deviceId, config) => {
  if (!client) throw new Error('MQTT 未连接');
  client.publish(`greenhouse/${deviceId}/config`, JSON.stringify(config), { qos: 1 });
  console.log(`[MQTT] 下发配置 → ${deviceId}`, config);
};

// ---- 下发指令到设备 ----
const sendCommand = (deviceId, action) => {
  if (!client) throw new Error('MQTT 未连接');
  client.publish(`greenhouse/${deviceId}/command`, JSON.stringify({ action }), { qos: 1 });
  console.log(`[MQTT] 下发指令 → ${deviceId}: ${action}`);
};

module.exports = { initMQTT, sendConfig, sendCommand };
