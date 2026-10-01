// 全局共享常量

export const TYPE_LABELS = {
  cloze: '词句填空选择',
  grammar: '语法单选',
  word: '词形/拼写',
  reading: '阅读理解',
  translation: '句子翻译',
};

export const TYPES = Object.keys(TYPE_LABELS);

// 选择题选项字母（超出按 E/F 顺延）
export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

// 语法考点范围（可勾选）
export const GRAMMAR_POINTS = [
  '时态与语态',
  '非谓语动词',
  '定语从句',
  '名词性从句',
  '状语从句',
  '虚拟语气',
  '情态动词',
  '倒装与强调',
  '主谓一致',
  '比较结构',
  '介词/冠词/代词',
  'it 与 there be',
];

// 作文体裁 → 满分
export const ESSAY_GENRES = {
  '应用文': 15,
  '议论文': 25,
  '读后续写': 25,
  '概要写作': 25,
};

// 常用服务商的接口地址预设：只帮你填 API Base
// 模型名**不写死**——统一从接口的 /models 实时拉取，避免模型下架/改名后列表过期
export const API_PRESETS = [
  { name: 'DeepSeek 深度求索', base: 'https://api.deepseek.com/v1' },
  { name: '通义千问（阿里云百炼兼容模式）', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { name: 'Kimi（Moonshot）', base: 'https://api.moonshot.cn/v1' },
  { name: '智谱 GLM', base: 'https://open.bigmodel.cn/api/paas/v4' },
  { name: 'OpenAI', base: 'https://api.openai.com/v1' },
  { name: 'OpenRouter', base: 'https://openrouter.ai/api/v1' },
  { name: '硅基流动 SiliconFlow', base: 'https://api.siliconflow.cn/v1' },
  { name: '本地 Ollama', base: 'http://localhost:11434/v1' },
];

// 明显不是对话模型的（embedding / 语音 / 绘图 / 老补全模型），排序时沉到最后
export const NON_CHAT_MODEL_RE =
  /embed|whisper|tts|audio|dall-e|image|moderation|rerank|stable-diffusion|sdxl|flux|babbage|davinci|curie|vision-encoder|guard|ocr/i;
