import { describe, expect, it } from 'vitest';
import { followUpSuggestions, welcomeSuggestions } from '../src/content/panel/suggestions';
import type { ChatMessage, VideoSummary } from '../src/shared/types';

const summary: VideoSummary = {
  overview: '总览',
  chapters: [
    { start: 0, title: '开场', summary: '背景' },
    { start: 65, title: '核心结论', summary: '结论' },
  ],
  keyPoints: ['要点'],
  terms: [
    { term: '验收基线', explanation: '解释' },
    { term: '上下文', explanation: '解释' },
  ],
};

describe('chat suggestions', () => {
  it('prefers summary-specific questions when a summary exists', () => {
    const suggestions = welcomeSuggestions(summary);
    expect(suggestions[0]).toContain('验收基线');
    expect(suggestions[1]).toContain('核心结论');
    expect(suggestions).toHaveLength(3);
  });

  it('falls back to generic questions without a summary', () => {
    expect(welcomeSuggestions(null)[0]).toContain('主要讲了什么');
  });

  it('derives follow-ups from the last answer citations and summary terms', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: '讲一下结论', createdAt: 1 },
      {
        role: 'assistant',
        content: '结论在 [01:05] 处，具体依据见 [00:10]。',
        createdAt: 2,
      },
    ];
    const suggestions = followUpSuggestions({ messages, summary, duration: 213 });
    expect(suggestions[0]).toBe('展开讲讲 [01:05] 这一段');
    expect(suggestions[1]).toContain('验收基线');
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });

  it('does not suggest before an assistant answer', () => {
    expect(
      followUpSuggestions({
        messages: [{ role: 'user', content: '问题', createdAt: 1 }],
        summary,
        duration: 213,
      }),
    ).toEqual([]);
  });
});
