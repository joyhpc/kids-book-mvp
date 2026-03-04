from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

# ==========================================
# AIGC 设定集 (Lorebook) 契约: 用于保证绘本图像一致性
# ==========================================
class LorebookLocation(BaseModel):
    id: str
    name: str
    visual_prompt: str
    lighting: str = "natural"

class LorebookCharacter(BaseModel):
    id: str
    name: str
    visual_prompt: str

class Lorebook(BaseModel):
    locations: Dict[str, LorebookLocation] = {}
    characters: Dict[str, LorebookCharacter] = {}

class Meta(BaseModel):
    title: str
    version: str = "4.0.0"
    language: List[str] = ["en", "zh"]
    target_age: str = "4-8"
    scene_id: Optional[str] = None
    book_id: Optional[str] = None

class Position(BaseModel):
    x: str
    y: str

class CharacterState(BaseModel):
    filter: str = ""
    animation: str = "none"
    label_zh: Optional[str] = None

class Character(BaseModel):
    id: str
    img_src: Optional[str] = None
    emoji: Optional[str] = None
    label: Optional[str] = None
    position: Position
    width: str = "100px"
    height: str = "100px"
    states: Optional[Dict[str, CharacterState]] = None
    initial_state: Optional[str] = None

class Item(BaseModel):
    id: str
    img_src: Optional[str] = None
    emoji: Optional[str] = None
    label: Optional[str] = None
    position: Position
    width: str = "65px"
    height: str = "65px"
    draggable: bool = False
    animation: Optional[str] = None

class Background(BaseModel):
    type: str = "canvas"
    gradient: Optional[str] = None
    src: Optional[str] = None
    particles: bool = True
    value: Optional[str] = None

class Scene(BaseModel):
    id: str
    background: Background
    characters: List[Character] = Field(default_factory=list)
    items: List[Item] = Field(default_factory=list)

class InteractionAction(BaseModel):
    type: str
    target: Optional[str] = None
    to_state: Optional[str] = None
    animation: Optional[str] = None
    dialogue_id: Optional[str] = None
    emoji: Optional[str] = None
    count: Optional[int] = None
    duration_ms: Optional[int] = None

    class Config:
        extra = "ignore"

class InteractionOnSuccess(BaseModel):
    actions: List[InteractionAction] = Field(default_factory=list)

class InteractionOnFail(BaseModel):
    action: str = "spring_back"
    duration_ms: int = 400
    easing: str = "cubic-bezier(0.34, 1.56, 0.64, 1)"

class Interaction(BaseModel):
    type: str = "drag_and_drop"
    draggable_id: str
    target_id: str
    hit_tolerance: int = 60
    on_fail: InteractionOnFail = Field(default_factory=InteractionOnFail)
    on_success: InteractionOnSuccess = Field(default_factory=InteractionOnSuccess)

class WordTiming(BaseModel):
    word: str
    start_time: float
    end_time: float

class Dialogue(BaseModel):
    id: str
    text_en: str = ""
    text_zh: str = ""
    text_original: Optional[str] = None
    audio: Optional[str] = None
    words: List[WordTiming] = Field(default_factory=list)
    auto_play: bool = True
    display_on: Optional[str] = None

class Ending(BaseModel):
    delay_after_success_ms: int = 4000
    title_en: str = ""
    title_zh: str = ""
    subtitle_zh: str = ""
    button_text: str = "再读一遍"
    particles_emoji: str = "✨"
    auto_advance: bool = False

class SubtitlePanel(BaseModel):
    position: str = "top"
    height: str = "auto"
    padding: str = "1.2rem"
    font_size: str = "1.75rem"
    highlight_color: str = "#d4af37"
    highlight_scale: float = 1.15
    normal_color: str = "#FFFFFF"
    bg_color: str = "rgba(5,8,15,0.7)"
    border_radius: str = "16px"

class Hint(BaseModel):
    text_en: str = ""
    text_zh: str = ""
    show_after_ms: int = 2500
    position: str = "bottom"
    font_size: str = "1.05rem"

class UI(BaseModel):
    subtitle_panel: SubtitlePanel = Field(default_factory=SubtitlePanel)
    hint: Optional[Hint] = None

class SceneConfig(BaseModel):
    meta: Meta
    
    # ---------------- AIGC 状态机 ----------------
    location_id: Optional[str] = None
    time_of_day: Optional[str] = "day"
    action_prompt: Optional[str] = None
    # Pipeline Pass 1 将会计算并填充这三个字段，用于传递给 Stable Diffusion
    resolved_bg_prompt: Optional[str] = None
    resolved_char_prompts: Optional[Dict[str, str]] = None
    resolved_full_prompt: Optional[str] = None
    # ---------------------------------------------
    
    scene: Scene
    interaction: Optional[Interaction] = None
    dialogues: Dict[str, Dialogue] = Field(default_factory=dict)
    ending: Optional[Ending] = None
    ui: UI = Field(default_factory=UI)

class BookNavigation(BaseModel):
    type: str = "linear"
    show_progress: bool = True
    allow_skip: bool = False
    transition: str = "fade"

class BookUIConfig(BaseModel):
    theme: str = "night_sky"
    font_family: str = "Nunito"

class BookConfigData(BaseModel):
    navigation: BookNavigation = Field(default_factory=BookNavigation)
    ui: BookUIConfig = Field(default_factory=BookUIConfig)
    lorebook: Optional[Lorebook] = None

class BookScene(BaseModel):
    id: str
    title_zh: str
    title_en: str
    data_url: str
    thumbnail: Optional[str] = None

class NavRule(BaseModel):
    next: Optional[str] = None
    unlock_condition: Optional[str] = None

class BookConfig(BaseModel):
    meta: Meta
    config: BookConfigData = Field(default_factory=BookConfigData)
    scenes: List[BookScene]
    navigation_rules: Dict[str, NavRule]

