# Privacy Policy for Video Downloader & Media Saver

Developer: Old Alex Hub
Contact: info@oldalexhub.com
Revision: Android quality-remake release (publish alongside the corresponding app and backend)

## The service

Video Downloader & Media Saver is a free, advertising-supported Android browser, downloader and local media library. No Old Alex Hub account is required. Every capability remains available without subscriptions, credits, speed limits imposed by the app or rewarded-ad gates.

## On your device

The app stores download records and files, source links, temporary fragments, bookmarks, normal browser history and tab navigation state, playback position, cookies, site storage and preferences. Normal tabs can be restored after app recreation. Private tab navigation state stays in memory and private searches, domains, links and playback details are excluded from Old Alex Hub analytics. Files you deliberately download in private browsing remain on the device. Private browsing does not provide anonymity to websites or network operators, or guarantee isolation of every WebView cookie across tabs.

Settings provides local cleanup controls. Removing a library record and deleting its file are separate actions; file deletion requires confirmation. Saved files may also be managed by Android and by the destination folder's provider.

## Old Alex Hub data collection

The app sends structured events over HTTPS to https://vd.server.oldalexhub.com. Operational collection covers app sessions, feature use, detection and download outcomes, byte counts, coded failures, app/Android versions, locale, time zone and advertising performance. These measurements support reliability and the sustainable operation of the free app. Existing choices to refuse operational collection are preserved during upgrades.

Broader behavioral collection is off until you affirmatively choose Allow insights. This purpose includes submitted browser search terms, visited domains, playback measurements and sanitized page/media links for completed downloads. You can decline or withdraw in Settings > Insights consent without losing any feature. Withdrawal clears queued events and prevents new behavioral transmission. An upload already received by the service is handled through the deletion controls below. Private sessions are excluded from behavioral collection even when consent is granted.

Completed-download links can include their path. User information, all query parameters and fragments are removed; links that cannot be sanitized are discarded. The service does not receive downloaded media bytes, page content, cookies, credentials or authorization headers. Current clients do not send titles or filenames. Older 1.x clients may have sent title/filename metadata under their former disclosure.

An installation reference identifies events without an account. This is pseudonymous, not anonymous. The server stores a keyed hash of that reference. It may derive approximate city/country from the request IP in memory; application analytics storage does not retain raw IP addresses. Hosting infrastructure may maintain separate access/security logs subject to its configured retention. The app does not request precise location for analytics.

Delivery uses a bounded queue. Losing network access or refusing behavioral consent does not block browsing, downloads, playback or tools.

## Access and deletion

Settings > Request my data and Request data deletion prepare email drafts addressed to info@oldalexhub.com. Online generation supplies an installation reference and a purpose-bound verification code, valid for seven days. You review and send the draft yourself. Copyable request details are available when an email app is unavailable. A public installation reference alone does not authorize disclosure. Support must authenticate and verify the code before exporting or deleting data. Older installation references require a separate support verification process; they do not become verified merely by appearing in an email.

Delete server analytics performs immediate online deletion for the current installation, clears pending uploads and rotates the installation reference without changing consent choices. An offline or failed request is reported as unsuccessful so you can retry. A deletion tombstone prevents late retries from restoring deleted events. This minimal keyed reference is retained for replay prevention, separately from raw event data.

Raw events are retained for a maximum of 730 days, with scheduled deletion at least hourly while the service is running. Expired request codes are removed on the same schedule. Deployment must enforce a maximum backup lifetime of 30 days and reapply deletion tombstones before restoring a backup into service. Backup expiration is a release requirement, not an app setting. Support email correspondence is separate from app analytics and is used to fulfill and document the request.

## Advertising

Google AdMob and User Messaging Platform provide advertising and consent choices. Depending on consent, region and device settings, Google and its partners may process advertising identifiers, approximate location, IP address, device information, app/ad interactions, diagnostics and consent choices. See https://policies.google.com/privacy for Google's practices. Required UMP privacy options remain available in Settings.

Native ads are labeled on browser Home and Library; Downloads and Tools use anchored banners. The app shows at most one placement per screen. Eligible interstitials occur at deliberate transitions after completed tasks, never to unlock a capability. Browsing, selection, playback, privacy requests and recovery do not trigger interstitials. Unavailable ads do not delay navigation. Website ads are separate from app advertising.

## Security and contact

Analytics transport uses HTTPS. Support endpoints require authenticated access and a verified request code. Web browsing never bypasses certificate errors. No system can promise absolute security; report privacy concerns or access/deletion requests to info@oldalexhub.com.

Publish this policy and the matching Play Data Safety declaration with the release. Material collection changes require an updated disclosure and, where applicable, a fresh consent choice.
