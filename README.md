# Video Downloader & Media Saver

Video Downloader & Media Saver is a free Android utility from Old Alex Hub. It provides a built-in browser that detects media exposed by supported websites, groups available qualities, downloads authorized media in the background, and organizes completed files in a local library.

The full downloader is free. There are no accounts, subscriptions, download credits, speed limits, or paid quality controls. Google AdMob supports the application. Ads are never required to begin a download or use a feature.

Only download media you own, have permission to download, or that the content provider makes available for downloading. The app does not bypass DRM, authentication, subscriptions, paywalls, or access controls. It does not include platform-specific extraction logic for protected services.

## Architecture

- React Native 0.88 with TypeScript for the application UI
- Kotlin native module for persistent downloads, SQLite records, storage, sharing, rename, move, and playback intents
- WorkManager long-running workers with foreground notifications for user-started downloads
- Android MediaStore for default scoped storage on Android 10 and newer
- Storage Access Framework for user-selected destination folders
- Media3 ExoPlayer for local video and audio playback
- React Native WebView with DOM, media element, source tag, fetch, XHR, MIME, extension, HLS, and DASH detection signals
- AsyncStorage only for small preferences, bookmarks, browser history, consent state, and ad frequency state
- Native SQLite for structured download and media records
- Google Mobile Ads and UMP for advertising and privacy choices
- Bounded, failure-tolerant analytics delivery to `https://vd.server.oldalexhub.com/v2/events/batch`
- Open the original page for saved downloads from Downloads and Library
- Device WebView identity with an installed-engine version and update shortcut in Settings
- HTTP error responses remain visible. Per-site compatibility mode pauses page filtering while keeping passive detection. Preferences persist for normal sessions and can be reset in Settings. Open in browser provides an external fallback.

No media file is proxied through an Old Alex Hub server. Download bytes flow directly from the source to the Android device.

## Requirements

- Windows 10 or Windows 11
- Node.js 22.13 or newer
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

Compatible unencrypted on-demand HLS/DASH use Media3 inspection and export with explicit track selection. Adaptive cache can preserve fetched bytes across interrupted exports. Finished output is checked for readable samples, seeking, duration and expected audio. Live, protected and multi-period streams are unsupported.

## Browser detection

The WebView detector observes media elements, source tags, metadata events, fetch responses, XHR responses, navigation requests, content types, URL extensions, manifest types, visible dimensions, activity, and page prominence. Results are deduplicated by URL and logical media group. Small images, common icon and tracking patterns, and low-confidence resources are filtered.

The built-in browser blocks scripted pop-up windows and removes common ad slots by default. This page-level filter does not block every ad network request and does not affect the app's own AdMob placements.

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

Banners collapse after an error and reserve space again when retrying. Native ads are labeled Sponsored. Failed ad loads retry with a 30-second to five-minute backoff while the app is active. Interstitials are preloaded and can appear only at a natural transition after at least two completed downloads, three meaningful transitions, eight minutes between impressions, and no more than four times in one session. If an ad is unavailable, navigation continues immediately. Dashboard load rate (loads/requests) and show rate (impressions/loads) are app telemetry estimates; AdMob reporting remains authoritative.

## Data & Privacy and backend

Operational measurements support reliability and advertising performance. Broader search, domain, playback and sanitized completed-download-link insights require affirmative consent. Withdrawal is in Settings. Migration preserves refusals and never interprets former default-on settings as consent. Private-session details, media bytes, credentials, cookies and page content are excluded from analytics.

Verified seven-day request codes support user-sent access/deletion drafts to info@oldalexhub.com. In-app deletion clears pending events, deletes current-installation server data and rotates the identifier without changing consent. Deploy the compatible backend before releasing this client. See [privacy policy](PRIVACYPOLICY.md) and [release gates](qa/RELEASE-GATES.md).

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
5. Test direct MP4, audio, unencrypted HLS, supported on-demand DASH, failures, pause, resume, process recreation, sharing, moving, renaming, and deletion.
6. Verify test ad units in debug and production IDs only in the signed release.
7. Upload the signed AAB from `releases/builds` to an internal testing track first.

## Copyright compliance

The app is a general media utility. It must not be marketed as a way to download paid, protected, or unauthorized content. It does not implement DRM circumvention, Widevine circumvention, paywall bypass, or a dedicated downloader for protected platforms.

## Quality-remake validation

See [fixtures and release gates](qa/RELEASE-GATES.md). Source changes and emulator tests do not imply a completed closed beta, Play submission, production deployment or measured profitability.
