class EventBus extends EventTarget {
  emit(name, detail = {}) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }
  on(name, callback) {
    this.addEventListener(name, (e) => callback(e.detail));
  }
}
export const bus = new EventBus();
