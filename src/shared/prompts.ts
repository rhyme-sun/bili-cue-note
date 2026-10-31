import { formatTimestamp, formatTimestampForDuration } from './bilibili';
import type {
  ChatMessage,
  OutputLanguage,
  SummaryLength,
  VideoContext,
  VideoSummary,
} from './types';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const SUMMARY_SCHEMA = `{
  "overview": "对视频内容的总览，1-4 句话",
  "chapters": [
    {
      "start": 0,
      "title": "章节标题",
      "summary": "该章节讲了什么，2-4 句话"
    }
  ],
  "keyPoints": ["关键要点 1", "关键要点 2"],
  "terms": [
    {
      "term": "术语或专有名词",
      "explanation": "用视频里的语境解释它"
    }
  ]
}`;

const SUMMARY_SYSTEM = `你是 BiliCueNote，一个只依据视频字幕工作的视频摘要助手。

必须遵守：
1. 只能使用用户提供的字幕内容，不得引入字幕之外的知识、猜测或外部事实。
2. 章节的 start 必须是该章节第一句字幕的起始秒数（整数），使用绝对时间，从视频开头算起。
3. 章节按时间升序排列，覆盖视频的主要内容，不要堆叠在同一时间点。
4. 如果字幕里没有足够信息，就在 overview 中说明，不要编造。
5. 只输出合法 JSON，不要输出 Markdown 代码块、解释或任何 JSON 之外的文字。`;

function lengthInstruction(length: SummaryLength): string {
  switch (length) {
    case 'short':
      return '长度档：简。overview 1-2 句；chapters 3-5 个；keyPoints 3-5 条；terms 0-5 个。';
    case 'long':
      return '长度档：详。overview 3-6 句；chapters 8-12 个；keyPoints 8-12 条；terms 5-15 个。';
    case 'medium':
    default:
      return '长度档：中。overview 2-4 句；chapters 5-8 个；keyPoints 5-8 条；terms 3-10 个。';
  }
}

function languageInstruction(language: OutputLanguage): string {
  switch (language) {
    case 'zh':
      return '输出语言：中文。';
    case 'en':
      return '输出语言：英文。';
    case 'ja':
      return '输出语言：日文。';
    case 'ko':
      return '输出语言：韩文。';
    case 'auto':
    default:
      return '输出语言：与字幕相同的语言。';
  }
}

export function buildSummaryMessages(args: {
  video: VideoContext;
  transcriptText: string;
  length: SummaryLength;
  language: OutputLanguage;
}): LlmMessage[] {
  const user = [
    `视频标题：${args.video.title}`,
    `视频时长：${formatTimestamp(args.video.duration)}`,
    lengthInstruction(args.length),
    languageInstruction(args.language),
    '',
    '请输出符合以下结构的 JSON：',
    SUMMARY_SCHEMA,
    '',
    '字幕（每行格式 [起始秒数s] 内容）：',
    args.transcriptText,
  ].join('\n');

  return [
    { role: 'system', content: SUMMARY_SYSTEM },
    { role: 'user', content: user },
  ];
}

export function buildChunkSummaryMessages(args: {
  video: VideoContext;
  chunkText: string;
  index: number;
  total: number;
  start: number;
  end: number;
  language: OutputLanguage;
}): LlmMessage[] {
  const user = [
    `视频标题：${args.video.title}`,
    `这是整段视频的第 ${args.index + 1}/${args.total} 段，时间范围 ${formatTimestamp(args.start)} - ${formatTimestamp(args.end)}。`,
    '只总结这一段的字幕，不要推测其他段的内容。',
    languageInstruction(args.language),
    '请输出符合以下结构的 JSON：',
    SUMMARY_SCHEMA,
    '',
    `第 ${args.index + 1} 段字幕（每行格式 [起始秒数s] 内容）：`,
    args.chunkText,
  ].join('\n');

  return [
    { role: 'system', content: SUMMARY_SYSTEM },
    { role: 'user', content: user },
  ];
}

export function buildMergeMessages(args: {
  video: VideoContext;
  partials: VideoSummary[];
  length: SummaryLength;
  language: OutputLanguage;
}): LlmMessage[] {
  const user = [
    `视频标题：${args.video.title}`,
    `视频时长：${formatTimestamp(args.video.duration)}`,
    lengthInstruction(args.length),
    languageInstruction(args.language),
    '下面是同一视频各时间段的摘要 JSON。请合并成一份最终摘要：',
    '- 保留各段的时间戳，按时间排序；',
    '- 合并重复内容，删除过于琐碎的细节；',
    '- 不要新增字幕里没有的信息；',
    '- 只输出最终 JSON，结构必须符合：',
    SUMMARY_SCHEMA,
    '',
    '各段摘要 JSON：',
    JSON.stringify(args.partials),
  ].join('\n');

  return [
    { role: 'system', content: SUMMARY_SYSTEM },
    { role: 'user', content: user },
  ];
}

const CHAT_SYSTEM = `你是 BiliCueNote，一个基于 B 站视频字幕回答问题的助手。

必须遵守：
1. 只能依据提供的字幕和摘要回答，不得使用字幕之外的知识。
2. 每个关键结论后面标注字幕依据的时间戳。格式与播放器进度条一致：视频不足 1 小时用 [mm:ss]（如 [03:21]）；达到 1 小时用 [h:mm:ss]（如 [1:02:03]）。一句话综合多个位置时可以标注多个时间戳。绝对不要输出 [17.6s]、[17.6秒] 这种带小数秒数的格式。
3. 如果字幕里没有相关信息，明确回答“视频中未提及”，不要猜测或编造。
4. 回答使用提问者使用的语言，简洁、直接。
5. 可以使用简单的 Markdown（加粗、列表），但不要输出代码块包裹整段回答。`;

function summaryToPromptText(summary: VideoSummary, duration: number): string {
  const parts: string[] = [`总览：${summary.overview}`];
  if (summary.chapters.length > 0) {
    parts.push(
      '章节：',
      ...summary.chapters.map(
        (chapter) =>
          `- [${formatTimestampForDuration(chapter.start, duration)}] ${chapter.title}：${chapter.summary}`,
      ),
    );
  }
  if (summary.keyPoints.length > 0) {
    parts.push('关键要点：', ...summary.keyPoints.map((point) => `- ${point}`));
  }
  if (summary.terms.length > 0) {
    parts.push('术语：', ...summary.terms.map((term) => `- ${term.term}：${term.explanation}`));
  }
  return parts.join('\n');
}

export function buildChatMessages(args: {
  video: VideoContext;
  transcriptText: string;
  summary: VideoSummary | null;
  history: ChatMessage[];
  question: string;
}): LlmMessage[] {
  const contextParts = [
    `视频标题：${args.video.title}`,
    `视频时长：${formatTimestamp(args.video.duration)}`,
  ];
  if (args.summary) {
    contextParts.push('', '已有摘要：', summaryToPromptText(args.summary, args.video.duration));
  }
  contextParts.push(
    '',
    '字幕资料（每行格式 [mm:ss] 或 [h:mm:ss]，与播放器进度条一致）：',
    args.transcriptText,
  );

  const messages: LlmMessage[] = [
    { role: 'system', content: CHAT_SYSTEM },
    { role: 'user', content: contextParts.join('\n') },
  ];

  for (const message of args.history.slice(-10)) {
    messages.push({ role: message.role, content: message.content });
  }
  messages.push({ role: 'user', content: args.question });
  return messages;
}
