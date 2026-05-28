// ============================================================
// 环境配置 — 部署时修改 BASE_URL 即可切换环境
// ============================================================

const ENV = {
  // 开发环境（本地）
  dev: {
    BASE_URL: 'http://localhost:3000/api',
    WS_URL: 'ws://localhost:3000/ws',
  },
  // 测试环境
  staging: {
    BASE_URL: 'https://staging-api.example.com/api',
    WS_URL: 'wss://staging-api.example.com/ws',
  },
  // 生产环境
  prod: {
    BASE_URL: 'https://api.example.com/api',
    WS_URL: 'wss://api.example.com/ws',
  },
};

// 切换环境：dev | staging | prod
const currentEnv = 'dev';

module.exports = {
  BASE_URL: ENV[currentEnv].BASE_URL,
  WS_URL: ENV[currentEnv].WS_URL,
  // 传感器刷新间隔（毫秒）
  SENSOR_REFRESH_INTERVAL: 5000,
  // 手动控制频率限制（毫秒）
  CONTROL_THROTTLE: 5000,
  // 历史数据默认聚合粒度
  DEFAULT_AGGREGATION: '5m',
};
