// ============================================================
// 传感器卡片组件
// 属性：title, value, unit, type, icon
// ============================================================
const { getSensorStatus } = require('../../utils/util');

Component({
  properties: {
    title: { type: String, value: '' },
    value: { type: String, value: '--' },
    unit: { type: String, value: '' },
    type: { type: String, value: '' },
    icon: { type: String, value: '' },
  },

  computed: {},

  observers: {
    'value, type'(value, type) {
      if (!type || !getSensorStatus[type]) return;
      const numVal = parseFloat(value);
      if (isNaN(numVal)) return;
      const status = getSensorStatus[type](numVal);
      this.setData({
        statusLabel: status.label,
        statusColor: status.color,
      });
    },
  },

  data: {
    statusLabel: '',
    statusColor: '#2ecc71',
  },
});
