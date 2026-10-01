import {inferMediaFromUrl, normalizeAddress} from '../src/utils/browser';
import {cleanFilename, formatBytes} from '../src/utils/format';

describe('browser address handling', () => {
  test('normalizes hosts and searches', () => {
    expect(normalizeAddress('example.com/video', 'google')).toBe('https://example.com/video');
    expect(normalizeAddress('download tips', 'duckduckgo')).toBe('https://duckduckgo.com/?q=download%20tips');
  });

  test('detects real media and filters common icons', () => {
    expect(inferMediaFromUrl('https://cdn.example.com/lesson-720p.mp4', 'https://example.com/lesson', 'Lesson')?.qualityLabel).toBe('720p');
    expect(inferMediaFromUrl('https://example.com/favicon.png', 'https://example.com', 'Home')).toBeNull();
  });
});

describe('download formatting', () => {
  test('creates safe filenames and readable sizes', () => {
    expect(cleanFilename('A: useful / video?', 'mp4')).toBe('A useful video.mp4');
    expect(formatBytes(5_242_880)).toBe('5.0 MB');
  });
});
