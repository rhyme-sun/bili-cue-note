import { useEffect, useRef, useState } from 'react';
import {
  isVideoPage,
  parseBvid,
  parsePageNumber,
  pickCidFromPagelist,
} from '../../shared/bilibili';
import { DEFAULT_SETTINGS } from '../../shared/constants';
import { getSettings, onSettingsChanged } from '../../shared/settings';
import type { Settings, VideoContext } from '../../shared/types';
import type { PageBridge } from '../bridge';
import { getVideoElement } from './session';
import { detectPageDark, observePageDark } from './theme';

export function useSettings(): { settings: Settings; loaded: boolean } {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void getSettings().then((value) => {
      if (!active) return;
      setSettings(value);
      setLoaded(true);
    });
    const unsubscribe = onSettingsChanged((value) => {
      setSettings(value);
      setLoaded(true);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return { settings, loaded };
}

function cleanTitle(title: string): string {
  return title.replace(/_哔哩哔哩_bilibili$/i, '').trim();
}

export function useVideo(bridge: PageBridge): VideoContext | null {
  const [video, setVideo] = useState<VideoContext | null>(null);
  const lastUrlRef = useRef<string>(location.href);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const resolve = async (): Promise<void> => {
      if (cancelled) return;
      const url = location.href;
      if (!isVideoPage(url)) {
        setVideo(null);
        return;
      }
      const bvid = parseBvid(url);
      if (!bvid) {
        setVideo(null);
        return;
      }
      const p = parsePageNumber(url);
      const known = bridge.getLastContext();
      const knownMatches = Boolean(known && known.bvid === bvid && known.p === p);
      let cid = knownMatches ? known?.cid : undefined;
      let title = knownMatches && known ? known.title : cleanTitle(document.title);
      let duration = knownMatches && known ? known.duration : 0;
      const aid = knownMatches ? known?.aid : undefined;

      if (!cid) {
        try {
          const pagelist = await bridge.fetchPagelist(bvid);
          const pages = pagelist.data?.pages;
          cid = pickCidFromPagelist(pages, p) ?? undefined;
          const page = pages?.find((item) => item.page === p);
          if (page) {
            duration = page.duration;
            if (!title) title = page.part;
          }
        } catch {
          // The page may still be initialising; retry below.
        }
      }

      if (cancelled) return;
      if (!cid) {
        attempts += 1;
        if (attempts < 12) {
          window.setTimeout(() => {
            void resolve();
          }, 800);
        }
        return;
      }

      setVideo({
        bvid,
        aid,
        cid,
        p,
        title: title || `BV${bvid}`,
        duration,
        url,
      });
    };

    const offContext = bridge.onContext((context) => {
      if (cancelled || !context) return;
      const bvid = parseBvid(location.href);
      if (bvid && context.bvid !== bvid) return;
      if (context.p !== parsePageNumber(location.href)) return;
      setVideo({ ...context, url: location.href });
      attempts = 0;
    });
    const offRoute = bridge.onRouteChange(() => {
      attempts = 0;
      void resolve();
    });

    void resolve();

    const interval = window.setInterval(() => {
      if (location.href !== lastUrlRef.current) {
        lastUrlRef.current = location.href;
        attempts = 0;
        void resolve();
      }
    }, 800);

    return () => {
      cancelled = true;
      offContext();
      offRoute();
      window.clearInterval(interval);
    };
  }, [bridge]);

  const cid = video?.cid;

  useEffect(() => {
    if (!cid) return;
    const update = (): void => {
      const element = getVideoElement();
      const duration = element && Number.isFinite(element.duration) ? element.duration : 0;
      if (duration <= 0) return;
      setVideo((previous) => {
        if (!previous || previous.cid !== cid) return previous;
        if (Math.abs(previous.duration - duration) < 1) return previous;
        return { ...previous, duration };
      });
    };
    update();
    const timer = window.setInterval(update, 2_000);
    return () => window.clearInterval(timer);
  }, [cid]);

  return video;
}

export function usePageDark(): boolean {
  const [dark, setDark] = useState(() => detectPageDark());

  useEffect(() => observePageDark(setDark), []);

  return dark;
}

export function usePlaybackClock(): { seconds: number; playing: boolean } {
  const [clock, setClock] = useState({ seconds: 0, playing: false });

  useEffect(() => {
    const update = (): void => {
      const element = getVideoElement();
      if (!element) {
        setClock((previous) =>
          previous.seconds === 0 && !previous.playing ? previous : { seconds: 0, playing: false },
        );
        return;
      }
      const seconds = Number.isFinite(element.currentTime) ? element.currentTime : 0;
      const playing = !element.paused && !element.ended;
      setClock((previous) =>
        Math.abs(previous.seconds - seconds) < 0.5 && previous.playing === playing
          ? previous
          : { seconds, playing },
      );
    };

    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  return clock;
}
