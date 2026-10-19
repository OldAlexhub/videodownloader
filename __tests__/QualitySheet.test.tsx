import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {SafeAreaProvider} from 'react-native-safe-area-context';

jest.mock('lucide-react-native', () => {
  const ReactModule = require('react');
  const {View} = require('react-native');
  const Icon = (props: object) => ReactModule.createElement(View, props);
  return {Check: Icon, CheckSquare2: Icon, Download: Icon, FileAudio: Icon, FileVideo: Icon, Folder: Icon, ImageIcon: Icon, Square: Icon, X: Icon};
});
jest.mock('@react-native-async-storage/async-storage', () => ({getItem: jest.fn(), setItem: jest.fn()}));

import {QualitySheet} from '../src/components/QualitySheet';
import type {DetectedAsset} from '../src/types';

const asset: DetectedAsset = {
  id: 'asset-1',
  documentId: 'tab-1:1',
  title: 'Test video',
  mediaType: 'video',
  prominence: 100,
  variants: [{
    id: 'variant-1',
    candidateKey: 'candidate-1',
    assetId: 'asset-1',
    groupKey: 'asset-1',
    documentId: 'tab-1:1',
    sourceUrl: 'https://media.example/video.mp4',
    pageUrl: 'https://example.test/watch',
    title: 'Test video',
    mimeType: 'video/mp4',
    extension: 'mp4',
    mediaType: 'video',
    protocol: 'progressive',
    container: 'MP4',
    qualityLabel: '720p',
    resolution: '720p',
    width: 1280,
    height: 720,
    estimatedBytes: 1000,
    hasAudio: true,
    audioMode: 'muxed',
    confidence: 95,
    inspectionState: 'ready',
    supportState: 'supported',
  }],
};

const secondAsset: DetectedAsset = {
  ...asset,
  id: 'asset-2',
  title: 'Second video',
  prominence: 50,
  variants: [{...asset.variants[0], id: 'variant-2', candidateKey: 'candidate-2', assetId: 'asset-2', groupKey: 'asset-2', sourceUrl: 'https://media.example/second.mp4'}],
};

test('opening and changing picker selections never enqueue automatically', async () => {
  const onDownload = jest.fn(async () => []);
  let renderer: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <SafeAreaProvider initialMetrics={{frame: {x: 0, y: 0, width: 390, height: 844}, insets: {top: 44, right: 0, bottom: 34, left: 0}}}>
        <QualitySheet
          assets={[asset, secondAsset]}
          destinationName="Downloads"
          onChooseDestination={async () => undefined}
          onClose={() => undefined}
          onDownload={onDownload}
          onIncorrect={() => undefined}
          preferredQuality="balanced"
          visible
        />
      </SafeAreaProvider>,
    );
  });
  expect(onDownload).not.toHaveBeenCalled();
  const checkboxes = renderer!.root.findAllByProps({accessibilityRole: 'checkbox'});
  expect(new Set(checkboxes.map(item => item.props.accessibilityState.checked))).toEqual(new Set([true, false]));
  const secondCheckbox = checkboxes.find(item => item.props.accessibilityState.checked === false && typeof item.props.onPress === 'function');
  await act(async () => secondCheckbox!.props.onPress());
  expect(renderer!.root.findAllByProps({accessibilityRole: 'checkbox'}).every(item => item.props.accessibilityState.checked)).toBe(true);
  expect(onDownload).not.toHaveBeenCalled();
});
