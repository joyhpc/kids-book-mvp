/**
 * BaseInteraction: 所有互动插件的基类/接口约束。
 * - 核心要求: OCP (开闭原则)
 * - 引擎 `book.js` 不再直接调用 drag-drop 逻辑，而是遍历互动列表挂载。
 */

export class BaseInteraction {
  /**
   * @param {HTMLElement} stageEl 绑定的 DOM 舞台
   * @param {Object} config JSON 中 "interaction" 节点的配置项
   * @param {Object} bus 引擎的事件总线 (EventBus)
   */
  constructor(stageEl, config, bus) {
    this.stageEl = stageEl;
    this.config = config;
    this.bus = bus;
    this.isMounted = false;
  }

  /**
   * 挂载阶段：绑定 DOM 事件，初始化内部状态，硬件 API 调用等。
   */
  mount() {
    this.isMounted = true;
  }

  /**
   * 卸载阶段：物理销毁，必须清除所有挂载的 DOM EventListener 和 setTimeout 闭包！
   */
  unmount() {
    this.isMounted = false;
  }

  /**
   * 触发成功链（标准化的动作解析，每个插件都可以调用）
   */
  _triggerSuccess(sourceEl, targetEl) {
    if (!this.config || !this.config.on_success) return;
    const actions = this.config.on_success.actions || [];
    
    // E2E test flag
    window.__E2E_INTERACTION_SUCCESS = true;

    // 把 actions 发布出去，不同模块 (UI, Audio, Particles) 自行响应
    this.bus.emit('interaction:success', {
      sourceEl, 
      targetEl, 
      actions
    });

    // 为向下兼容：在此处直接发起副作用请求
    actions.forEach(action => {
      switch (action.type) {
        case 'hide_item':
          this._hideItem(action);
          break;
        case 'change_state':
          this._changeState(action);
          break;
        case 'play_dialogue':
          setTimeout(() => this.bus.emit('scene:switchDialogue', action.dialogue_id), 500);
          break;
        case 'show_particles':
          this.bus.emit('particles:burst', { action, targetEl });
          break;
        case 'set_var':
          // [Tale-js 微 DSL] 执行全局变量修改
          import('./store.js').then(({ store }) => {
            store.variables = { ...store.variables, [action.var_key]: action.var_value };
            console.log(`[微 DSL] 变量突变: ${action.var_key} = ${action.var_value}`);
          });
          break;
      }
    });
  }

  // ==== 以下为兼容原有动作类型的辅助方法，抽到基类供所有插件复用 ====

  _hideItem(action) {
    const el = document.getElementById(action.target);
    if (!el) return;
    if (action.animation) el.classList.add('anim-' + action.animation);
    setTimeout(() => { el.style.display = 'none'; }, 600);
  }

  _changeState(action) {
    const el = document.getElementById(action.target);
    if (!el) return;
    let states;
    try { states = JSON.parse(el.dataset.states); } catch { return; }

    const newState = states[action.to_state];
    if (!newState) return;

    el.className = el.className.replace(/anim-[\w-]+/g, '').trim();
    el.classList.add('scene-character');

    el.style.filter = newState.filter;
    if (newState.animation) el.classList.add('anim-' + newState.animation);
  }
}
