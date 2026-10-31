import { describe, expect, it } from 'vitest';
import {
  buildTimestampLink,
  estimateTokens,
  extractTimestamps,
  formatSrtTimestamp,
  formatTimestamp,
  formatTimestampForDuration,
  groupTranscript,
  isPlayerApi,
  isVideoPage,
  linesAroundTimestamps,
  mergeSubtitleLines,
  normalizeSubtitle,
  parseBvid,
  parsePageNumber,
  parseSummaryJson,
  parseTimestampToken,
  parseTimestampValue,
  pickCidFromPagelist,
  pickSubtitleInfo,
  retrieveLines,
  sanitizeSubtitleUrl,
  selectSubtitleTracks,
  splitTranscriptByChars,
  summaryToMarkdown,
  transcriptToChatPromptText,
  transcriptToMarkdown,
  transcriptToSrt,
  transcriptToTxt,
} from '../src/shared/bilibili';
import type { SubtitleLine } from '../src/shared/types';

const lines: SubtitleLine[] = [
  { from: 0, to: 3, content: '第一句' },
  { from: 3.5, to: 6, content: '第二句' },
  { from: 10, to: 12, content: '第三句' },
  { from: 60, to: 63, content: '一分钟后的句子' },
];

describe('Bilibili URL helpers', () => {
  it('recognises video pages and extracts bvid/p', () => {
    const url = 'https://www.bilibili.com/video/BV1Ab411c7Xz/?p=3&spm_id_from=xxx';
    expect(isVideoPage(url)).toBe(true);
    expect(parseBvid(url)).toBe('BV1Ab411c7Xz');
    expect(parsePageNumber(url)).toBe(3);
    expect(isVideoPage('https://www.bilibili.com/bangumi/play/ep1')).toBe(false);
    expect(parseBvid('https://www.bilibili.com/bangumi/play/ep1')).toBeNull();
    expect(parsePageNumber('https://www.bilibili.com/video/BV1xx')).toBe(1);
  });

  it('picks the cid for the requested page', () => {
    const pages = [
      { cid: 1, page: 1, part: 'P1', duration: 10 },
      { cid: 2, page: 2, part: 'P2', duration: 20 },
    ];
    expect(pickCidFromPagelist(pages, 2)).toBe(2);
    expect(pickCidFromPagelist(pages, 9)).toBe(1);
    expect(pickCidFromPagelist(undefined, 1)).toBeNull();
  });

  it('normalises subtitle urls and recognises player APIs', () => {
    expect(sanitizeSubtitleUrl('//aisubtitle.hdslb.com/a.json')).toBe(
      'https://aisubtitle.hdslb.com/a.json',
    );
    expect(isPlayerApi('https://api.bilibili.com/x/player/wbi/v2?bvid=x&cid=1')).toBe(true);
    expect(isPlayerApi('https://api.bilibili.com/x/player/v2?bvid=x&cid=1')).toBe(true);
    expect(isPlayerApi('https://api.bilibili.com/x/player/pagelist?bvid=x')).toBe(true);
    expect(isPlayerApi('https://api.bilibili.com/x/web-interface/nav')).toBe(false);
  });
});

describe('subtitle selection and normalisation', () => {
  it('prefers ai-zh, then zh variants, then the first track', () => {
    expect(
      pickSubtitleInfo([
        { lan: 'en', subtitle_url: 'e' },
        { lan: 'zh-CN', subtitle_url: 'z' },
        { lan: 'ai-zh', subtitle_url: 'a' },
      ])?.lan,
    ).toBe('ai-zh');

    expect(
      pickSubtitleInfo([
        { lan: 'en', subtitle_url: 'e' },
        { lan: 'zh-CN', subtitle_url: 'z' },
      ])?.lan,
    ).toBe('zh-CN');

    expect(pickSubtitleInfo([{ lan: 'en', subtitle_url: 'e' }])?.lan).toBe('en');
    expect(pickSubtitleInfo([])).toBeNull();
  });

  it('treats an AI track with ai_status 2 and a url as usable', () => {
    const { usable, generating } = selectSubtitleTracks([
      {
        lan: 'ai-zh',
        lan_doc: '中文（自动生成）',
        subtitle_url: '//aisubtitle.hdslb.com/a.json',
        ai_status: 2,
      },
    ]);
    expect(usable).toHaveLength(1);
    expect(generating).toBe(false);
    // Regression: a ready AI subtitle must still be preferred, not rejected.
    expect(pickSubtitleInfo(usable)?.lan).toBe('ai-zh');
  });

  it('only reports generating for an empty AI track marked ai_status 1', () => {
    const generatingTrack = selectSubtitleTracks([
      { lan: 'ai-zh', subtitle_url: '', ai_status: 1 },
    ]);
    expect(generatingTrack.usable).toHaveLength(0);
    expect(generatingTrack.generating).toBe(true);

    const completedButNoUrl = selectSubtitleTracks([
      { lan: 'ai-zh', subtitle_url: '', ai_status: 2 },
    ]);
    expect(completedButNoUrl.usable).toHaveLength(0);
    expect(completedButNoUrl.generating).toBe(false);

    const noSubtitle = selectSubtitleTracks([]);
    expect(noSubtitle.generating).toBe(false);
  });

  it('sorts, filters and de-duplicates subtitle lines', () => {
    const result = normalizeSubtitle({
      body: [
        { from: 5, to: 6, content: '后' },
        { from: 1, to: 2, content: '前' },
        { from: 1, to: 2, content: '前' },
        { from: 3, to: 3, content: '零长度' },
        { from: 4, to: 5, content: '   ' },
        { from: '7', to: '8', content: '数字字符串' },
      ],
    });
    expect(result.map((line) => line.content)).toEqual(['前', '后', '数字字符串']);
  });
});

describe('timestamps and formatting', () => {
  it('formats timestamps', () => {
    expect(formatTimestamp(0)).toBe('00:00');
    expect(formatTimestamp(65)).toBe('01:05');
    expect(formatTimestamp(3665)).toBe('1:01:05');
    expect(formatSrtTimestamp(65.5)).toBe('00:01:05,500');
    expect(formatSrtTimestamp(0)).toBe('00:00:00,000');
  });

  it('matches the player progress bar format based on video duration', () => {
    // Under one hour: mm:ss.
    expect(formatTimestampForDuration(65, 213)).toBe('01:05');
    // One hour or longer: every position uses h:mm:ss, even under an hour.
    expect(formatTimestampForDuration(9, 14_548)).toBe('0:00:09');
    expect(formatTimestampForDuration(201, 14_548)).toBe('0:03:21');
    expect(formatTimestampForDuration(3_723, 14_548)).toBe('1:02:03');
    // Unknown duration falls back to the value-based format.
    expect(formatTimestampForDuration(65, 0)).toBe('01:05');
    expect(formatTimestampForDuration(3_723, 0)).toBe('1:02:03');
  });

  it('parses timestamp strings', () => {
    expect(parseTimestampValue(65)).toBe(65);
    expect(parseTimestampValue('65')).toBe(65);
    expect(parseTimestampValue('01:05')).toBe(65);
    expect(parseTimestampValue('1:01:05')).toBe(3665);
    expect(parseTimestampValue('00:01:05,500')).toBe(65.5);
    expect(parseTimestampValue('nope')).toBeNull();
  });

  it('builds deep links', () => {
    expect(buildTimestampLink('BV1xx', 1, 65.9)).toBe('https://www.bilibili.com/video/BV1xx?t=65');
    expect(buildTimestampLink('BV1xx', 2, 65.9)).toBe(
      'https://www.bilibili.com/video/BV1xx?t=65&p=2',
    );
  });

  it('parses timestamps copied from transcript or model output', () => {
    expect(parseTimestampToken('[17.6s]')).toBe(17.6);
    expect(parseTimestampToken('[33.6s]')).toBe(33.6);
    expect(parseTimestampToken('[17.6秒]')).toBe(17.6);
    expect(parseTimestampToken('17.6s')).toBe(17.6);
    expect(parseTimestampToken('[03:21]')).toBe(201);
    expect(parseTimestampToken('【1:02:03】')).toBe(3723);
    expect(parseTimestampToken('03:21')).toBe(201);
    expect(parseTimestampToken('这不是时间')).toBeNull();
  });
});

describe('transcript formatting', () => {
  it('exports txt with timestamps', () => {
    expect(transcriptToTxt(lines)).toBe(
      '[00:00] 第一句\n[00:03] 第二句\n[00:10] 第三句\n[01:00] 一分钟后的句子',
    );
  });

  it('exports valid-looking SRT', () => {
    const srt = transcriptToSrt(lines);
    expect(srt).toContain('1\n00:00:00,000 --> 00:00:03,000\n第一句');
    expect(srt).toContain('2\n00:00:03,500 --> 00:00:06,000\n第二句');
  });

  it('exports markdown with deep links', () => {
    const markdown = transcriptToMarkdown(lines, { title: '标题', bvid: 'BV1xx', p: 1 });
    expect(markdown).toContain('# 标题');
    expect(markdown).toContain('[00:00](https://www.bilibili.com/video/BV1xx?t=0)');
  });

  it('formats chat prompt timestamps like the player progress bar', () => {
    const chatLines: SubtitleLine[] = [
      { from: 17.6, to: 20, content: 'AI 板块' },
      { from: 65, to: 68, content: 'BTC' },
    ];
    expect(transcriptToChatPromptText(chatLines, 213)).toBe('[00:17] AI 板块\n[01:05] BTC');
    expect(transcriptToChatPromptText(chatLines, 14_548)).toBe('[0:00:17] AI 板块\n[0:01:05] BTC');
  });

  it('groups lines by time gap', () => {
    const paragraphs = groupTranscript(lines, 2, 6);
    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[0]?.text).toBe('第一句第二句');
    expect(paragraphs[1]?.start).toBe(10);
    expect(paragraphs[2]?.start).toBe(60);
  });

  it('splits long transcripts into chunks without losing lines', () => {
    const longLines: SubtitleLine[] = Array.from({ length: 100 }, (_, index) => ({
      from: index * 5,
      to: index * 5 + 4,
      content: `第 ${index} 句，这是一段用来测试分块的字幕内容。`,
    }));
    const chunks = splitTranscriptByChars(longLines, 1_000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flatMap((chunk) => chunk.lines)).toHaveLength(100);
    for (const chunk of chunks) {
      expect(chunk.start).toBe(chunk.lines[0]?.from);
      expect(chunk.end).toBe(chunk.lines[chunk.lines.length - 1]?.to);
    }
  });
});

describe('summary parsing and markdown', () => {
  it('parses fenced JSON and timestamp strings', () => {
    const summary = parseSummaryJson(`\`\`\`json
{
  "overview": "这是总览",
  "chapters": [{"start": "01:05", "title": "章节", "summary": "内容"}],
  "keyPoints": ["要点一"],
  "terms": [{"term": "术语", "explanation": "解释"}]
}
\`\`\``);
    expect(summary?.overview).toBe('这是总览');
    expect(summary?.chapters[0]?.start).toBe(65);
    expect(summary?.keyPoints).toEqual(['要点一']);
    expect(summary?.terms[0]?.term).toBe('术语');
  });

  it('repairs trailing commas and accepts aliases', () => {
    const summary = parseSummaryJson(
      '{"summary":"总览","sections":[{"time":10,"heading":"标题","content":"内容",}],"key_points":["要点"],}',
    );
    expect(summary?.overview).toBe('总览');
    expect(summary?.chapters[0]?.title).toBe('标题');
    expect(summary?.keyPoints).toEqual(['要点']);
  });

  it('returns null for unusable output', () => {
    expect(parseSummaryJson('这不是 JSON')).toBeNull();
    expect(parseSummaryJson('{"overview":""}')).toBeNull();
  });

  it('renders summary markdown with clickable timestamps', () => {
    const markdown = summaryToMarkdown(
      {
        overview: '总览',
        chapters: [{ start: 65, title: '第一章', summary: '内容' }],
        keyPoints: ['要点'],
        terms: [{ term: '术语', explanation: '解释' }],
      },
      { title: '标题', bvid: 'BV1xx', p: 2 },
    );
    expect(markdown).toContain('# 标题');
    expect(markdown).toContain('[01:05](https://www.bilibili.com/video/BV1xx?t=65&p=2)');
    expect(markdown).toContain('## 关键要点');
    expect(markdown).toContain('**术语**：解释');
  });
});

describe('token estimation and retrieval', () => {
  it('estimates tokens for CJK and Latin text', () => {
    expect(estimateTokens('你好世界')).toBe(3);
    expect(estimateTokens('hello world')).toBe(3);
    expect(estimateTokens('')).toBe(0);
  });

  it('retrieves relevant lines with neighbours', () => {
    const result = retrieveLines(lines, '第三句', { limit: 1, window: 1 });
    expect(result.map((line) => line.content)).toContain('第三句');
    expect(result.map((line) => line.content)).toContain('第二句');
    expect(result.map((line) => line.content)).toContain('一分钟后的句子');
  });

  it('returns nothing for an unmatched query', () => {
    expect(retrieveLines(lines, '量子力学', { limit: 2 })).toEqual([]);
  });

  it('extracts every supported timestamp citation format', () => {
    expect(extractTimestamps('见 [03:21]、【1:02:03】、bare 00:10，以及 [17.6s]。')).toEqual([
      10, 18, 201, 3723,
    ]);
  });

  it('pins the lines around cited timestamps for follow-ups', () => {
    const result = linesAroundTimestamps(lines, [65], 1);
    expect(result.map((line) => line.content)).toEqual(['第三句', '一分钟后的句子']);
  });

  it('merges pinned and retrieved lines without duplicates', () => {
    const merged = mergeSubtitleLines([lines[1]!, lines[2]!], [lines[2]!, lines[3]!]);
    expect(merged.map((line) => line.content)).toEqual(['第二句', '第三句', '一分钟后的句子']);
  });
});
