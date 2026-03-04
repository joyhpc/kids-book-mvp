# 微 DSL：变量系统（Tale-js 借鉴）

本分支在 `feature/tale-dsl-draft` 上实现了一套轻量变量插值与状态系统。

## 1. 变量插值 `{{varName}}` / `{{varName|默认}}`

在 `dialogues`、`ui.hint`、`ending.subtitle_zh` 等文本中可使用占位符：

```json
"text_zh": "{{playerName}}，我想去看看上面的世界。"
"text_zh": "你好，{{name|小读者}}！"
```
- 无 `|` 时，未设置则用 DEFAULTS 或空
- `{{key|默认}}` 显式指定默认值

## 2. 配置项（book.json config）

| 配置 | 说明 |
|------|------|
| `initial_vars` | 启动时合并到 store.variables 的初始值 |
| `prompt_player_name` | 为 true 且无 playerName 时，弹窗提示输入 |

## 3. 点击交互 `type: "click"`

```json
"interaction": {
  "type": "click",
  "target_id": "magic_pearl",
  "on_click": {
    "actions": [
      { "type": "set_var", "var_key": "found_pearl", "var_value": true },
      { "type": "play_dialogue", "dialogue_id": "found_pearl" },
      { "type": "hide_item", "target": "magic_pearl", "animation": "pop-vanish" }
    ]
  }
}
```

## 4. 条件分支（navigation_rules.branches）

```json
"scene_01": {
  "branches": [
    { "condition": "found_pearl == true", "next": "scene_02_secret" },
    { "condition": "default", "next": "scene_02" }
  ]
}
```

## 5. API

```js
import { getVar, setVar } from 'core/store.js';
setVar('playerName', '小明');
getVar('playerName');  // '小明'
```

## 6. scene_01 演示

- 开场提示输入名字 → `{{playerName}}` 插值
- 点击右上角 🦪 珍珠 → set_var + 切换 found_pearl 对话 + 隐藏物品
