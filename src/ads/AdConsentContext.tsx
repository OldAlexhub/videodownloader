import React, {createContext, PropsWithChildren, useContext, useEffect, useState} from 'react';

import {DeviceEventEmitter} from 'react-native';
import {interstitialController} from './interstitial';
export function publishAdsConsent(allowed: boolean) {interstitialController.setAllowed(allowed); DeviceEventEmitter.emit('vdAdsConsent', allowed);}

const AdConsentContext = createContext(false);

export function AdConsentProvider({ready, children}: PropsWithChildren<{ready: boolean}>) {
  const [allowed, setAllowed] = useState(ready);
  useEffect(() => {setAllowed(ready); interstitialController.setAllowed(ready);}, [ready]);
  useEffect(() => {const subscription = DeviceEventEmitter.addListener('vdAdsConsent', value => setAllowed(Boolean(value))); return () => subscription.remove();}, []);
  return <AdConsentContext.Provider value={allowed}>{children}</AdConsentContext.Provider>;
}

export function useAdsReady() {
  return useContext(AdConsentContext);
}
