# Video Downloader & Media Saver

Video Downloader & Media Saver is a free Android utility from Old Alex Hub. It provides a built-in browser that detects media exposed by supported websites, groups available qualities, downloads authorized media in the background, and organizes completed files in a local library.

The full downloader is free. There are no accounts, subscriptions, download credits, speed limits, or paid quality controls. Google AdMob supports the application. Ads are never required to begin a download or use a feature.

Only download media you own, have permission to download, or that the content provider makes available for downloading. The app does not bypass DRM, authentication, subscriptions, paywalls, or access controls. It does not include platform-specific extraction logic for protected services.

## Architecture

- React Native 0.87 with TypeScript for the application UI
- Kotlin native module for persistent downloads, SQLite records, storage, sharing, rename, move, and playback intents
- WorkManager long-running workers with foreground notifications for user-started downloads
- Android MediaStore for default scoped storage on Android 10 and newer
- Storage Access Framework for user-selected destination folders
- Media3 ExoPlayer for local video and audio playback
- React Native WebView with DOM, media element, source tag, fetch, XHR, MIME, extension, HLS, and DASH detection signals
- AsyncStorage only for small preferences, bookmarks, browser history, consent state, and ad frequency state
- Native SQLite for structured download and media records
- Google Mobile Ads and UMP for advertising and privacy choices
- Bounded, failure-tolerant analytics delivery to `https://vd.server.oldalexhub.com/v1/events`

No media file is proxied through an Old Alex Hub server. Download bytes flow directly from the source to the Android device.

## Requirements

- Windows 10 or Windows 11
- Node.js 22.11 or newer
- Python 3.10 or newer for release automation
- Android Studio with its bundled JDK
- Android SDK platform 36 or newer
- Android SDK build-tools and platform-tools
- An Android device or emulator running Android 7.0 or newer

## Bare React Native setup

```powershell
cd VideoDownloader
npm install
npm run typecheck
npm test
npm run android
```

The package name is `com.oldalexhub.videodownloader`.

## Android setup

The release script detects Java and the Android SDK automatically. For manual builds, create `android/local.properties` with a forward-slash SDK path:

```properties
sdk.dir=C:/Users/YourName/AppData/Local/Android/Sdk
```

Debug APK:

```powershell
cd android
./gradlew.bat assembleDebug
```

## Download engine

The Kotlin download worker persists every job before scheduling it. WorkManager restores scheduled work after ordinary process recreation and uses network constraints for connected or Wi-Fi-only jobs. A foreground notification shows progress and exposes pause and cancel actions.

Direct HTTP downloads support:

- Streaming I/O without holding the full file in memory
- HTTP redirects with a strict redirect limit
- Cookies, user agent, and referer copied locally from the active WebView session
- HTTP Range resume where the server returns valid partial content
- ETag, Last-Modified, and If-Range validation
- Detection of servers that return HTTP 200 to a resume request
- Rolling transfer speed and ETA measurements
- Unknown Content-Length
- Retry with exponential WorkManager backoff when automatic resume is enabled
- Safe restart confirmation when a partial file cannot be resumed
- Collision-free filenames
- SHA-256 hashing after completion

Unencrypted HLS media playlists are downloaded segment by segment and resume at a completed segment boundary. Master playlists expose real resolution choices. Live playlists and encrypted HLS are rejected clearly. DASH manifests with a direct progressive representation are supported. DRM and DASH layouts that cannot be packaged safely are rejected instead of producing a corrupt file.

## Browser detection

The WebView detector observes media elements, source tags, metadata events, fetch responses, XHR responses, navigation requests, content types, URL extensions, manifest types, visible dimensions, activity, and page prominence. Results are deduplicated by URL and logical media group. Small images, common icon and tracking patterns, and low-confidence resources are filtered.

Long-pressing a webpage link or media item opens browser actions for opening it in the current tab or a new tab, copying, sharing, bookmarking, and downloading recognized media. Links that request a separate browser window open as a new in-app tab. Android's system Back button closes an open browser sheet first, then navigates webpage history, then returns the active tab to the browser home page before allowing the app to close.

Private sessions use WebView incognito mode, do not add local history, disable shared cookies for that view, and avoid persistent DOM storage. The app does not claim that private mode provides network anonymity.

## Storage

Android 10 and newer use MediaStore with `RELATIVE_PATH` and pending-item publication. Files are organized under:

```text
Movies/Video Downloader & Media Saver/Videos
Music/Video Downloader & Media Saver/Audio
Pictures/Video Downloader & Media Saver/Images
```

Users can select another folder through the Storage Access Framework. The app persists the granted URI permission. It does not request `MANAGE_EXTERNAL_STORAGE`.

## Player

The local player uses Media3. Standard controls provide play, pause, seek, rewind, fast-forward, playback speed, subtitles when present, audio track selection, and fullscreen orientation handling.

## Smart tools

Version 1 includes working on-device tools for duplicate detection, smart filenames, transparent quality recommendations, and storage review. Local subtitle generation is not exposed in this release because a production-ready speech model and native transcription pipeline are not bundled. No fake or inactive subtitle controls are shown.

## Advertising

Production identifiers:

- App: `ca-app-pub-7831002909037560~8100766073`
- Banner: `ca-app-pub-7831002909037560/6900288488`
- Interstitial: `ca-app-pub-7831002909037560/5474602730`
- Native advanced: `ca-app-pub-7831002909037560/3016883795`

Debug builds use Google's official test app ID and test ad units. Release builds use the production IDs. UMP consent is gathered before ad requests are enabled.

Banners collapse after an error. Native ads are labeled Sponsored. Interstitials are preloaded and can appear only at a natural transition after at least two completed downloads, three meaningful transitions, eight minutes between impressions, and no more than four times in one session. If an ad is unavailable, navigation continues immediately.

## Analytics and backend

The analytics base URL is `https://vd.server.oldalexhub.com`. The app posts one JSON event at a time to `/v1/events` with a four-second connection and read timeout. A bounded local queue keeps at most 100 events. Failures never block browser, download, library, player, or ad flows.

The production backend implementation is in the sibling [`server`](../server) repository. It includes the ingestion API, PostgreSQL event storage and retention indexes, local IP geolocation, authenticated reporting APIs, an admin dashboard, automated tests, Docker deployment files, and an Nginx configuration for `vd.server.oldalexhub.com`.

Events can contain:

- Random installation ID for approximate unique-user counts. The server stores only its keyed HMAC hash.
- Event time, app version, Android API level, locale, and time zone
- Download title and filename as text
- Source domain, never the full signed URL
- Media type, actual source quality, bytes, result, duration, and failure code
- Ad format and placement impression events

Performance analytics and Search & website insights are on by default and can each be disabled in Settings. When both are enabled, submitted browser search terms and visited website domains are sent for aggregate top-term and top-site reporting. Private sessions are excluded. Full visited URLs, paths, and query strings are never sent, and individual search and site values are hidden in the recent-event dashboard. Disabling Search & website insights removes queued search and site events.

The backend may derive approximate city and country from the request IP and then discards the IP without storing it. The app does not request Android location permission. Media bytes, cookies, authorization headers, browsing history, full source URLs, and page content are never included in analytics. Users can disable Performance analytics in Settings, which clears the pending analytics queue.

Expected event endpoint response: any HTTP 2xx status acknowledges the event. Other responses leave the event queued for a later app session.

## Privacy architecture

Download records, browser history, bookmarks, media metadata, and preferences are stored locally. WebView cookies remain in Android WebView storage and are used only for legitimate source requests. Sensitive session headers are not logged and are not sent to Old Alex Hub analytics.

Google AdMob may process advertising identifiers, approximate location, app interactions, diagnostics, and related advertising data depending on consent, configuration, and device settings. See [PRIVACYPOLICY.md](PRIVACYPOLICY.md).

## Safe areas and keyboard behavior

`SafeAreaProvider` wraps the application. The shell applies the top inset, while the bottom navigation applies the device bottom inset. Banners sit above the app navigation and collapse without reserving empty space. Browser toolbars and media controls remain inside the content region. Forms use resize-aware Android window behavior and keyboard-safe containers.

## Release automation

Run from the parent directory:

```powershell
python release.py --check-env
python release.py --skip-screenshots
```

Supported flags:

- `--skip-build`
- `--skip-screenshots`
- `--screenshots-only`
- `--clean`
- `--no-clean`
- `--generate-key-only`
- `--check-env`

The script detects Java and the Android SDK, updates `local.properties`, creates a 4096-bit release key when needed, builds a signed APK and AAB, and copies release materials to the sibling `releases` directory. The keystore and credentials remain under `android/keystore` and are ignored by Git. Back them up securely.

Primary Play artifact:

```text
releases/builds/VideoDownloader-release.aab
```

## Troubleshooting

- If Java is missing, install Android Studio or set `JAVA_HOME` to a JDK containing `java.exe` and `keytool.exe`.
- If the SDK is missing, install platform-tools, build-tools, and Android platform 36 or newer.
- If a resume request fails, the server may not support byte ranges or the source validator may have changed. Restart only after the app displays confirmation.
- If an authorized cookie-dependent download fails, reload the page, start playback once, and detect the media again before its session URL expires.
- If an ad does not load, the app intentionally collapses its ad container and continues normally.
- If the analytics server is unavailable, events remain in the bounded queue and core functionality continues normally.

## Google Play preparation

1. Host the completed privacy policy at a public HTTPS URL.
2. Review `store_assets/data-safety-notes.md` against the deployed server and AdMob configuration.
3. Complete AdMob app readiness and UMP messages.
4. Run production QA on gesture navigation and 3-button navigation.
5. Test direct MP4, audio, unencrypted HLS, supported progressive DASH, failures, pause, resume, process recreation, sharing, moving, renaming, and deletion.
6. Verify test ad units in debug and production IDs only in the signed release.
7. Upload the signed AAB from `releases/builds` to an internal testing track first.

## Copyright compliance

The app is a general media utility. It must not be marketed as a way to download paid, protected, or unauthorized content. It does not implement DRM circumvention, Widevine circumvention, paywall bypass, or a dedicated downloader for protected platforms.
