import { extractTimestamps, formatTimestampForDuration } from '../../shared/bilibili';
import type { ChatMessage, VideoSummary } from '../../shared/types';

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function welcomeSuggestions(summary: VideoSummary | null): string[] {
  const items: string[] = [];
  const term = summary?.terms[0]?.term;
  if (term) items.push(`「${term}」是什么意思？`);

  const chapter = summary?.chapters[1] ?? summary?.chapters[0];
  if (chapter) items.push(`「${chapter.title}」这一部分讲了什么？`);

  items.push('这个视频主要讲了什么？', '用三句话总结这个视频', '视频里有哪些关键概念？');
  return unique(items).slice(0, 3);
}

export function followUpSuggestions(args: {
  messages: ChatMessage[];
  summary: VideoSummary | null;
  duration: number;
  limit?: number;
}): string[] {
  const last = args.messages[args.messages.length - 1];
  if (!last || last.role !== 'assistant') return [];

  const asked = new Set(
    args.messages
      .filter((message) => message.role === 'user')
      .map((message) => message.content.trim()),
  );

  const items: string[] = [];
  const cited = extractTimestamps(last.content);
  const timestamp = cited[cited.length - 1];
  if (timestamp !== undefined) {
    items.push(`展开讲讲 [${formatTimestampForDuration(timestamp, args.duration)}] 这一段`);
  }

  const term = args.summary?.terms.find((item) => !last.content.includes(item.term))?.term;
  if (term) items.push(`「${term}」在这个视频里指什么？`);

  items.push('这个结论有什么前提或例外？', '能结合字幕举个例子吗？', '把刚才的回答讲得更简单一点');

  return unique(items.filter((item) => !asked.has(item))).slice(0, args.limit ?? 3);
}
