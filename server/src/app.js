// ============================================================
// 温室 IoT 后端 — 应用入口
// ============================================================
const express = require('express');
const http = require('http');
const cors = require('cors');
const config = require('./config');
const db = require('./database');
const { errorHandler } = require('./middleware/errorHandler');
const { initMQTT } = require('./services/mqtt');
const { initWebSocket } = require('./services/websocket');
const scheduler = require('./services/scheduler');

// 引入路由
const authRoutes = require('./modules/auth/auth.routes');
const deviceRoutes = require('./modules/device/device.routes');
const sensorRoutes = require('./modules/sensor/sensor.routes');
const controlRoutes = require('./modules/control/control.routes');
const alertRoutes = require('./modules/alert/alert.routes');

const app = express();
const server = http.createServer(app);

// ---- 中间件 ----
app.use(cors({ origin: config.cors.origin }));
app.use(express.json());

// 健康检查
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---- API 路由 ----
app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/sensors', sensorRoutes);
app.use('/api/control', controlRoutes);
app.use('/api', alertRoutes);  // config + alerts

// ---- 全局错误处理 ----
app.use(errorHandler);

// ---- 启动 ----
const start = async () => {
  try {
    // 0. 初始化数据库
    await db.init();

    // 1. 初始化 WebSocket
    initWebSocket(server);

    // 2. 连接 MQTT（可选，无 broker 时跳过不阻塞启动）
    try {
      await initMQTT();
      console.log('[App] MQTT 服务就绪');
    } catch (e) {
      console.warn('[App] MQTT 未连接（本地开发可忽略）:', e.message);
    }

    // 3. 启动定时任务
    scheduler.start();

    // 4. 启动 HTTP 服务
    server.listen(config.port, () => {
      console.log(`\n========================================`);
      console.log(`  温室 IoT 后端已启动`);
      console.log(`  HTTP     → http://localhost:${config.port}`);
      console.log(`  WebSocket → ws://localhost:${config.port}/ws`);
      console.log(`  Health   → http://localhost:${config.port}/health`);
      console.log(`========================================\n`);
    });
  } catch (err) {
    console.error('[App] 启动失败', err);
    process.exit(1);
  }
};

start();
