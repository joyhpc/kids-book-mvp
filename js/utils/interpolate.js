/** 未设置变量时的默认值（便于演示） */
const DEFAULTS = { playerName: '小读者' };

/**
 * [Tale-js 微 DSL] 变量插值
 * - {{varName}} → variables[varName]，缺省用 DEFAULTS 或空
 * - {{varName|默认值}} → 带默认值
 */
export function interpolate(text, variables = {}) {
  if (typeof text !== 'string') return text;
  return text.replace(/\{\{([a-zA-Z0-9_]+)(?:\|([^}]*))?\}\}/g, (_, key, fallback) => {
    const val = variables[key];
    if (val !== undefined && val !== null) return String(val);
    return (fallback !== undefined ? fallback : DEFAULTS[key]) ?? '';
  });
}
