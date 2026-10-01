import React, {createContext, PropsWithChildren, useContext} from 'react';

const AdConsentContext = createContext(false);

export function AdConsentProvider({ready, children}: PropsWithChildren<{ready: boolean}>) {
  return <AdConsentContext.Provider value={ready}>{children}</AdConsentContext.Provider>;
}

export function useAdsReady() {
  return useContext(AdConsentContext);
}
