// ============================================================
// 开关控制组件
// 属性：label, checked
// 事件：toggle
// ============================================================
Component({
  properties: {
    label: { type: String, value: '' },
    checked: { type: Boolean, value: false },
  },

  methods: {
    onToggle() {
      this.triggerEvent('toggle');
    },
  },
});
