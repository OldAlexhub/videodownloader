import {deletionRequestUrl, originalDownloadLink} from '../src/utils/sourceLink';
import {DEFAULT_SETTINGS} from '../src/types';

test('opens original pages and falls back to valid media URLs for older records', () => {
  expect(originalDownloadLink({pageUrl: 'https://www.youtube.com/watch?v=example', sourceUrl: 'https://cdn.example/video.mp4'})).toBe('https://www.youtube.com/watch?v=example');
  expect(originalDownloadLink({pageUrl: '', sourceUrl: 'https://cdn.example/video.mp4'})).toBe('https://cdn.example/video.mp4');
  // eslint-disable-next-line no-script-url
  expect(originalDownloadLink({pageUrl: 'javascript:alert(1)', sourceUrl: 'file:///secret'})).toBeUndefined();
  expect(originalDownloadLink({pageUrl: 'https://user:pass@example.com/', sourceUrl: ''})).toBeUndefined();
});

test('operational sharing defaults on, insights require consent, and deletion draft targets support with the installation reference', () => {
  expect(DEFAULT_SETTINGS.analyticsEnabled).toBe(true);
  expect(DEFAULT_SETTINGS.usageInsightsEnabled).toBe(false);
  const draft = deletionRequestUrl('sample-install-reference');
  expect(draft.startsWith('mailto:info@oldalexhub.com?')).toBe(true);
  expect(decodeURIComponent(draft)).toContain('Anonymous installation reference: sample-install-reference');
});
