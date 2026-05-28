// ============================================================
// 简易事件总线 — 页面间解耦通信
// ============================================================
class EventBus {
  constructor() {
    this.events = {};
  }

  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
  }

  off(event, callback) {
    if (!this.events[event]) return;
    if (callback) {
      this.events[event] = this.events[event].filter((cb) => cb !== callback);
    } else {
      delete this.events[event];
    }
  }

  emit(event, data) {
    if (!this.events[event]) return;
    this.events[event].forEach((cb) => {
      try {
        cb(data);
      } catch (e) {
        console.error(`[EventBus] ${event} 回调异常`, e);
      }
    });
  }

  once(event, callback) {
    const wrapper = (data) => {
      callback(data);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }
}

module.exports = { EventBus };
