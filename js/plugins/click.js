/**
 * [Tale-js 微 DSL] 点击交互：点击指定物品触发 on_click.actions
 */
import { BaseInteraction } from '../core/base-interaction.js';

export class ClickInteraction extends BaseInteraction {
  constructor(stageEl, config, bus) {
    super(stageEl, config, bus);
    this._onClick = this._onClick.bind(this);
  }

  mount() {
    super.mount();
    const targetId = this.config.target_id;
    const el = targetId ? document.getElementById(targetId) : null;
    if (el && this.config.on_click?.actions?.length) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', this._onClick);
      this._boundEl = el;
    }
  }

  unmount() {
    if (this._boundEl) {
      this._boundEl.removeEventListener('click', this._onClick);
      this._boundEl.style.cursor = '';
      this._boundEl = null;
    }
    super.unmount();
  }

  _onClick(e) {
    const actions = this.config.on_click.actions || [];
    this._runActions(actions, e.currentTarget, null);
  }
}
