// ============================================================
// 设备列表卡片组件
// 属性：device
// ============================================================
Component({
  properties: {
    device: {
      type: Object,
      value: {},
    },
  },

  computed: {},

  data: {
    onlineClass: '',
  },

  observers: {
    'device.is_online'(online) {
      this.setData({
        onlineClass: online ? 'online' : 'offline',
      });
    },
  },
});
