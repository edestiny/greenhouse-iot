# 温室 IoT 远程监控系统 — 微信小程序架构方案

> **定位**：Arduino 嵌入式采集 + Node.js 云端服务 + 微信小程序控制面板
> **核心能力**：实时环境监控 · 远程参数调控 · 自动灌溉/补光

---

## 一、系统全景架构

```
+====================================================================+
|                          温 室 现 场                                 |
|                                                                     |
|  +----------+  +----------+  +----------+  +----------+            |
|  | DHT11    |  | 土壤pH   |  | 水位     |  | 光照     |            |
|  | 温湿度   |  | 传感器   |  | 传感器   |  | 传感器   |            |
|  +----+-----+  +----+-----+  +----+-----+  +----+-----+            |
|       |              |              |              |                  |
|       +--------------+--------------+--------------+                  |
|                      |                                               |
|               +------+------+                                       |
|               |  LGT8F328P  |  <-- Arduino 兼容主控                  |
|               |  (Arduino)  |                                       |
|               +------+------+                                       |
|                      |                                               |
|         +------------+------------+                                  |
|         |                         |                                  |
|  +------+------+           +------+------+                          |
|  | 灌溉水泵    |           | 补光灯      |                          |
|  | (继电器)    |           | (继电器)    |                          |
|  +-------------+           +-------------+                          |
|                      |                                               |
|               +------+------+                                       |
|               | WiFi 模块   |  <-- ESP8266 / ESP32                  |
|               | (MQTT Client)|                                      |
|               +------+------+                                       |
|                      |                                               |
+======================|===============================================+
                       |  MQTT (TLS) / HTTP
                       v
+====================================================================+
|                       云 端 服 务 层                                  |
|                                                                     |
|  +------------------+   +------------------+   +------------------+ |
|  |  MQTT Broker     |   |  Node.js 后端     |   |  Redis (缓存)    | |
|  |  (EMQX/Mosquitto)|   |  Express + 业务   |   |  设备在线状态     | |
|  +--------+---------+   +--------+---------+   +------------------+ |
|           |                      |                                    |
|           |              +-------+-------+                          |
|           |              | 数据库        |                          |
|           +------------->| SQLite/MySQL  |                          |
|                          | - 传感器时序数据|                         |
|                          | - 用户参数设置 |                          |
|                          | - 设备管理     |                          |
|                          +---------------+                          |
+====================================================================+
                       |  HTTPS (wx.request)
                       v
+====================================================================+
|                    微 信 小 程 序 前 端                               |
|                                                                     |
|  +--------+  +--------+  +--------+  +--------+  +--------+        |
|  | 实时   |  | 参数   |  | 历史   |  | 手动   |  | 告警   |        |
|  | 仪表盘 |  | 设置   |  | 数据   |  | 控制   |  | 通知   |        |
|  +--------+  +--------+  +--------+  +--------+  +--------+        |
+====================================================================+
```

---

## 二、设备层（Arduino 端）

### 2.1 硬件清单

| 组件 | 型号 | 用途 | 接口 |
|------|------|------|------|
| 主控 | LGT8F328P | Arduino 兼容 MCU，采集与控制 | — |
| 温湿度 | DHT11 | 空气温度 + 湿度 | GPIO 数字口 |
| 土壤 pH | pH 传感器模块 | 土壤酸碱度 | ADC 模拟口 |
| 水位 | 超声波 / 液位传感器 | 蓄水池水位 | GPIO / ADC |
| 光照 | BH1750 / 光敏电阻 | 光照强度 | I2C / ADC |
| WiFi | ESP8266 / ESP32 | 网络通信（MQTT Client） | UART (AT 指令) |
| 灌溉 | 继电器模块 + 水泵 | 浇水执行 | GPIO 数字口 |
| 补光 | 继电器模块 + LED 灯带 | 补光执行 | GPIO 数字口 |

### 2.2 Arduino 固件架构

```cpp
// 固件核心逻辑骨架
// 文件：greenhouse_firmware.ino

#include <DHT.h>
#include <SoftwareSerial.h>   // ESP8266 通信

// ========== 传感器引脚定义 ==========
#define DHTPIN      2
#define SOIL_PH_PIN A0
#define WATER_PIN   A1
#define LIGHT_PIN   A2
#define PUMP_PIN    7
#define LIGHT_PIN   8

// ========== 全局变量 ==========
DHT dht(DHTPIN, DHT11);
float temperature, humidity, soilPH, waterLevel, lightLevel;
bool pumpState = false, lampState = false;

// ========== 云端下发的设定值 ==========
float targetHumidityMin  = 40.0;    // 湿度下限（低于此值灌溉）
float targetPHMin        = 6.0;     // pH 下限
float targetPHMax        = 7.5;     // pH 上限
float targetLightMin     = 500.0;   // 光照下限（低于此值补光）

// ========== 上报周期 ==========
unsigned long lastReport = 0;
const unsigned long REPORT_INTERVAL = 5000;  // 5 秒上报一次

void setup() {
  Serial.begin(115200);
  dht.begin();
  pinMode(PUMP_PIN, OUTPUT);
  pinMode(LIGHT_PIN, OUTPUT);
  initWiFi();
  initMQTT();
}

void loop() {
  // 1. 维持 MQTT 连接
  mqttLoop();

  // 2. 读取所有传感器
  readSensors();

  // 3. 自动控制逻辑
  autoControl();

  // 4. 定时上报
  if (millis() - lastReport >= REPORT_INTERVAL) {
    reportSensorData();
    lastReport = millis();
  }
}
```

### 2.3 MQTT Topic 设计（设备 ↔ 云端）

```
                    设备 → 云端（上报）
┌─────────────────────────────────────────────────────┐
│ greenhouse/{deviceId}/sensor                        │
│   → {"temp":25.3, "humidity":62, "soilPH":6.8,     │
│      "waterLevel":75, "light":1200, "ts":1716890000}│
│                                                     │
│ greenhouse/{deviceId}/status                        │
│   → {"pump":true, "lamp":false, "uptime":3600}      │
└─────────────────────────────────────────────────────┘

                    云端 → 设备（下发）
┌─────────────────────────────────────────────────────┐
│ greenhouse/{deviceId}/config                        │
│   → {"humidityMin":40, "phMin":6.0, "phMax":7.5,   │
│       "lightMin":500}                                │
│                                                     │
│ greenhouse/{deviceId}/command                       │
│   → {"action":"pump_on"}  /  {"action":"pump_off"}  │
│   → {"action":"lamp_on"}  /  {"action":"lamp_off"}  │
└─────────────────────────────────────────────────────┘
```

### 2.4 自动控制逻辑（Arduino 端执行）

```
每 5 秒循环：

  if (soilHumidity < targetHumidityMin)  →  开启水泵
  if (soilHumidity >= targetHumidityMin + 5)  →  关闭水泵

  if (soilPH < targetPHMin)  →  告警（需要人工干预，加碱性调节剂）
  if (soilPH > targetPHMax)  →  告警（需要人工干预，加酸性调节剂）

  if (lightLevel < targetLightMin)  →  开启补光灯
  if (lightLevel >= targetLightMin + 100)  →  关闭补光灯
```

> **设计原则**：自动控制逻辑跑在 Arduino 端，即使网络断开也能独立运作。云端只负责下发配置参数和接收手动指令。

---

## 三、通信层

### 3.1 为什么选 MQTT 而不是 HTTP 轮询？

| 维度 | MQTT | HTTP 轮询 |
|------|------|-----------|
| 实时性 | 毫秒级推送 | 取决于轮询间隔（最少 1 秒） |
| 功耗/流量 | 极低（二进制协议） | 每次请求带完整 HTTP 头 |
| 双向通信 | 天然支持（发布/订阅） | 需 WebSocket 或长轮询 |
| Arduino 适配 | ESP8266 有成熟 MQTT 库 | 需手动构造 HTTP 请求 |
| 离线消息 | Broker 缓存 → 重连后补推 | 轮询间隔内数据丢失 |

### 3.2 MQTT Broker 选型

| Broker | 推荐度 | 说明 |
|--------|--------|------|
| **EMQX** | ★★★★★ | 开源、WebSocket 支持、自带 Dashboard、腾讯云有托管版 |
| Mosquitto | ★★★★ | 轻量、资源占用极低，适合自建 |
| 腾讯云 IoT Hub | ★★★★ | 免运维、微信生态打通、但需付费 |

### 3.3 小程序端的实时数据推送

小程序不能直接连 MQTT Broker，通过以下路径：

```
Arduino → MQTT Broker → Node.js 后端订阅 → WebSocket → 小程序
```

小程序用 `wx.connectSocket()` 连接后端 WebSocket，后端收到 MQTT 消息后实时转发。

```javascript
// 小程序端 WebSocket 连接（utils/socket.js）
let socket = null;
let reconnectTimer = null;

const connect = (deviceId) => {
  socket = wx.connectSocket({
    url: `wss://api.example.com/ws?device=${deviceId}`,
  });

  socket.onOpen(() => {
    console.log('WebSocket 已连接');
    clearTimeout(reconnectTimer);
  });

  socket.onMessage((res) => {
    const data = JSON.parse(res.data);
    // 派发事件给仪表盘页面
    getApp().globalData.eventBus.emit('sensor_update', data);
  });

  socket.onClose(() => {
    // 断线重连，间隔递增
    reconnectTimer = setTimeout(() => connect(deviceId), 3000);
  });
};

const close = () => {
  if (socket) socket.close();
  clearTimeout(reconnectTimer);
};

module.exports = { connect, close };
```

---

## 四、后端服务架构

### 4.1 技术栈

| 组件 | 选择 | 理由 |
|------|------|------|
| 运行时 | Node.js (Express) | 团队熟悉，MQTT + WebSocket 库成熟 |
| MQTT 客户端 | mqtt.js | Node.js 生态最成熟的 MQTT 库 |
| WebSocket | ws 库 | 轻量，配合 Express 使用 |
| 数据库 | SQLite → PostgreSQL | 快速起步，时序数据量大了再迁移 |
| 缓存 | Redis | 设备在线状态、最新的传感器值 |
| 部署 | 腾讯云轻量服务器 | 性价比高，微信网络延迟低 |

### 4.2 目录结构

```
server/
├── src/
│   ├── app.js                  # 应用入口
│   ├── config/
│   │   └── index.js            # 环境变量集中管理
│   ├── middleware/
│   │   ├── auth.js             # JWT 认证
│   │   └── errorHandler.js     # 全局错误处理
│   ├── modules/
│   │   ├── auth/               # 微信登录模块
│   │   │   ├── auth.controller.js
│   │   │   ├── auth.service.js
│   │   │   └── auth.routes.js
│   │   ├── device/             # 设备管理模块
│   │   │   ├── device.controller.js
│   │   │   ├── device.service.js
│   │   │   └── device.routes.js
│   │   ├── sensor/             # 传感器数据模块
│   │   │   ├── sensor.controller.js
│   │   │   ├── sensor.service.js
│   │   │   └── sensor.routes.js
│   │   ├── control/            # 远程控制模块
│   │   │   ├── control.controller.js
│   │   │   ├── control.service.js
│   │   │   └── control.routes.js
│   │   └── alert/              # 告警模块
│   │       ├── alert.controller.js
│   │       ├── alert.service.js
│   │       └── alert.routes.js
│   ├── services/
│   │   ├── mqtt.js             # MQTT 客户端初始化 & 消息监听
│   │   ├── websocket.js        # WebSocket 服务
│   │   └── scheduler.js        # 定时任务（数据清理、健康检查）
│   └── database/
│       ├── index.js            # 数据库连接
│       └── migrations/         # 数据库迁移脚本
├── .env.example
├── package.json
└── ecosystem.config.js         # PM2 部署配置
```

### 4.3 MQTT 消息处理服务 (`services/mqtt.js`)

```javascript
const mqtt = require('mqtt');
const { saveSensorData } = require('../modules/sensor/sensor.service');
const { checkAndAlert } = require('../modules/alert/alert.service');

const client = mqtt.connect(process.env.MQTT_BROKER_URL, {
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
});

client.on('connect', () => {
  console.log('[MQTT] 已连接 Broker');

  // 订阅所有设备的上报 Topic
  client.subscribe('greenhouse/+/sensor');
  client.subscribe('greenhouse/+/status');

  console.log('[MQTT] 已订阅 greenhouse/+/sensor, greenhouse/+/status');
});

// 收到传感器数据
client.on('message', async (topic, payload) => {
  const parts = topic.split('/');
  const deviceId = parts[1];
  const type = parts[2];

  const data = JSON.parse(payload.toString());

  if (type === 'sensor') {
    // 1. 存入时序数据库
    await saveSensorData(deviceId, data);

    // 2. 更新 Redis 最新值（供仪表盘快速读取）
    await redis.hset(`device:${deviceId}:latest`, data);

    // 3. 检查是否触发告警
    await checkAndAlert(deviceId, data);

    // 4. 通过 WebSocket 推送给已连接的小程序
    broadcastToDeviceSubscribers(deviceId, {
      type: 'sensor_update',
      data: data,
    });
  }
});

// 下发配置到设备
const sendConfig = (deviceId, config) => {
  client.publish(
    `greenhouse/${deviceId}/config`,
    JSON.stringify(config),
    { qos: 1 }    // QoS 1：至少送达一次
  );
};

// 下发控制指令
const sendCommand = (deviceId, action) => {
  client.publish(
    `greenhouse/${deviceId}/command`,
    JSON.stringify({ action }),
    { qos: 1 }
  );
};

module.exports = { client, sendConfig, sendCommand };
```

### 4.4 API 设计

```
认证
─────────────────────────────────────────────
POST   /api/auth/login          微信登录（静默）

设备管理
─────────────────────────────────────────────
POST   /api/devices/bind        用户绑定设备（输入设备ID）
GET    /api/devices             获取用户已绑定的设备列表
GET    /api/devices/:id         设备详情 + 最新传感器值

传感器数据
─────────────────────────────────────────────
GET    /api/sensors/latest?deviceId=xxx    获取最新一条传感器数据
GET    /api/sensors/history?deviceId=xxx   历史数据（支持时间范围 + 聚合）
       ?start=1716890000&end=1716900000
       &interval=5m     (聚合粒度: 1m/5m/1h/1d)

参数设置
─────────────────────────────────────────────
GET    /api/config/:deviceId              获取设备当前配置参数
PUT    /api/config/:deviceId              更新配置参数并下发到设备
       Body: { humidityMin, phMin, phMax, lightMin }

远程控制
─────────────────────────────────────────────
POST   /api/control/pump      手动控制水泵 { deviceId, action: "on"|"off" }
POST   /api/control/lamp      手动控制补光灯 { deviceId, action: "on"|"off" }

告警
─────────────────────────────────────────────
GET    /api/alerts?deviceId=xxx           获取告警历史

用户
─────────────────────────────────────────────
GET    /api/auth/me                       获取当前用户信息
```

### 4.5 数据库设计

```sql
-- ========== 用户表 ==========
CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  openid      TEXT UNIQUE NOT NULL,
  nickname    TEXT,
  avatar_url  TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ========== 设备表 ==========
CREATE TABLE devices (
  id          TEXT PRIMARY KEY,           -- 设备唯一 ID（激活码）
  name        TEXT DEFAULT '我的温室',     -- 设备名称
  user_id     TEXT NOT NULL,             -- 绑定用户
  is_online   INTEGER DEFAULT 0,         -- 是否在线（由心跳维护）
  last_seen   DATETIME,                  -- 最后在线时间
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ========== 设备配置参数（云端存储最新一份，下发用） ==========
CREATE TABLE device_configs (
  device_id         TEXT PRIMARY KEY,
  humidity_min      REAL DEFAULT 40.0,    -- 湿度下限 (%)
  ph_min            REAL DEFAULT 6.0,     -- pH 下限
  ph_max            REAL DEFAULT 7.5,     -- pH 上限
  light_min         REAL DEFAULT 500.0,   -- 光照下限 (lux)
  report_interval   INTEGER DEFAULT 5,    -- 上报间隔（秒）
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

-- ========== 传感器时序数据（核心表，数据量最大） ==========
CREATE TABLE sensor_data (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id   TEXT NOT NULL,
  temperature REAL,                       -- 温度 (°C)
  humidity    REAL,                       -- 空气湿度 (%)
  soil_ph     REAL,                       -- 土壤 pH
  water_level REAL,                       -- 水位 (%)
  light       REAL,                       -- 光照 (lux)
  pump_state  INTEGER DEFAULT 0,          -- 水泵状态
  lamp_state  INTEGER DEFAULT 0,          -- 补光灯状态
  recorded_at DATETIME NOT NULL,          -- 传感器时间戳
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE INDEX idx_sensor_device_time ON sensor_data(device_id, recorded_at);

-- ========== 控制指令日志 ==========
CREATE TABLE control_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id   TEXT NOT NULL,
  action      TEXT NOT NULL,              -- pump_on / pump_off / lamp_on / lamp_off
  source      TEXT DEFAULT 'manual',      -- manual / auto / schedule
  result      TEXT,                       -- success / failed
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

-- ========== 告警记录 ==========
CREATE TABLE alerts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id   TEXT NOT NULL,
  type        TEXT NOT NULL,              -- ph_low / ph_high / water_low / offline
  level       TEXT DEFAULT 'warning',     -- warning / critical
  message     TEXT,
  resolved    INTEGER DEFAULT 0,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (device_id) REFERENCES devices(id)
);
```

### 4.6 数据清理策略

传感器数据随时间积累量巨大，需要定期清理：

```javascript
// services/scheduler.js
// 每天凌晨 3 点执行

// 保留策略：
// - 5 秒粒度数据：保留最近 7 天
// - 1 分钟聚合数据：保留最近 30 天
// - 1 小时聚合数据：永久保留

const cleanupSensorData = async () => {
  const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
  // 先聚合到分钟表，再删除原始秒级数据
  await db.run(`
    INSERT INTO sensor_data_minute (device_id, temperature, humidity, soil_ph, water_level, light, recorded_at)
    SELECT device_id,
           AVG(temperature), AVG(humidity), AVG(soil_ph),
           AVG(water_level), AVG(light),
           strftime('%Y-%m-%d %H:%M:00', recorded_at)
    FROM sensor_data
    WHERE recorded_at < datetime('now', '-7 days')
      AND recorded_at NOT IN (SELECT recorded_at FROM sensor_data_minute)
    GROUP BY device_id, strftime('%Y-%m-%d %H:%M:00', recorded_at)
  `);

  await db.run(`DELETE FROM sensor_data WHERE recorded_at < datetime('now', '-7 days')`);
};
```

---

## 五、小程序前端架构

### 5.1 目录结构

```
miniprogram/
├── app.js                        # 入口：登录、WebSocket 初始化
├── app.json                      # 页面路由 + tabBar
├── app.wxss                      # 全局样式
├── project.config.json
├── sitemap.json
│
├── pages/                        # 主包页面
│   ├── index/                    # 设备列表（首页）
│   ├── bind/                     # 设备绑定
│   └── user/                     # 个人中心
│
├── subpackages/                  # 分包（设备相关功能）
│   └── device/
│       ├── dashboard/            # 实时仪表盘（核心页面）
│       │   ├── index.js
│       │   ├── index.json
│       │   ├── index.wxml
│       │   └── index.wxss
│       ├── settings/             # 参数设置页
│       │   ├── index.js
│       │   ├── index.json
│       │   ├── index.wxml
│       │   └── index.wxss
│       ├── history/              # 历史数据页
│       │   ├── index.js
│       │   ├── index.json
│       │   ├── index.wxml
│       │   └── index.wxss
│       └── alerts/               # 告警列表页
│           ├── index.js
│           ├── index.json
│           ├── index.wxml
│           └── index.wxss
│
├── components/                   # 通用组件
│   ├── sensor-card/              # 单个传感器卡片（温度/湿度/pH等）
│   ├── gauge-chart/              # 仪表盘图表（canvas）
│   ├── line-chart/               # 历史折线图（canvas）
│   ├── device-card/              # 设备列表卡片
│   ├── switch-control/           # 手动开关按钮
│   └── alert-badge/              # 告警角标
│
├── utils/
│   ├── request.js                # HTTP 请求封装
│   ├── auth.js                   # 微信登录
│   ├── socket.js                 # WebSocket 连接管理
│   └── util.js                   # 工具函数
│
├── services/
│   ├── device.js                 # 设备相关 API
│   ├── sensor.js                 # 传感器数据 API
│   ├── control.js                # 远程控制 API
│   └── config.js                 # 参数配置 API
│
└── config/
    └── env.js                    # 环境变量
```

### 5.2 页面设计

#### 5.2.1 实时仪表盘（核心页面）

```
+----------------------------------------------+
|        我的温室 · 在线 🟢                      |
+----------------------------------------------+
|  +------------------+  +------------------+  |
|  |  🌡 温度          |  |  💧 空气湿度      |  |
|  |    25.3 °C       |  |     62 %         |  |
|  |  ▁▂▃▄▅▆▇ 正常    |  |  ▁▂▃▄▅▆▇ 正常    |  |
|  +------------------+  +------------------+  |
|                                              |
|  +------------------+  +------------------+  |
|  |  🧪 土壤 pH       |  |  💦 水位          |  |
|  |     6.8          |  |     75 %         |  |
|  |  ▁▂▃▄▅▆▇ 正常    |  |  ▁▂▃▄▅▆▇ 充足    |  |
|  +------------------+  +------------------+  |
|                                              |
|  +------------------+  +------------------+  |
|  |  ☀ 光照           |  |  ⚡ 设备状态      |  |
|  |    1200 lux      |  |  水泵 🔴 · 灯 🟢  |  |
|  |  ▁▂▃▄▅▆▇ 充足    |  |                  |  |
|  +------------------+  +------------------+  |
|                                              |
|  [ 查看历史数据 ]          [ 参数设置 ]       |
+----------------------------------------------+
```

#### 5.2.2 参数设置页

```
+----------------------------------------------+
|        参数设置                                |
+----------------------------------------------+
|  自动灌溉                                     |
|  土壤湿度低于  [  40  ] %  时开启灌溉          |
|  ──────●──────────────────── 40%              |
|                                              |
|  土壤 pH 范围                                 |
|  最小值 [  6.0  ]   最大值 [  7.5  ]          |
|  ──────●────────●───────────                  |
|                                              |
|  自动补光                                     |
|  光照低于    [  500  ] lux  时开启补光         |
|  ────●────────────────────── 500 lux         |
|                                              |
|  数据上报间隔                                 |
|  [  5  ] 秒                                  |
|                                              |
|  [ 保存并下发到设备 ]                          |
+----------------------------------------------+
```

#### 5.2.3 历史数据页

```
+----------------------------------------------+
|  历史数据             日 · 周 · 月 · 自定义    |
+----------------------------------------------+
|  温度趋势                                     |
|  ┊                                        ┊  |
|  ┊      ╱╲                                ┊  |
|  ┊     ╱  ╲    ╱╲                         ┊  |
|  ┊    ╱    ╲  ╱  ╲                        ┊  |
|  ┊   ╱      ╲╱    ╲╲╲                     ┊  |
|  ┊─────────────────────────────────────  ┊  |
|  2026-05-28                            现在  |
|                                              |
|  统计摘要                                     |
|  +--------+--------+--------+--------+       |
|  | 平均   | 最高   | 最低   | 当前   |       |
|  | 24.8°  | 30.2°  | 19.1°  | 25.3°  |       |
|  +--------+--------+--------+--------+       |
+----------------------------------------------+
```

### 5.3 仪表盘页面核心逻辑

```javascript
// subpackages/device/dashboard/index.js
const { connectSocket, closeSocket } = require('../../../utils/socket');
const { getLatestSensor, getDeviceConfig } = require('../../../services/sensor');

Page({
  data: {
    deviceId: '',
    deviceName: '',
    isOnline: false,
    sensorData: {
      temperature: '--',
      humidity: '--',
      soilPH: '--',
      waterLevel: '--',
      light: '--',
    },
    pumpState: false,
    lampState: false,
    lastUpdate: '',
  },

  onLoad(options) {
    const deviceId = options.deviceId;
    this.setData({ deviceId });

    // 1. 先拉取最新值（覆盖 WebSocket 连接前的空白）
    this.loadLatestData(deviceId);

    // 2. 建立 WebSocket，实时更新
    connectSocket(deviceId);

    // 3. 监听 WebSocket 推送
    getApp().globalData.eventBus.on('sensor_update', (data) => {
      this.setData({
        sensorData: {
          temperature: data.temp?.toFixed(1) ?? '--',
          humidity: data.humidity?.toFixed(0) ?? '--',
          soilPH: data.soilPH?.toFixed(1) ?? '--',
          waterLevel: data.waterLevel?.toFixed(0) ?? '--',
          light: data.light?.toFixed(0) ?? '--',
        },
        pumpState: data.pumpState,
        lampState: data.lampState,
        lastUpdate: this.formatTime(new Date()),
      });
    });
  },

  onUnload() {
    closeSocket();
    getApp().globalData.eventBus.off('sensor_update');
  },

  async loadLatestData(deviceId) {
    try {
      const data = await getLatestSensor(deviceId);
      const config = await getDeviceConfig(deviceId);
      this.setData({
        sensorData: { /* ...格式同上面 */ },
        config: config,
      });
    } catch (err) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  // 手动控制水泵
  async togglePump() {
    const action = this.data.pumpState ? 'off' : 'on';
    try {
      await require('../../../services/control').controlPump(this.data.deviceId, action);
      wx.showToast({ title: action === 'on' ? '水泵已开启' : '水泵已关闭', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: '控制失败', icon: 'none' });
    }
  },
});
```

### 5.4 app.json 分包配置

```json
{
  "pages": [
    "pages/index/index",
    "pages/bind/bind",
    "pages/user/user"
  ],
  "subpackages": [
    {
      "root": "subpackages/device",
      "pages": [
        "dashboard/index",
        "settings/index",
        "history/index",
        "alerts/index"
      ]
    }
  ],
  "preloadRule": {
    "pages/index/index": {
      "network": "all",
      "packages": ["subpackages/device"]
    }
  },
  "tabBar": {
    "list": [
      { "pagePath": "pages/index/index", "text": "设备", "iconPath": "..." },
      { "pagePath": "pages/user/user",  "text": "我的", "iconPath": "..." }
    ]
  }
}
```

---

## 六、Mermaid 架构总图

为了更直观理解数据流动，这里用 Mermaid 描述的完整链路：

```
用户打开小程序
      │
      ▼
[微信静默登录] ──→ 后端签发 JWT
      │
      ▼
[设备列表页] ──→ GET /api/devices
      │
      ├─ 无设备 ──→ [绑定设备页] ──→ 输入设备激活码 ──→ POST /api/devices/bind
      │
      └─ 有设备 ──→ [点击设备卡片]
                        │
                        ▼
                  [实时仪表盘]
                        │
            ┌───────────┼───────────┐
            │           │           │
            ▼           ▼           ▼
      WebSocket    GET /sensors    [控制面板]
      实时推送      /latest        手动开关
            │           │           │
            │           │           ▼
            │           │    POST /control/pump
            │           │    POST /control/lamp
            │           │           │
            └───────────┴───────────┘
                        │
                        ▼
              [Node.js 后端]
                        │
              ┌─────────┼─────────┐
              │         │         │
              ▼         ▼         ▼
           MQTT Sub  Redis     SQLite
           (接收数据) (最新值)  (历史数据)
              │
              ▼
          [MQTT Broker]
              │
              ▼
    [Arduino + ESP8266]
              │
    ┌─────────┼─────────┐
    │         │         │
    ▼         ▼         ▼
  传感器    自动控制   执行器
  (采集)   (逻辑判断)  (水泵/补光灯)
```

---

## 七、数据流关键时序

### 7.1 传感器数据上报（常态，每 5 秒）

```
Arduino  ──MQTT──→  MQTT Broker  ──→  Node.js
                                          │
                               ┌──────────┼──────────┐
                               ▼          ▼          ▼
                          写 SQLite   更新 Redis    WebSocket
                          (历史数据)  (最新快照)   推送到小程序
                                                      │
                                                      ▼
                                                 仪表盘刷新
```

### 7.2 用户修改参数并下发

```
小程序 ──PUT /config──→  Node.js
                            │
                  ┌─────────┼─────────┐
                  ▼                   ▼
             写 SQLite          MQTT Publish
             (持久化配置)       greenhouse/{id}/config
                                    │
                                    ▼
                              Arduino 收到
                                    │
                                    ▼
                            更新本地设定值
                            (灌溉/光照阈值)
```

### 7.3 告警触发流程

```
Node.js 收到传感器数据
        │
        ▼
  checkAndAlert(deviceId, data)
        │
        ├─ pH < phMin ──→ 写 alerts 表 ──→ WebSocket 推送告警
        ├─ pH > phMax ──→ 写 alerts 表 ──→ WebSocket 推送告警
        ├─ waterLevel < 20% ──→ critical ──→ 推送告警
        └─ 设备离线 > 5min ──→ offline 告警
```

---

## 八、上线路线图

```
Phase 1 — MVP（第 1-2 周）
├── Arduino 固件：传感器读取 + MQTT 上报 + 自动控制
├── Node.js 后端骨架：Express + MQTT + WebSocket + SQLite
├── 小程序：微信登录 + 设备绑定 + 实时仪表盘
├── 小程序：手动控制（水泵/补光灯开关）
└── 端到端联调：Arduino → 云 → 小程序，数据通路跑通

Phase 2 — 完善（第 3-4 周）
├── 小程序：历史数据折线图 + 统计摘要
├── 小程序：参数设置页（阈值滑块 + 下发）
├── 告警系统：pH/水位/离线检测 + 小程序角标
├── 订阅消息：设备告警推送到微信服务通知
└── 提交审核

Phase 3 — 打磨（第 5-6 周）
├── 数据清理策略（时序数据自动归档）
├── 设备分享（家庭多个成员同时查看）
├── 定时任务（比如每天早上 8 点自动灌溉）
├── 性能优化（Redis 缓存热点数据）
└── 小程序审核通过后的线上监控
```

---

## 九、技术注意清单

### 小程序审核重点
```
✅ 服务类目选择「工具 > 智能家居」或「物联网」
✅ 隐私协议需声明收集传感器数据
✅ WebSocket 域名为 wss:// 且已加入白名单
✅ MQTT Broker 需配置 TLS（生产环境）
✅ 设备激活码使用一次性或限时有效，防止恶意绑定
```

### 性能要点
```
✅ 传感器时序表按天分区（SQLite 无法分区则按时段定期清理）
✅ 仪表盘数据优先从 Redis 读取，DB 只做历史查询
✅ WebSocket 断线自动重连，间隔递增（3s → 6s → 12s → 30s）
✅ 小程序 setData 每次只更新变化的字段，不整体覆盖
✅ 历史数据查询用聚合（AVG），不分页返回几千条原始数据
```

### 安全要点
```
✅ MQTT 连接必须用户名+密码认证
✅ 不同设备的 MQTT Topic 通过 deviceId 隔离
✅ 后端验证设备归属权：用户只能操作自己绑定的设备
✅ 手动控制指令加入频率限制（防误触，5 秒内不可重复）
✅ openid 不在小程序端或 Arduino 端出现，仅后端持有
```

### Arduino 端注意事项
```
✅ 自动控制逻辑必须有「滞后区间」，防止水泵频繁启停
   （湿度低于 40% 开启，高于 45% 关闭，而不是 40% 开关）
✅ MQTT 断线时，自动控制不受影响，设备独立运行
✅ 看门狗定时器：防止固件跑飞导致水泵常开（淹死植物）
✅ EEPROM 存储最后一次收到的配置参数，断电重启不丢失
```

---

## 十、总结

这套架构的核心设计理念：

| 原则 | 体现 |
|------|------|
| **设备自治** | 自动控制跑在 Arduino 端，断网照样运作 |
| **云端增强** | 云端提供历史数据、告警、远程手动干预 |
| **实时可见** | WebSocket + Redis 保证仪表盘数据秒级刷新 |
| **简单可靠** | MQTT 协议轻量稳定，QoS 1 保证指令送达 |
| **快速迭代** | 原生小程序 + SQLite 起步，不引入重型基础设施 |

下一步可以深入任何一个层面：Arduino 固件完整代码、后端 Express 脚手架搭建、小程序仪表盘页面实现，或者整套的端到端联调方案。你想先从哪个开始？