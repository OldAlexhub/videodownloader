export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  parentId?: string;
  privateMode?: boolean;
  visitedAt?: number;
}

export const SESSION_KEY = '@vdms/browser/session/v2';
export const COMPATIBILITY_KEY = '@vdms/browser/compatibility/v2';
export const newBrowserTab = (privateMode = false): BrowserTab => ({
  id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, url: '', title: 'New tab', privateMode,
});

export function restoreTabs(value: string | null): {tabs: BrowserTab[]; activeId: string} | null {
  try {
    const parsed = JSON.parse(value || 'null');
    if (!Array.isArray(parsed?.tabs)) return null;
    const ids = new Set<string>();
    const tabs = parsed.tabs.filter((tab: BrowserTab) => {
      if (!tab || typeof tab.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(tab.id) || ids.has(tab.id) || tab.privateMode || typeof tab.url !== 'string' || tab.url && !/^https?:\/\//i.test(tab.url)) return false;
      ids.add(tab.id);
      return true;
    }).slice(0, 30).map((tab: BrowserTab) => ({...tab, title: String(tab.title || 'New tab').slice(0, 200), privateMode: false}));
    return tabs.length ? {tabs, activeId: tabs.some((tab: BrowserTab) => tab.id === parsed.activeId) ? parsed.activeId : tabs[0].id} : null;
  } catch { return null; }
}

export function closingTab(tabs: BrowserTab[], id: string, activeId: string) {
  const closed = tabs.find(tab => tab.id === id);
  const remaining = tabs.filter(tab => tab.id !== id);
  if (!remaining.length) remaining.push(newBrowserTab(Boolean(closed?.privateMode)));
  return {tabs: remaining, activeId: id !== activeId ? activeId : remaining.find(tab => tab.id === closed?.parentId)?.id || remaining[remaining.length - 1].id};
}

export function persistableSession(tabs: BrowserTab[], activeId: string) {
  return JSON.stringify({tabs: tabs.filter(tab => !tab.privateMode), activeId});
}
