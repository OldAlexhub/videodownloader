# Privacy Policy for Video Downloader & Media Saver

Developer: Old Alex Hub

Effective date: 10/01/2026

Contact: info@oldalexhub.com

## Overview

Video Downloader & Media Saver is a free Android application supported by advertising. It provides a built-in browser, media detection, background downloads, a local media library, and on-device utility tools. No Old Alex Hub account is required.

This policy explains which information stays on the device, which limited analytics information is sent to Old Alex Hub, and which information may be processed by third-party advertising services.

## Information stored locally

The following information may be stored on the Android device:

- Download jobs, status, progress, source metadata, filenames, quality, byte counts, and failure details
- Media files downloaded by the user
- Local media metadata and file hashes used for duplicate detection
- Browser history and searches unless private browsing is used
- Bookmarks
- WebView cookies, cache, and site storage
- App settings and advertising frequency state
- Temporary download fragments needed for pause and resume

Private browsing prevents pages from being added to the app's local browser history and uses an incognito WebView session. Private browsing does not make the user anonymous to websites, internet providers, advertising services, or network operators.

Users can clear browser history, cookies, cache, temporary fragments, and other local app data from Settings. Deleting a downloaded file requires explicit confirmation.

## Old Alex Hub analytics

When Performance analytics is enabled, the app sends limited events to `https://vd.server.oldalexhub.com`. These events are used for product analysis, user counts, reliability, download performance, and advertising performance.

Analytics events may include:

- A randomly generated installation identifier
- Event time
- App version and Android API level
- Device locale and time zone
- Download title and filename as text
- Source website domain
- Media type, format, source quality, byte counts, duration, status, and failure code
- Ad format and placement impression events
- If the separate Search & website insights setting is enabled: submitted search terms and visited website domains, used for aggregate top-term and top-site reports
- Player-open and app-open events

The analytics server may use the request IP address to derive an approximate city and country, then discards the IP without storing it. The server replaces the random installation identifier with a keyed HMAC hash before database storage. The app does not request Android location permission for analytics and does not send GPS coordinates.

Search & website insights is off by default and can be disabled in Settings. It records terms submitted through the browser address bar and website domains from non-private page visits only when both it and Performance analytics are enabled. Private sessions are excluded. The service receives the search term or site domain, not the visited page path or URL query string. These events appear in aggregate top-term and top-site reports; individual search and site values are hidden in the recent-event dashboard. Turning the setting off removes queued search and site events from the device.

The app does not send downloaded media files, video or audio content, WebView cookies, authorization headers, or complete signed download URLs to the Old Alex Hub analytics service. Full browser history and page content are not sent.

Analytics delivery has short timeouts and a bounded local queue. If the analytics server is unavailable, browsing, downloading, playback, local library access, and other features continue normally. Users can disable Performance analytics in Settings. Disabling it clears pending analytics events from the app queue.

## Advertising

The app uses Google AdMob and Google User Messaging Platform. Google advertising services may process advertising identifiers, approximate location, IP address, device information, app interactions, ad impressions, ad clicks, diagnostics, consent choices, and related advertising data depending on configuration, user consent, region, and device settings.

Advertising data is processed under Google's terms and privacy policies. Ads may not load while offline or when an advertising service is unavailable. An ad failure does not block app functionality.

The app does not use rewarded ads. Ads do not unlock download speed, quality, additional downloads, playback, sharing, or tools.

## Internet access

Internet access is required for web browsing, source downloads, advertising, consent messages, and analytics delivery. Local library functions should remain usable offline when Android can access the stored file.

Media downloads flow directly from the source website to the Android device. Old Alex Hub does not proxy or store the media file.

## Media and copyright responsibility

Only download media you own, have permission to download, or that is made available for downloading by the content provider. Users are responsible for following copyright law, website terms, and applicable permissions.

The app is not designed to bypass DRM, authentication, subscriptions, paid access, paywalls, or content access controls. Protected media is not supported.

## Data retention

Local data remains until the user deletes it, clears app data, removes the app, or Android removes temporary files. Old Alex Hub retains raw analytics events for up to 24 months for product analysis, security, and performance reporting. Events may then be deleted or retained only in aggregated form that is no longer linked to an installation identifier.

Google retains advertising and consent data according to its own policies and account configuration.

## Data security

Old Alex Hub analytics uses HTTPS. Reasonable safeguards should be applied to the analytics service, including access controls, retention limits, and monitoring. No internet transmission or storage system can be guaranteed to be completely secure.

## Children

Video Downloader & Media Saver is a general utility and is not directed to children under 13. Old Alex Hub does not knowingly seek personal information from children through the app. If a parent or guardian believes a child has provided information, use the contact address above to request review or deletion.

## Changes to this policy

This policy may be updated when app features, analytics, advertising configuration, legal requirements, or service providers change. The effective date will be updated when a revised policy is published.

## Contact

For privacy questions or data requests, contact:

info@oldalexhub.com
