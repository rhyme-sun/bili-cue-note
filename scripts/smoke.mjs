import { chromium } from 'playwright-core';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Real-browser smoke test.
 *
 * It loads `dist/` into a fresh Edge profile, opens a Bilibili video page,
 * verifies the injected panel and the logged-out error state, then opens the
 * options page. It does NOT call a real LLM and does NOT use your Bilibili
 * account.
 *
 * Usage: npm run smoke
 * Requires Microsoft Edge installed (override with EDGE_PATH).
 */

const edgePath =
  process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const extensionPath = resolve(process.cwd(), 'dist');
const userDataDir = await mkdtemp(join(tmpdir(), 'bilicuenote-smoke-'));
const videoUrl = 'https://www.bilibili.com/video/BV1GJ411x7h7';
const shotsDir = process.env.SMOKE_SHOTS_DIR;

let context;
let page;
let failures = 0;

function check(label, condition, detail = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures += 1;
}

async function shotRaw(name) {
  if (!shotsDir) return;
  await mkdir(shotsDir, { recursive: true });
  await page.bringToFront();
  await page.screenshot({ path: join(shotsDir, name), animations: 'disabled' });
}

async function shot(name) {
  await page.evaluate(() => {
    const active = document.querySelector('#bili-cue-note-host')?.shadowRoot?.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });
  await page.mouse.move(4, 4);
  await page.waitForTimeout(250);
  await shotRaw(name);
}

try {
  context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: edgePath,
    headless: false,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-dev-shm-usage',
      '--disable-features=DisableLoadExtensionCommandLineSwitch',
    ],
    timeout: 30_000,
  });

  const pageErrors = [];
  context.on('page', (page) => {
    page.on('pageerror', (error) => {
      pageErrors.push({ message: error.message, stack: error.stack ?? '' });
    });
    page.on('console', (message) => {
      if (message.type() === 'error') pageErrors.push({ message: message.text(), stack: '' });
    });
  });

  page = await context.newPage();
  await page.goto(videoUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(8_000);

  check('Bilibili video page loaded', page.url().includes('/video/BV'), page.url());
  check('Injected host exists', Boolean(await page.$('#bili-cue-note-host')));

  const shadowText = async () =>
    page.evaluate(() => {
      const host = document.querySelector('#bili-cue-note-host');
      return host?.shadowRoot?.querySelector('.bb-root')?.textContent ?? '';
    });

  const entry = page.locator('#bili-cue-note-host').getByRole('button', { name: /AI 摘要/ });
  check('Floating entry visible', (await entry.count()) > 0);
  await shot('01-entry.png');

  if ((await entry.count()) > 0) {
    await entry.first().click();
    await page.waitForTimeout(800);
    const panelText = await shadowText();
    check('Panel opens', panelText.includes('BiliCueNote'));
    check(
      'Panel is chat-first',
      panelText.includes('生成摘要') &&
        (panelText.includes('围绕这个视频提问') || panelText.includes('对话需要先获取字幕')),
    );
    await page.locator('section[data-bb-panel]').first().waitFor({ state: 'visible' });
    const panelFrame = await page.evaluate(() => {
      const element = document
        .querySelector('#bili-cue-note-host')
        ?.shadowRoot?.querySelector('section[data-bb-panel]');
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        borderWidth: style.borderTopWidth,
        borderStyle: style.borderTopStyle,
        boxShadow: style.boxShadow,
      };
    });
    check(
      'Panel frame has a visible border and shadow',
      Boolean(
        panelFrame &&
        panelFrame.borderWidth !== '0px' &&
        panelFrame.borderStyle !== 'none' &&
        panelFrame.boxShadow !== 'none',
      ),
      panelFrame ? JSON.stringify(panelFrame) : 'panel missing',
    );
    await page.waitForTimeout(400);
    await shot('02-chat-empty.png');
  }

  const serviceWorker = context.serviceWorkers()[0];
  check('Background service worker running', Boolean(serviceWorker));
  let extensionId = '';
  if (serviceWorker) {
    extensionId = new URL(serviceWorker.url()).host;

    await serviceWorker.evaluate(async () => {
      await chrome.storage.local.set({
        settings: {
          baseUrl: 'https://api.deepseek.com/v1',
          apiKey: 'sk-demo-key-not-real',
          model: 'deepseek-chat',
          contextWindow: 128000,
          outputLanguage: 'auto',
          summaryLength: 'medium',
        },
      });
    });
    await page.waitForTimeout(1_000);

    const generate = page
      .locator('#bili-cue-note-host')
      .locator('button:not([disabled])')
      .filter({ hasText: /开始生成|生成摘要/ });
    check('Generate button enabled after settings', (await generate.count()) > 0);
    if ((await generate.count()) > 0) {
      await generate.first().click();
      await page.waitForTimeout(6_000);
      const text = await shadowText();
      check(
        'Logged-out generate shows login prompt',
        text.includes('请先登录'),
        text.replace(/\s+/g, ' ').slice(0, 160),
      );
    }
  }

  // Click-to-seek: seed a cached transcript, reopen the panel on the
  // transcript tab, click 01:05 and verify the player actually moved.
  if (serviceWorker) {
    const cid = await page.evaluate(() => {
      const state = window.__INITIAL_STATE__;
      return state?.videoData?.cid ?? state?.cid ?? null;
    });
    if (cid) {
      await serviceWorker.evaluate(async (videoCid) => {
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open('bili-cue-note', 1);
          request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains('transcripts')) {
              database.createObjectStore('transcripts', { keyPath: 'cid' });
            }
            if (!database.objectStoreNames.contains('summaries')) {
              database.createObjectStore('summaries');
            }
            if (!database.objectStoreNames.contains('chats')) {
              database.createObjectStore('chats', { keyPath: 'cid' });
            }
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        await new Promise((resolve, reject) => {
          const tx = db.transaction('transcripts', 'readwrite');
          tx.objectStore('transcripts').put({
            cid: videoCid,
            bvid: 'BV1GJ411x7h7',
            title: 'smoke seek',
            duration: 213,
            lines: [
              { from: 0, to: 3, content: '歌曲开场与画面' },
              { from: 65, to: 68, content: '副歌部分与标志性舞步' },
            ],
            source: 'player',
            fetchedAt: Date.now(),
          });
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
        await new Promise((resolve, reject) => {
          const tx = db.transaction('chats', 'readwrite');
          tx.objectStore('chats').put({
            cid: videoCid,
            messages: [
              {
                role: 'assistant',
                content: '这段视频的关键信息出现在 [17.6s]，另一个重点在 [00:03:21]。',
                createdAt: Date.now(),
              },
            ],
          });
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
        await new Promise((resolve, reject) => {
          const tx = db.transaction('summaries', 'readwrite');
          tx.objectStore('summaries').put(
            {
              summary: {
                overview:
                  '视频回顾了歌曲与 MV 的发行背景，并在 [01:05] 解释了它如何成为互联网迷因。',
                chapters: [
                  {
                    start: 0,
                    title: '开场与背景',
                    summary: '作者先交代了歌曲发行背景与画面风格 [00:05]。',
                  },
                  {
                    start: 65,
                    title: '成为迷因',
                    summary: '随后解释了它如何演变为全球互联网迷因 [01:05]。',
                  },
                ],
                keyPoints: [
                  '旋律与画面反差是传播关键 [00:05]',
                  '用时间戳可快速回看对应片段 [01:05]',
                ],
                terms: [
                  {
                    term: '互联网迷因',
                    explanation: '在网络上被大量复制、改编和传播的文化符号。',
                  },
                ],
              },
              meta: {
                cid: videoCid,
                model: 'deepseek-chat',
                promptVersion: '1',
                length: 'medium',
                language: 'auto',
                createdAt: Date.now(),
              },
            },
            `${videoCid}:deepseek-chat:1:medium:auto`,
          );
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
        db.close();
      }, cid);

      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForTimeout(5_000);
      await page
        .waitForFunction(
          () => {
            const video = document.querySelector('.bpx-player-video-wrap video');
            return Boolean(video && video.readyState >= 1);
          },
          null,
          { timeout: 15_000 },
        )
        .catch(() => undefined);

      const seekEntry = page
        .locator('#bili-cue-note-host')
        .getByRole('button', { name: /AI 摘要/ });
      await seekEntry.first().click();
      await page.waitForTimeout(800);

      const cachedText = await shadowText();
      check('Cached summary appears in overview strip', cachedText.includes('互联网迷因'));
      await shot('03-chat-with-summary.png');

      const overview = page
        .locator('#bili-cue-note-host')
        .getByRole('button', { name: '展开摘要概览' });
      check(
        'Overview strip is collapsed by default',
        (await overview.count()) > 0 &&
          (await overview.first().getAttribute('aria-expanded')) === 'false',
      );
      if ((await overview.count()) > 0) {
        await overview.first().click();
        await page.waitForTimeout(200);
        const expanded = page
          .locator('#bili-cue-note-host')
          .getByRole('button', { name: '收起摘要概览' });
        check(
          'Overview strip expands inline',
          (await expanded.count()) > 0 &&
            (await expanded.first().getAttribute('aria-expanded')) === 'true',
        );
        await expanded.first().click();
        await page.waitForTimeout(200);
      } else {
        check('Overview strip expands inline', false, 'overview toggle missing');
      }

      const summaryTab = page.locator('#bili-cue-note-host').getByRole('tab', { name: '摘要' });
      await summaryTab.first().click();
      await page.waitForTimeout(500);
      const summaryText = await shadowText();
      check(
        'Summary view renders sections',
        ['总览', '开场与背景', '关键要点', '互联网迷因'].every((value) =>
          summaryText.includes(value),
        ),
      );
      await shot('04-summary.png');
      await page.locator('#bili-cue-note-host').getByRole('tab', { name: '对话' }).first().click();
      await page.waitForTimeout(300);

      const transcriptTab = page.locator('#bili-cue-note-host').getByRole('tab', { name: '字幕' });
      await transcriptTab.first().click();
      await page.waitForTimeout(300);
      await shot('05-transcript.png');

      const stamp = page
        .locator('#bili-cue-note-host')
        .getByRole('button', { name: '01:05', exact: true });
      await stamp
        .first()
        .waitFor({ state: 'visible', timeout: 8_000 })
        .catch(() => undefined);
      check('Seek timestamp button visible', (await stamp.count()) > 0);
      if ((await stamp.count()) > 0) {
        await stamp.first().click();
        await page.waitForTimeout(1_500);
        const currentTime = await page.evaluate(
          () => document.querySelector('.bpx-player-video-wrap video')?.currentTime ?? -1,
        );
        check(
          'Clicking timestamp seeks video',
          currentTime >= 64 && currentTime <= 70,
          `currentTime=${currentTime.toFixed?.(1) ?? currentTime}`,
        );
      }

      await page.locator('#bili-cue-note-host').getByRole('tab', { name: '对话' }).first().click();
      await page.waitForTimeout(300);
      await shot('06-chat-timestamps.png');

      const rawStamp = page
        .locator('#bili-cue-note-host')
        .getByRole('button', { name: '00:17', exact: true });
      await rawStamp
        .first()
        .waitFor({ state: 'visible', timeout: 8_000 })
        .catch(() => undefined);
      check('Raw seconds timestamp is normalized and clickable', (await rawStamp.count()) > 0);
      if ((await rawStamp.count()) > 0) {
        await rawStamp.first().hover();
        await page.waitForTimeout(400);
        const popoverText = await shadowText();
        check(
          'Citation hover reveals the transcript excerpt',
          popoverText.includes('字幕原文') && popoverText.includes('副歌部分'),
        );
        const popoverStyle = await page.evaluate(() => {
          const element = document
            .querySelector('#bili-cue-note-host')
            ?.shadowRoot?.querySelector('[role="dialog"][data-bb-panel]');
          if (!element) return null;
          const style = getComputedStyle(element);
          return {
            borderWidth: style.borderTopWidth,
            borderStyle: style.borderTopStyle,
            borderColor: style.borderTopColor,
            backgroundColor: style.backgroundColor,
          };
        });
        check(
          'Citation popover has a visible border',
          Boolean(
            popoverStyle &&
            popoverStyle.borderWidth !== '0px' &&
            popoverStyle.borderColor !== popoverStyle.backgroundColor,
          ),
          popoverStyle ? JSON.stringify(popoverStyle) : 'popover missing',
        );
        await shotRaw('06-citation-popover.png');

        const locate = page
          .locator('#bili-cue-note-host')
          .getByRole('button', { name: '在字幕中查看' });
        if ((await locate.count()) > 0) {
          await locate.first().click();
          await page.waitForTimeout(500);
          const highlighted = await page.evaluate(() =>
            Boolean(
              document
                .querySelector('#bili-cue-note-host')
                ?.shadowRoot?.querySelector('.bb-highlight'),
            ),
          );
          check('Citation locates and highlights the transcript', highlighted);
          await page
            .locator('#bili-cue-note-host')
            .getByRole('tab', { name: '对话' })
            .first()
            .click();
          await page.waitForTimeout(300);
        } else {
          check('Citation locates and highlights the transcript', false, 'locate missing');
        }
      }
      if ((await rawStamp.count()) > 0) {
        await rawStamp.first().click();
        await page.waitForTimeout(1_500);
        const currentTime = await page.evaluate(
          () => document.querySelector('.bpx-player-video-wrap video')?.currentTime ?? -1,
        );
        check(
          'Clicking raw seconds timestamp seeks video',
          currentTime >= 17 && currentTime <= 20,
          `currentTime=${currentTime.toFixed?.(1) ?? currentTime}`,
        );
      }

      const chatStamp = page
        .locator('#bili-cue-note-host')
        .getByRole('button', { name: '03:21', exact: true });
      await chatStamp
        .first()
        .waitFor({ state: 'visible', timeout: 8_000 })
        .catch(() => undefined);
      check('Chat timestamp is clickable', (await chatStamp.count()) > 0);
      if ((await chatStamp.count()) > 0) {
        await chatStamp.first().click();
        await page.waitForTimeout(1_500);
        const currentTime = await page.evaluate(
          () => document.querySelector('.bpx-player-video-wrap video')?.currentTime ?? -1,
        );
        check(
          'Clicking chat timestamp seeks video',
          currentTime >= 200 && currentTime <= 205,
          `currentTime=${currentTime.toFixed?.(1) ?? currentTime}`,
        );
      }

      const clearChat = page
        .locator('#bili-cue-note-host')
        .getByRole('button', { name: '清空对话' });
      check('Clear chat button is reachable by its icon label', (await clearChat.count()) > 0);
      if ((await clearChat.count()) > 0) {
        await clearChat.first().click();
        await page.waitForTimeout(200);
        check(
          'Clearing chat asks for confirmation',
          (await shadowText()).includes('清空当前对话？'),
        );
        await shotRaw('10-clear-chat-confirm.png');
        await page
          .locator('#bili-cue-note-host')
          .getByRole('button', { name: '取消' })
          .first()
          .click();
        await page.waitForTimeout(200);
        check(
          'Cancelling keeps chat history',
          (await page
            .locator('#bili-cue-note-host')
            .getByRole('button', { name: '03:21', exact: true })
            .count()) > 0,
        );
        await clearChat.first().click();
        await page.waitForTimeout(200);
        await page
          .locator('#bili-cue-note-host')
          .getByRole('button', { name: '清空', exact: true })
          .first()
          .click();
        await page.waitForTimeout(400);
        check('Confirming clears chat history', !(await shadowText()).includes('关键信息出现在'));
      }

      const panel = page.locator('section[data-bb-panel]');
      const before = await panel.boundingBox();
      if (before) {
        await page.mouse.move(before.x + 40, before.y + 20);
        await page.mouse.down();
        await page.mouse.move(before.x + 40 - 80, before.y + 20 + 30, { steps: 5 });
        await page.mouse.up();
        await page.waitForTimeout(200);
        const after = await panel.boundingBox();
        check(
          'Panel can be dragged',
          Boolean(after && Math.abs(after.x - before.x) > 20 && Math.abs(after.y - before.y) > 10),
          after ? `moved to ${Math.round(after.x)},${Math.round(after.y)}` : 'no box',
        );
      } else {
        check('Panel can be dragged', false, 'panel box not found');
      }

      // Bilibili reloads its own styles when `bili_dark` toggles, which makes
      // the screenshot racy. `data-theme` is only used as a test hook here.
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      await page.waitForTimeout(1_000);
      const isDark = await page.evaluate(() => {
        const host = document.querySelector('#bili-cue-note-host');
        return Boolean(host?.shadowRoot?.querySelector('.bb-root.dark'));
      });
      check('Panel follows the page dark theme', isDark);
      await shot('07-dark-chat.png');
      await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
    } else {
      check('Clicking timestamp seeks video', false, 'could not resolve cid');
    }
  }

  if (process.env.SMOKE_SCREENSHOT) {
    await page.screenshot({ path: process.env.SMOKE_SCREENSHOT });
  }

  if (extensionId) {
    await page.goto(`chrome-extension://${extensionId}/options.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await page.waitForTimeout(1_000);
    check('Options page renders', (await page.title()) === 'BiliCueNote 设置');
    await shot('08-options.png');
    if (shotsDir) {
      await page.screenshot({
        path: join(shotsDir, '08-options-config.png'),
        clip: { x: 290, y: 120, width: 700, height: 590 },
        animations: 'disabled',
      });
    }
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(400);
    await shot('09-options-dark.png');
    await page.emulateMedia({ colorScheme: 'light' });
  }

  const extensionErrors = pageErrors.filter((entry) =>
    /chrome-extension:\/\/|bili-cue-note|content\.js|injected\.js|process is not defined/i.test(
      `${entry.message}\n${entry.stack}`,
    ),
  );
  check(
    'No extension page errors',
    extensionErrors.length === 0,
    extensionErrors
      .slice(0, 3)
      .map((entry) => entry.message)
      .join(' | '),
  );
  if (pageErrors.length > extensionErrors.length) {
    console.log(
      `INFO ignored ${pageErrors.length - extensionErrors.length} unrelated Bilibili page error(s)`,
    );
  }
  console.log(failures === 0 ? 'SMOKE_OK' : `SMOKE_FAILED (${failures})`);
} catch (error) {
  console.error('SMOKE_FAILED', error);
  failures += 1;
} finally {
  if (context) await context.close();
  await rm(userDataDir, { recursive: true, force: true });
}

process.exitCode = failures === 0 ? 0 : 1;
