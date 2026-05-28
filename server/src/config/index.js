// ============================================================
// 配置中心
// ============================================================
require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,

  wx: {
    appid: process.env.WX_APPID || '',
    secret: process.env.WX_SECRET || '',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'greenhouse-iot-default-secret',
    expiresIn: '7d',
  },

  mqtt: {
    brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
    username: process.env.MQTT_USERNAME || '',
    password: process.env.MQTT_PASSWORD || '',
  },

  db: {
    path: process.env.DB_PATH || './data/greenhouse.db',
  },

  device: {
    offlineThreshold: parseInt(process.env.DEVICE_OFFLINE_THRESHOLD, 10) || 300,
  },

  sensor: {
    retentionDays: parseInt(process.env.SENSOR_RETENTION_DAYS, 10) || 7,
  },

  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
};
