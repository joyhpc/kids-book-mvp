/**
 * 自动生成的 TypeScript 类型定义，用于开发期的类型提示 (JSDoc / TS Check)
 * 对应 Python 构建端的 Pydantic 数据契约 (tools/schema.py)
 */

export interface Meta {
  title: string;
  version: string;
  language: string[];
  target_age: string;
  scene_id?: string;
  book_id?: string;
}

export interface Position {
  x: string;
  y: string;
}

export interface CharacterState {
  filter: string;
  animation: string;
  label_zh?: string;
}

export interface Character {
  id: string;
  img_src: string;
  label?: string;
  position: Position;
  width: string;
  height: string;
  states?: Record<string, CharacterState>;
  initial_state?: string;
}

export interface Item {
  id: string;
  img_src: string;
  label?: string;
  position: Position;
  width: string;
  height: string;
  draggable: boolean;
  animation?: string;
}

export interface Background {
  type: string;
  gradient?: string;
  src?: string;
  particles: boolean;
  value?: string;
}

export interface Scene {
  id: string;
  background: Background;
  characters: Character[];
  items: Item[];
}

export interface InteractionAction {
  type: string;
  target?: string;
  to_state?: string;
  animation?: string;
  dialogue_id?: string;
  emoji?: string;
  count?: number;
  duration_ms?: number;
}

export interface InteractionOnSuccess {
  actions: InteractionAction[];
}

export interface InteractionOnFail {
  action: string;
  duration_ms: number;
  easing: string;
}

export interface Interaction {
  type: string;
  draggable_id: string;
  target_id: string;
  hit_tolerance: number;
  on_fail: InteractionOnFail;
  on_success: InteractionOnSuccess;
}

export interface WordTiming {
  word: string;
  start_time: number;
  end_time: number;
}

export interface Dialogue {
  id: string;
  text_en: string;
  text_zh: string;
  text_original?: string;
  audio?: string;
  words: WordTiming[];
  auto_play: boolean;
  display_on?: string;
}

export interface Ending {
  delay_after_success_ms: number;
  title_en: string;
  title_zh: string;
  subtitle_zh: string;
  button_text: string;
  particles_emoji: string;
  auto_advance: boolean;
}

export interface SubtitlePanel {
  position: string;
  height: string;
  padding: string;
  font_size: string;
  highlight_color: string;
  highlight_scale: number;
  normal_color: string;
  bg_color: string;
  border_radius: string;
}

export interface Hint {
  text_en: string;
  text_zh: string;
  show_after_ms: number;
  position: string;
  font_size: string;
}

export interface UI {
  subtitle_panel: SubtitlePanel;
  hint?: Hint;
}

export interface SceneConfig {
  meta: Meta;
  scene: Scene;
  interaction?: Interaction;
  dialogues: Record<string, Dialogue>;
  ending?: Ending;
  ui: UI;
}

export interface BookScene {
  id: string;
  title_zh: string;
  title_en: string;
  data_url: string;
  thumbnail?: string;
}

export interface NavRule {
  next?: string;
  unlock_condition?: string;
}

export interface BookNavigation {
  type: string;
  show_progress: boolean;
  allow_skip: boolean;
  transition: string;
}

export interface BookUIConfig {
  theme: string;
  font_family: string;
}

export interface BookConfigData {
  navigation: BookNavigation;
  ui: BookUIConfig;
}

export interface BookConfig {
  meta: Meta;
  config: BookConfigData;
  scenes: BookScene[];
  navigation_rules: Record<string, NavRule>;
}
