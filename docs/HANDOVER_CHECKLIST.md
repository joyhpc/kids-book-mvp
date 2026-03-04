# 项目交接检查清单

> 供 Claude Code 或接棒开发者逐项核对的交接清单

---

## 一、环境与依赖

- [ ] **Node.js**：已安装（用于 `npm test`、E2E）
- [ ] **Python 3**：已安装（用于 `build_book.py`）
- [ ] **pip install -r requirements.txt**：pyyaml、pydantic（构建书籍必需）
- [ ] **pip install google-genai**（可选）：Gemini 生图
- [ ] **ElevenLabs API Key**（可选）：TTS 卡拉OK

---

## 二、本地可运行验证

- [ ] `npm test` 执行成功（构建 + 产出校验；⚠️ 会覆盖为小王子 chapter1）
- [ ] 若需美人鱼：`python tools/build_book.py book --config tools/little_mermaid_ood.yaml`
- [ ] `python -m http.server 8888` 启动无报错
- [ ] 打开 `http://localhost:8888/index.html` 能正常加载
- [ ] 能看到「魔法绘本加载中…」→ 深海场景
- [ ] 可翻页到「海面」「风暴」
- [ ] 字幕区显示中英双语
- [ ] 点击 🔊 可播放 TTS（如无音频则用浏览器 TTS）

---

## 三、关键文件存在性

- [ ] `index.html` 存在且为入口
- [ ] `data/book.json` 存在且 `scenes` 非空
- [ ] `data/scenes/scene_01.json`、`scene_02.json`、`scene_03.json` 存在
- [ ] `assets/scenes/scene_01_bg.jpg` 等背景图存在
- [ ] `js/engine.js`、`js/core/bus.js`、`js/core/store.js` 存在
- [ ] `tools/build_book.py`、`tools/schema.py` 存在

---

## 四、文档完整性

- [ ] `HANDOVER.md` — 主交接文档
- [ ] `docs/KNOWN_ISSUES.md` — 已知问题与坑点
- [ ] `PRODUCT_VISION.md` — 产品愿景
- [ ] `ENGINE_SYNC.md` — 引擎与数据映射
- [ ] `docs/DSL_VARS.md` — 变量与分支 DSL
- [ ] `docs/ARCHITECTURE.md` — 技术架构
- [ ] `docs/CLAUDE_CODE_QUICKSTART.md` — Claude Code 快速上手
- [ ] `README.md` — 项目说明

---

## 五、构建管线验证

- [ ] `python tools/build_book.py book --config tools/little_mermaid_ood.yaml` 可执行（美人鱼）
- [ ] `python tools/build_book.py book --config tools/chapter1_config.yaml` 可执行（小王子，与 npm test 一致）
- [ ] 产出 `data/book.json`、`data/scenes/scene_01.json` 等
- [ ] 无 Pydantic 校验错误

---

## 六、测试命令验证

- [ ] `npm run test:smoke`：需先起服，可正常执行（轻量 HTTP 校验）
- [ ] `npm run test:e2e`：需先起服，可正常执行（Puppeteer/Playwright）
- [ ] `npm run test:full`：全闭环可跑通（自动起服 + E2E）

---

## 七、已知限制（确认理解）

- [ ] ESM 必须通过 HTTP 访问，`file://` 会 CORS 失败
- [ ] OOD 管线为 Mock，无真实 GPU 推理
- [ ] `book.json` / `scene_XX.json` 的 `meta.version` 需为 `1.0.0` 或 `4.0.0`
- [ ] 进度存两处 localStorage（`storybook_progress` / `kids_book_progress`），存在不一致
- [ ] `npm test` 固定构建 chapter1，会覆盖当前书籍

---

## 八、交接完成标志

**全部打勾** 且满足以下任一条件即为交接完成：

1. 能独立完成：`npm test` → 起服 → 打开 `index.html` → 完整阅读 3 场景
2. 能根据 YAML 配置修改并重新构建一本新书
3. 能定位并理解 `bus`、`store`、`SceneLoader`、`InteractionManager` 的职责与调用关系
