import type {MediaVariant} from '../src/types';
import {chooseVariant, groupMedia, upsertVariant} from '../src/utils/media';

function variant(overrides: Partial<MediaVariant> = {}): MediaVariant {
  return {
    id: overrides.id || 'one',
    candidateKey: overrides.candidateKey || overrides.id || 'one',
    groupKey: overrides.groupKey || 'asset-one',
    assetId: overrides.assetId || overrides.groupKey || 'asset-one',
    sourceUrl: overrides.sourceUrl || 'https://media.example/video-720.mp4',
    pageUrl: 'https://example.test/watch',
    documentId: 'tab:1',
    title: 'Same page title',
    mimeType: 'video/mp4',
    extension: 'mp4',
    mediaType: 'video',
    qualityLabel: overrides.height ? `${overrides.height}p` : 'Source',
    confidence: 80,
    inspectionState: 'ready',
    audioMode: 'muxed',
    ...overrides,
  };
}

describe('V2 media discovery', () => {
  it('groups variants by explicit asset relationship, never title alone', () => {
    const assets = groupMedia([
      variant({id: 'a720', assetId: 'player-a', groupKey: 'player-a', height: 720}),
      variant({id: 'a1080', assetId: 'player-a', groupKey: 'player-a', height: 1080}),
      variant({id: 'b720', assetId: 'player-b', groupKey: 'player-b', sourceUrl: 'https://cdn.example/other.mp4', height: 720}),
    ], 'tab:1');
    expect(assets).toHaveLength(2);
    expect(assets.find(asset => asset.id === 'player-a')?.variants).toHaveLength(2);
  });

  it('rejects candidates from a stale document generation', () => {
    expect(groupMedia([variant({documentId: 'tab:old'})], 'tab:new')).toEqual([]);
  });

  it('upgrades an existing URL when better metadata arrives', () => {
    const initial = variant({candidateKey: 'stable', height: undefined, confidence: 40});
    const upgraded = variant({candidateKey: 'stable', height: 1080, width: 1920, bitrate: 4_000_000, confidence: 95});
    const result = upsertVariant([initial], upgraded);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({height: 1080, width: 1920, bitrate: 4_000_000, confidence: 95});
  });

  it('uses deterministic Best, Balanced, and Smallest preselection', () => {
    const options = [
      variant({id: '360', height: 360, estimatedBytes: 10, bitrate: 500_000}),
      variant({id: '720', height: 720, estimatedBytes: 30, bitrate: 2_000_000}),
      variant({id: '1080', height: 1080, estimatedBytes: 60, bitrate: 4_000_000}),
    ];
    expect(chooseVariant(options, 'best')?.id).toBe('1080');
    expect(chooseVariant(options, 'balanced')?.id).toBe('720');
    expect(chooseVariant(options, 'smallest')?.id).toBe('360');
  });

  it('never preselects an unsupported or video-only option when audio is available', () => {
    const options = [
      variant({id: 'protected', height: 2160, inspectionState: 'protected'}),
      variant({id: 'silent', height: 1080, audioMode: 'none', hasAudio: false}),
      variant({id: 'complete', height: 720, audioMode: 'separate'}),
    ];
    expect(chooseVariant(options, 'best')?.id).toBe('complete');
  });
});
