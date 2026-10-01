// 演示模式数据：无 Key / 无网络也能体验完整流程

export const DEMO_QUIZ = {
  materials: [
    {
      kind: 'passage',
      title: 'English grammar (节选)',
      source: 'Wikipedia (CC BY-SA)',
      url: 'https://en.wikipedia.org/wiki/English_grammar',
      snippet: 'English grammar is the way in which meanings are encoded into wordings in the English language...',
    },
  ],
  questions: [
    {
      id: 'd1', type: 'grammar',
      stem: 'By the time you arrive tomorrow, I ______ the report.',
      passage: '', options: ['will finish', 'will have finished', 'have finished', 'finished'],
      answer: 'B',
      explain: 'by the time + 将来时间，主句用将来完成时 will have done。',
      hint: '注意时间状语 by the time + 一般现在时表将来。',
      vocab: ['arrive', 'report'],
    },
    {
      id: 'd2', type: 'cloze',
      stem: 'She is looking forward to ______ from you soon.',
      passage: '', options: ['hear', 'hearing', 'be heard', 'have heard'],
      answer: 'B',
      explain: 'look forward to 中 to 是介词，后接动名词 hearing。',
      hint: '想想 to 是介词还是不定式标志。',
      vocab: ['look forward to'],
    },
    {
      id: 'd3', type: 'word',
      stem: '根据句意与首字母提示补全单词：He made a quick d______ and jumped into the river.',
      passage: '', options: [], answer: 'decision',
      explain: 'make a decision 固定搭配，意为"做决定"。',
      hint: 'make a d... 想一想哪个名词表示"决定"。',
      vocab: ['decision'],
    },
    {
      id: 'd4', type: 'translation',
      stem: '翻译句子：无论多忙，他都坚持每天读书半小时。',
      passage: '', options: [],
      answer: 'However busy he is, he keeps reading for half an hour every day.',
      explain: '"无论多忙"可用 however busy he is 或 no matter how busy he is；"坚持做某事"用 keep doing。',
      hint: '两个句型：However + adj. + 主谓；keep doing sth.',
      vocab: ['however', 'keep doing'],
    },
    {
      id: 'd5', type: 'reading',
      stem: 'What does the passage mainly talk about?',
      passage: 'Paper was invented in China around the 1st century AD. Before paper, people wrote on bamboo, silk or even bones. Because silk was expensive and bamboo was heavy, the Chinese began to look for something cheaper and lighter. Cai Lun, a court official, improved the papermaking process using tree bark and old cloth. This invention later spread to the Arab world and then to Europe, changing the way knowledge was recorded and shared forever.',
      options: ['How silk was made in ancient China', 'Why paper was invented and how it spread', 'The life of Cai Lun as an official', 'How Europeans learned to write'],
      answer: 'B',
      explain: '全文围绕"纸的发明原因（更便宜轻便）与传播路径"展开，B 概括最全面。',
      hint: '抓首尾句：前文讲"为什么造纸"，后文讲"传播"。',
      vocab: ['invent', 'spread', 'record'],
    },
  ],
};

export const DEMO_ESSAY = {
  score: 11,
  maxScore: 15,
  dims: [
    { name: '内容要点', score: 4, max: 5 },
    { name: '词汇语法', score: 4, max: 5 },
    { name: '结构衔接', score: 3, max: 5 },
  ],
  corrections: [
    { orig: 'I am agree with this plan', fixed: 'I agree with this plan', note: 'agree 是动词，不加 be 动词' },
    { orig: 'It can help us to making friends', fixed: 'It can help us make friends', note: 'help sb (to) do sth，接动词原形' },
    { orig: 'More and more students like it', fixed: 'An increasing number of students like it', note: '提升词汇多样性' },
  ],
  improved: 'Dear editor,\n\nI am writing to share my opinion on the upcoming sports meet. I agree with this plan, because it not only builds up our bodies but also helps us make friends.\n\nAn increasing number of students are looking forward to it. I believe the sports meet will be a great success if we all take part.\n\nYours,\nLi Hua',
  comments: [
    '要点齐全，结构清晰，能使用 not only...but also 等结构。',
    '主谓一致和动词形式需注意（如 am agree）。',
    '建议丰富连接词与高级词汇，适当使用定语从句。',
  ],
};
