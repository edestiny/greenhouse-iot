// ============================================================
// 告警列表页 — 查看设备告警记录
// 路径：subpackages/device/alerts/index.js
// 进入方式：设备仪表盘 → 点击"查看告警"
// ============================================================

// 引入请求封装（自动携带 token、统一错误处理）
const { request } = require('../../../utils/request');

// 引入时间格式化工具（相对时间：刚刚/X分钟前/X小时前）
const { formatTimeRelative } = require('../../../utils/util');

/**
 * 页面：告警列表
 * 功能：
 *   1. 从后端获取告警列表（/alerts API）
 *   2. 格式化告警时间和等级显示
 *   3. 支持下拉刷新
 *   4. 告警等级：critical（严重）→ 红色；warning（警告）→ 橙色
 */
Page({

  // ==================== 页面数据 ====================
  data: {
    alerts: [],           // 告警记录列表
    loading: true,        // 是否正在加载
    hasAlerts: false,     // 是否有告警记录（控制空状态显示）
  },

  // ==================== 生命周期 ====================
  /**
   * 页面加载 — 加载告警列表
   * 注意：onLoad 只执行一次，如需每次进入刷新请使用 onShow
   */
  onLoad() {
    this.loadAlerts();
  },

  // ==================== 数据加载 ====================
  /**
   * 从后端加载告警列表
   * 后端返回数据格式：
   * [
   *   {
   *     id: 1,
   *     device_id: 'xxx',
   *     type: 'temperature',   // 传感器类型
   *     level: 'critical',     // 告警等级：critical | warning
   *     message: '温度过高：38°C',
   *     created_at: 1716873600,  // Unix 时间戳（秒）
   *   },
   *   ...
   * ]
   */
  async loadAlerts() {
    try {
      // 调用后端 /alerts 接口获取告警列表
      const res = await request({ url: '/alerts' });

      // -------- 格式化告警数据 --------
      const alerts = (res.data || []).map((a) => ({
        ...a,  // 保留原始字段

        // 将 Unix 时间戳转为相对时间（如"3分钟前"）
        timeText: formatTimeRelative(a.created_at),

        // 告警等级中文映射
        levelText: a.level === 'critical' ? '严重' : '警告',

        // 告警等级 CSS 类名（对应 WXSS 中的样式）
        levelClass: a.level === 'critical' ? 'critical' : 'warning',
      }));

      // 更新页面数据
      this.setData({
        alerts,
        loading: false,
        hasAlerts: alerts.length > 0,  // 控制"暂无告警"空状态
      });

    } catch (err) {
      // 加载失败：打印日志，关闭 loading
      console.error('[Alerts] 加载失败', err);
      this.setData({ loading: false });
      // 不弹 Toast，留空列表让用户看到空状态
    }
  },

  // ==================== 下拉刷新 ====================
  /**
   * 下拉刷新触发
   * 需要在页面 JSON 配置中启用：{ "enablePullDownRefresh": true }
   * 数据加载完成后需调用 wx.stopPullDownRefresh()
   */
  async onPullDownRefresh() {
    await this.loadAlerts();
    wx.stopPullDownRefresh();  // 停止下拉刷新动画
  },
});
