import {NativeEventEmitter, NativeModules} from 'react-native';

export interface BrowserObservation {tabId: string; documentId: string; url: string; pageUrl: string}
const native = NativeModules.VDBrowserSession;
export const browserSession = {
  attach: (tag: number, tabId: string) => native?.attach(tag, tabId) ?? Promise.resolve(false),
  back: (tag: number): Promise<string> => native?.back(tag) ?? Promise.resolve('unavailable'),
  configureScript: (tag: number, script: string) => native?.configureScript(tag, script) ?? Promise.resolve(false),
  save: (tag: number, tabId: string, privateMode: boolean) => native?.save(tag, tabId, privateMode) ?? Promise.resolve(false),
  restore: (tag: number, tabId: string, privateMode: boolean) => native?.restore(tag, tabId, privateMode) ?? Promise.resolve(false),
  remove: (tabId: string) => native?.remove(tabId) ?? Promise.resolve(false),
  clear: () => native?.clear() ?? Promise.resolve(false),
  subscribe: (callback: (observation: BrowserObservation) => void) => {
    if (!native) return () => {};
    const subscription = new NativeEventEmitter(native).addListener('VDBrowserResource', value => callback(value as BrowserObservation));
    return () => subscription.remove();
  },
};
