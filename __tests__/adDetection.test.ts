const {runInNewContext} = jest.requireActual('node:vm');
import {isAdvertisingUrl} from '../src/utils/adDetection';
import {inferMediaFromUrl, MEDIA_DETECTOR_SCRIPT} from '../src/utils/browser';

test('rejects ad networks, ad segments and explicit ad query markers without blocking ordinary downloads', () => {
  for (const url of ['https://video.doubleclick.net/clip.mp4', 'https://cdn.example.com/preroll/clip.mp4', 'https://cdn.example.com/ads.mp4', 'https://cdn.example.com/clip.mp4?ad_type=video']) {
    expect(isAdvertisingUrl(url)).toBe(true);
    expect(inferMediaFromUrl(url, 'https://example.com', 'Video')).toBeNull();
  }
  for (const url of ['https://example.com/downloads/road-trip.mp4', 'https://example.com/uploads/lesson.mp4', 'https://example.com/advertising-course.mp4', 'https://cdn.googlevideo.com/content.mp4?v=abc']) {
    expect(isAdvertisingUrl(url)).toBe(false);
    expect(inferMediaFromUrl(url, 'https://example.com', 'Video')).not.toBeNull();
  }
});

test('detector skips ad containers and retracts a source when a reused player enters ad mode', () => {
  const messages: Array<{type: string; url: string}> = [];
  let advertising = true;
  let rescan = () => {};
  const node = {
    currentSrc: 'https://cdn.example.com/unlabelled.mp4', src: '', tagName: 'VIDEO',
    paused: false, duration: 20, videoWidth: 1280, videoHeight: 720,
    closest: () => advertising ? {} : null, getBoundingClientRect: () => ({width: 640, height: 360}),
    getAttribute: () => '', querySelectorAll: () => [], addEventListener: () => {},
  };
  const document = {
    title: 'Video', baseURI: 'https://example.com', documentElement: {},
    querySelectorAll: () => [node], querySelector: () => null, addEventListener: () => {},
  };
  runInNewContext(MEDIA_DETECTOR_SCRIPT, {
    window: {ReactNativeWebView: {postMessage: (message: string) => messages.push(JSON.parse(message))}, addEventListener() {}},
    document, navigator: {}, URL, XMLHttpRequest: function() {},
    MutationObserver: class { constructor(callback: () => void) { rescan = callback; } observe() {} },
    setInterval() {}, performance: {now: () => 0},
  });
  expect(messages.some(message => message.type === 'media')).toBe(false);
  advertising = false; rescan();
  expect(messages.some(message => message.type === 'media')).toBe(true);
  advertising = true; rescan();
  expect(messages.at(-1)).toEqual({type: 'mediaRejected', url: node.currentSrc});
});
