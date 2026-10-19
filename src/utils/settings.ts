import {DEFAULT_SETTINGS, type AppSettings} from '../types';

export function migrateSettings(value: unknown): AppSettings {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const migrated: AppSettings = {...DEFAULT_SETTINGS};
  const writable = migrated as unknown as Record<string, unknown>;
  (Object.keys(DEFAULT_SETTINGS) as Array<keyof AppSettings>).forEach(key => {
    if (raw[key] !== undefined) writable[key] = raw[key];
  });
  const preferred = raw.preferredQuality;
  const legacy = raw.defaultQuality;
  migrated.preferredQuality = preferred === 'best' || preferred === 'balanced' || preferred === 'smallest'
    ? preferred
    : legacy === 'best' || legacy === 'smallest' ? legacy : 'balanced';
  return migrated;
}
