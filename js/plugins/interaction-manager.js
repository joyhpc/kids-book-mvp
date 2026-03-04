import { bus } from 'core/bus.js';
import { store } from 'core/store.js';
import { DragDropInteraction } from './drag-drop.js';
import { ClickInteraction } from './click.js';

/**
 * 插件注册表: 新增玩法只需在这里加上类映射即可，无需修改核心
 */
const PluginRegistry = {
  'drag_and_drop': DragDropInteraction,
  'click': ClickInteraction
};

class InteractionManager {
  constructor() {
    this.activePlugins = [];
    this.stageEl = document.getElementById('stage');

    // 监听场景状态，当场景变动时切换插件生命周期
    bus.on('store:currentSceneData', (data) => {
      this._unmountAll();

      if (data && data.interaction && data.interaction.type) {
        const PluginClass = PluginRegistry[data.interaction.type];
        if (PluginClass) {
          const plugin = new PluginClass(this.stageEl, data.interaction, bus);
          plugin.mount();
          this.activePlugins.push(plugin);
        } else {
          console.warn(`未知的交互类型: ${data.interaction.type}`);
        }
      }
    });
  }

  _unmountAll() {
    this.activePlugins.forEach(p => {
      if (typeof p.unmount === 'function') {
        p.unmount();
      }
    });
    this.activePlugins = [];
  }
}

export const interactionManager = new InteractionManager();
