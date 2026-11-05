# Android quality-remake acceptance and rollout

## Reproducible local corpus

Run `node qa/server.cjs` from the app directory. The server binds to loopback only on 8097 and serves original synthetic media. Forward device port 8097 to host port 8097 with Android platform tools, then open `http://127.0.0.1:8097/` in the app. Regenerate assets with `python scripts/generate-qa-media.py` (ffmpeg on PATH). Gradle generates the instrumentation JavaScript asset from the shipped detector source.

| Fixture | Required result |
| --- | --- |
| `/single` | Fifteen fetch observations plus native/DOM observations yield one content card, 360p and 720p; audio is verified independently of player mute |
| `/ads` | Red preroll rejected; teal content selectable; midroll never substitutes for content; reused player recovers |
| `/multiple` | Teal and blue players remain distinct |
| `/embedded` | Cross-origin iframe observations carry frame identity on supported WebViews |
| `/popup` | Deliberate child returns to opener; unsolicited popup has no history effect |
| `/spa` | Address/history changes preserve the actual page; stale media cannot cross documents |
| `/hls`, `/dash` | Compatible video/audio exports remain readable and seekable |
| `/fake`, `/expired` | HTML / HTTP 403 cannot become ready or complete |
| `/error`, `/redirect` | 503 response remains visible; redirect preserves history |

Run app typecheck, lint and Jest; server check and tests; Gradle `:app:testDebugUnitTest`, `:app:assembleDebug`, `:app:assembleDebugAndroidTest`. Install the debug app and test APK. Run AndroidJUnitRunner with instrumentation argument `fixtureUrl=http://127.0.0.1:8097`. Fixture-dependent tests are explicitly skipped when this argument is absent. Do not report a skipped corpus as passed. Debug permits local HTTP fixtures; release traffic policy remains HTTPS.

## Supported coverage and limitations

Progressive readable video/audio and compatible unencrypted on-demand HLS/DASH are candidates for export. Selection stores exact track identity; changed tracks require fresh inspection. Multi-period adaptive streams, live recording and protected media are unsupported. Image inspection is bounded to 16 MiB. HTML, timeout and failed probes stay uncertain/expired/unsupported. A muted player does not imply missing file audio.

All-frame document-start injection is used only where AndroidX reports support. Native observations supplement DOM, fetch/XHR and timing observations; WebView does not expose every request, redirect, worker resource or blob stream. Unassociated resources stay under Additional results. No universal website support claim is permitted. See [WebViewClient API](https://developer.android.com/reference/android/webkit/WebViewClient).

Normal tab state is stored locally; at most three WebViews stay live. Private tab state is memory-only. Private mode excludes history/behavioral analytics but is not a separate browser profile or a guarantee of cookie isolation between all tabs. Renderer restoration and scroll position require device validation, especially with dynamic pages.

## Evidence and remaining release gates

Automated app/server suites, JVM verification and emulator instrumentation are part of every candidate. Record exact results in the release ticket. Component tests do not replace app/device interaction testing.

Before promotion, run API 24, 29, 33 and 36; gesture and three-button navigation; large text/TalkBack; a low-memory physical device. Cover independent tab Back/Forward, four-tab eviction, opener closure, app backgrounding/recreation, renderer loss, SPA changes, authentication popups, redirects and certificate rejection. Exercise pause/resume, non-resumable restart confirmation, process death during export, offline queues/network changes, expired links, insufficient storage, revoked folder access, duplicate cleanup, playback seeking and audio. Test privacy access/deletion/withdrawal, offline retries and ad dismissal without navigation loss.

API 36.1 emulator evidence alone does not satisfy this matrix. No reported failing public URLs were supplied; add each user-reported site to permanent regressions with its engine version and a safe, reproducible fixture.

## Backend and policy deployment

Deploy additive backend migrations first; retain V1 compatibility. Verify possession-code support, authenticated fulfillment, in-app deletion/tombstones, hourly retention, backup expiration and currency-specific dashboard reporting. Publish the matching privacy policy and review Play Data Safety at the same release boundary. Files in `store_assets` are drafts, not Play Console submissions. See the server privacy operations runbook.

## Advertising baseline and rollout

All features remain free. Start with native Home/Library and anchored Downloads/Tools placements, at most one per screen. Interstitials require two successful downloads in the current session, three meaningful transitions, eight minutes between impressions and no more than four per session. Browsing, selection, playback, privacy and recovery remain uninterrupted. UMP controls requests; ad failure never gates a capability.

Collect 14 complete days before changing frequency. Review request/fill/impression/paid-event currency and precision against AdMob reporting. Set operating costs explicitly; missing costs mean unknown contribution, never zero-cost profitability. Compare revenue/active user, revenue/successful download, successful-download rate and D7 retention by app version and cohort. Predefine the sample target and meaningful retention/success decline before starting one placement change at a time. Low-volume results remain inconclusive; never declare a winner from revenue alone.

After internal device QA, run a closed beta. Promote through 5%, 25%, then 100%, observing each stage for at least 48 hours. Stop promotion for wrong-video downloads, lost history, corrupt completed files, consent violations or data loss. Remote `killSwitches.interstitials`, `enhancedDetection` and `adaptiveDownloads` can disable the corresponding new behavior. Expired configuration falls back to bounded bundled defaults. Do not enable a forced update before the matching Play build is available.
