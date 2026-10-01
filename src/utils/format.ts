export function formatBytes(value?: number): string {
  if (!value || value < 0) {
    return 'Unknown size';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 10 || index === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[index]}`;
}

export function formatSpeed(value?: number): string {
  if (!value || value <= 0) {
    return 'Waiting';
  }
  return `${formatBytes(value)}/s`;
}

export function formatEta(seconds?: number): string {
  if (!seconds || seconds <= 0 || !Number.isFinite(seconds)) {
    return '--:--';
  }
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remaining = rounded % 60;
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`
    : `${minutes.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`;
}

export function formatDate(timestamp?: number): string {
  if (!timestamp) {
    return '';
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(timestamp));
}

export function cleanFilename(value: string, extension: string): string {
  const suffix = extension ? `.${extension.replace(/^\./, '')}` : '';
  const base = value
    // Control characters and Android-invalid filename characters are removed together.
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 120);
  return `${base || 'download'}${suffix}`;
}
