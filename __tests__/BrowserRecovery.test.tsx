import React from 'react';
import {Linking} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import {DEFAULT_SETTINGS} from '../src/types';

jest.mock('@react-native-async-storage/async-storage', () => ({getItem: jest.fn().mockResolvedValue(null), setItem: jest.fn().mockResolvedValue(undefined)}));
const mockReload = jest.fn();
const mockContext = {
  browserTarget: 'https://example.test/', browserResetKey: 0, bookmarks: [], detectedMedia: [], history: [],
  settings: {...DEFAULT_SETTINGS, analyticsEnabled: false}, activeTab: 'browser',
  addDetectedMedia: jest.fn(), clearDetectedMedia: jest.fn(), rejectDetectedMedia: jest.fn(),
  enqueueSelections: jest.fn(), addHistory: jest.fn(), toggleBookmark: jest.fn(), setActiveTab: jest.fn(), updateSettings: jest.fn(),
};
jest.mock('../src/context/AppContext', () => ({useApp: () => mockContext}));
jest.mock('@react-native-clipboard/clipboard', () => ({getString: jest.fn()}));
jest.mock('../src/ads/NativeSponsoredCard', () => ({NativeSponsoredCard: () => null}));
jest.mock('../src/components/QualitySheet', () => ({QualitySheet: () => null}));
jest.mock('../src/components/ScreenContainer', () => {
  const {View, ScrollView} = require('react-native');
  return {SafeBottomSheet: View, SafeModalScreen: View, SafeScrollView: ScrollView};
});
jest.mock('../src/native/DownloadManager', () => ({downloadManager: {trackEvent: jest.fn().mockResolvedValue(undefined), cancelInspections: jest.fn().mockResolvedValue(true)}}));
jest.mock('../src/native/RemoteConfig', () => ({remoteConfig: {current: () => ({detector: {minimumImagePixels: 100000}})}}));
jest.mock('lucide-react-native', () => {
  const {View} = require('react-native');
  return Object.fromEntries('ArrowLeft ArrowRight Bookmark Copy Download Globe2 History Home LockKeyhole MoreHorizontal Plus RefreshCw Search Share2 ShieldCheck X'.split(' ').map(name => [name, View]));
});
jest.mock('react-native-webview', () => {
  const ReactModule = require('react');
  return {WebView: ReactModule.forwardRef((props: object, ref: any) => {
    ReactModule.useImperativeHandle(ref, () => ({reload: mockReload, injectJavaScript: jest.fn(), goBack: jest.fn()}));
    return ReactModule.createElement('WebView', props);
  })};
});
import {BrowserScreen} from '../src/screens/BrowserScreen';

let renderer: TestRenderer.ReactTestRenderer;
const web = () => renderer.root.findByType('WebView' as any);
const button = (label: string) => renderer.root.findAll(node => typeof node.props.onPress === 'function' && node.findAll(child => child.props.children === label).length > 0)[0];

beforeEach(async () => {
  jest.spyOn(require('react-native'), 'findNodeHandle').mockReturnValue(null);
  mockReload.mockClear();
  mockContext.settings = {...DEFAULT_SETTINGS, analyticsEnabled: false};
  await act(async () => {renderer = TestRenderer.create(<BrowserScreen />);});
});
afterEach(async () => {await act(async () => renderer.unmount());});

test('503 keeps the original response visible through load completion; retry and dismiss remain available', async () => {
  await act(async () => web().props.onHttpError({nativeEvent: {statusCode: 503}}));
  await act(async () => web().props.onLoadEnd());
  expect(web().props.source.uri).toBe('https://example.test/');
  expect(renderer.root.findAllByProps({testID: 'browser-network-error'})).toHaveLength(0);
  expect(renderer.root.findAllByProps({testID: 'browser-recovery-notice'}).length).toBeGreaterThan(0);
  await act(async () => button('Retry').props.onPress());
  expect(mockReload).toHaveBeenCalledTimes(1);
  await act(async () => renderer.root.findAllByProps({accessibilityLabel: 'Dismiss website response notice'})[0].props.onPress());
  expect(renderer.root.findAllByProps({testID: 'browser-recovery-notice'})).toHaveLength(0);
});

test('compatibility preserves detection, stays scoped to the origin, and can restore filtering', async () => {
  mockContext.settings = {...mockContext.settings, privateByDefault: true};
  await act(async () => renderer.update(<BrowserScreen />));
  await act(async () => web().props.onHttpError({nativeEvent: {statusCode: 503}}));
  await act(async () => button('Try compatibility mode').props.onPress());
  expect(mockReload).toHaveBeenCalledTimes(1);
  expect(web().props.injectedJavaScript).toContain('__VDMS_INSTALLED__');
  expect(web().props.injectedJavaScript).not.toContain('__VDMS_WEBSITE_AD_BLOCKER__');
  expect(web().props.injectedJavaScriptBeforeContentLoaded).toContain('__VDMS_INSTALLED__');
  expect(web().props.incognito).toBe(false);
  expect(web().props.thirdPartyCookiesEnabled).toBe(true);
  expect(web().props.domStorageEnabled).toBe(true);
  await act(async () => web().props.onNavigationStateChange({url: 'https://other.test/', title: 'Other', loading: false}));
  expect(web().props.injectedJavaScript).toBeTruthy();
  await act(async () => web().props.onNavigationStateChange({url: 'https://example.test/next', title: 'Next', loading: false}));
  expect(web().props.injectedJavaScript).toContain('__VDMS_INSTALLED__');
  expect(web().props.injectedJavaScript).not.toContain('__VDMS_WEBSITE_AD_BLOCKER__');
  await act(async () => button('Restore filtering').props.onPress());
  expect(mockReload).toHaveBeenCalledTimes(2);
  expect(web().props.injectedJavaScript).toBeTruthy();
});

test('transport errors still have recovery UI and external browser receives the current URL', async () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  await act(async () => web().props.onError({nativeEvent: {description: 'Connection unavailable'}}));
  expect(renderer.root.findAllByProps({testID: 'browser-network-error'}).length).toBeGreaterThan(0);
  await act(async () => button('Open in browser').props.onPress());
  expect(openURL).toHaveBeenCalledWith('https://example.test/');
  await act(async () => web().props.onLoadStart({nativeEvent: {url: 'https://example.test/'}}));
  expect(renderer.root.findAllByProps({testID: 'browser-network-error'})).toHaveLength(0);
  openURL.mockRestore();
});


test('popup tabs preserve the parent WebView and navigation callbacks do not overwrite its source command', async () => {
  const parent=web();
  await act(async () => parent.props.onNavigationStateChange({url:'https://example.test/watch',title:'Watch',loading:false,canGoBack:true}));
  expect(parent.props.source.uri).toBe('https://example.test/');
  await act(async () => parent.props.onOpenWindow({nativeEvent:{targetUrl:'https://child.test/'}}));
  const views=renderer.root.findAllByType('WebView' as any);
  expect(views).toHaveLength(2);
  expect(views).toContain(parent);
  expect(views.find(view=>view!==parent)?.props.source.uri).toBe('https://child.test/');
});
