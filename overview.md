# 温室 IoT 远程监控系统 — 项目框架搭建完成

## 概览

根据 `architecture.md` 中的四层 IoT 架构设计，已完成全部项目文件的编写。

| 项目 | 文件数 | 路径 |
|------|--------|------|
| 微信小程序前端 | 56 个文件 | `miniprogram/` |
| Node.js 后端服务 | 17 个文件 | `server/` |
| 架构设计文档 | 1 个 | `architecture.md` |
| **合计** | **73 个文件** | |

## 前端结构 (miniprogram/)

```
miniprogram/
├── app.js / app.json / app.wxss     # 入口：EventBus + 分包 + CSS变量
├── config/env.js                    # 三环境切换 (dev/staging/prod)
├── utils/                           # request | auth | socket | eventBus | util
├── services/                        # device | sensor | control | config
├── pages/                           # index(设备列表) | bind(绑定) | user(个人)
├── subpackages/device/              # dashboard | settings | history | alerts
└── components/                      # sensor-card | device-card | switch-control | alert-badge
```

## 后端结构 (server/)

```
server/
├── package.json / .env.example
└── src/
    ├── app.js                       # Express + WS + MQTT 统一入口
    ├── config/index.js              # 环境变量集中管理
    ├── database/index.js            # SQLite 7表自动建表 (WAL模式)
    ├── middleware/                   # JWT认证 | 全局错误处理
    ├── services/                    # mqtt | websocket | scheduler
    └── modules/                     # auth | device | sensor | control | alert
```

## 启动步骤

1. **小程序**：微信开发者工具 → 导入 `miniprogram/` → 修改 `project.config.json` 中的 `appid`
2. **后端**：`cd server` → `cp .env.example .env` → 填 WX_APPID/WX_SECRET → `npm install` → `npm run dev`
3. **联调**：确保 `config/env.js` 中 `BASE_URL` 指向后端地址
