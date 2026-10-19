import {migrateSettings} from '../src/utils/settings';

describe('V2 settings migration', () => {
  it('migrates legacy ask to Balanced', () => {
    expect(migrateSettings({defaultQuality: 'ask'}).preferredQuality).toBe('balanced');
  });

  it('preserves deterministic legacy preferences', () => {
    expect(migrateSettings({defaultQuality: 'best'}).preferredQuality).toBe('best');
    expect(migrateSettings({defaultQuality: 'smallest'}).preferredQuality).toBe('smallest');
  });

  it('does not retain unknown legacy fields', () => {
    expect(migrateSettings({defaultQuality: 'ask', secret: 'nope'})).not.toHaveProperty('secret');
  });
});
