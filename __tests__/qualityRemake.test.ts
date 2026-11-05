import {inferMediaFromUrl} from '../src/utils/browser';
import {groupMedia, primaryVariant, upsertVariant, variantUsable} from '../src/utils/media';
import {migrateSettings} from '../src/utils/settings';
import type {MediaVariant} from '../src/types';

const variant = (patch: Partial<MediaVariant> = {}): MediaVariant => ({
  id:'one', sourceUrl:'https://cdn.test/file.mp4?id=one', pageUrl:'https://site.test/watch',
  documentId:'tab:1', assetId:'resource-one', groupKey:'resource-one', title:'Video', mimeType:'video/mp4',
  extension:'mp4', mediaType:'video', confidence:70, qualityLabel:'360p', inspectionState:'ready', classification:'uncertain', ...patch,
});

test('fifteen observations collapse to one player asset without losing inspection', () => {
  let media: MediaVariant[] = [];
  for (let index=0; index<15; index++) media=upsertVariant(media,variant({id:`observation-${index}`, detectionSource:index%2 ? 'fetch':'native'}));
  media=upsertVariant(media,variant({height:720,width:1280,hasAudio:true,audioMode:'muxed',verifiedTracks:true}));
  media=upsertVariant(media,variant({assetId:'player:1', playerId:'player', classification:'content', inspectionState:'probing',audioMode:'unknown'}));
  expect(media).toHaveLength(1);
  expect(primaryVariant(media[0])).toBe(true);
  expect(media[0]).toMatchObject({height:720,width:1280,hasAudio:true,audioMode:'muxed',verifiedTracks:true});
  expect(groupMedia(media,'tab:1')).toHaveLength(1);
});
test('different query-identified content stays separate and signed source URLs remain intact', () => {
  const first=variant({assetId:undefined,groupKey:'',sourceUrl:'https://cdn.test/file.mp4?id=one&sig=secret'});
  const second=variant({assetId:undefined,groupKey:'',sourceUrl:'https://cdn.test/file.mp4?id=two&sig=secret'});
  expect(groupMedia([first,second])).toHaveLength(2);
  expect(upsertVariant([first],second)).toHaveLength(2);
  expect(first.sourceUrl).toContain('sig=secret');
});
test('a manifest placeholder is removed only for its own inspected variants', () => {
  const pending=variant({sourceUrl:'https://cdn.test/a.m3u8',isManifest:true,inspectionState:'probing'});
  const unrelated=variant({id:'other',sourceUrl:'https://cdn.test/b.m3u8',assetId:'other',isManifest:true,inspectionState:'probing'});
  const media=upsertVariant([pending,unrelated],{...pending,id:'track',selectionToken:'video:720',inspectionState:'ready'});
  expect(media).toHaveLength(2);
  expect(media.some(item=>item.sourceUrl===unrelated.sourceUrl)).toBe(true);
});
test('uncertain inspections and segments never become downloadable choices', () => {
  for (const state of ['probing','uncertain','expired','unsupported','protected'] as const) expect(variantUsable(variant({inspectionState:state}))).toBe(false);
  expect(primaryVariant(variant())).toBe(false);
  expect(variantUsable(variant({classification:'advertisement'}))).toBe(false);
  expect(inferMediaFromUrl('https://cdn.test/segment.m4s','https://site.test','Video',{'content-type':'video/mp4'})).toBeNull();
  expect(inferMediaFromUrl('https://cdn.test/stream?id=123','https://site.test','Video',{'content-type':'application/vnd.apple.mpegurl'})).toMatchObject({protocol:'hls',isManifest:true});
});
test('migration never interprets default-on settings as affirmative behavioral consent', () => {
  expect(migrateSettings({analyticsEnabled:true,usageInsightsEnabled:true})).toMatchObject({behavioralConsent:'pending',usageInsightsEnabled:false});
  expect(migrateSettings({analyticsEnabled:false,usageInsightsEnabled:false})).toMatchObject({analyticsEnabled:false,behavioralConsent:'denied'});
  expect(migrateSettings({behavioralConsent:'granted',usageInsightsEnabled:true})).toMatchObject({behavioralConsent:'granted',usageInsightsEnabled:true});
});
