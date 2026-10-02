# Google Play data safety notes

These notes are preparation material, not legal advice. Confirm the final answers against the deployed analytics server, AdMob configuration, retention policy, privacy policy URL, and Play Console definitions.

## Old Alex Hub analytics

Endpoint: `https://vd.server.oldalexhub.com/v1/events`

Potentially collected:

- App interactions: app open, player open, feature and ad impression events
- User IDs: random installation identifier that is not an account identifier
- Files and docs metadata: download title and filename as text, media type, quality, and byte counts
- Diagnostics and performance: duration, outcome, failure code, Android API level, and app version
- Approximate location: city and country may be derived by the server from the request IP
- Search & website insights (optional, off by default): submitted browser search terms and visited website domains, only when the user enables this separate setting; private sessions are excluded

Purposes:

- Analytics
- App functionality and reliability
- Advertising performance measurement for app-side impression counts

User control:

- Performance analytics can be disabled in Settings.
- Search & website insights is off by default, has a separate Settings switch, and is used for aggregate top-term and top-site reports.
- Disabling Search & website insights removes queued search and site events from the device.
- Disabling analytics clears the pending local analytics queue.
- Core functionality does not depend on analytics availability.

Not sent to Old Alex Hub analytics:

- Downloaded media bytes or media content
- Cookies or authorization headers
- Full source URLs or signed URL query strings
- Full browser history, visited page paths, and page URL query strings
- Contacts, microphone, camera, precise location, messages, or financial information

## Google AdMob and UMP

Google Mobile Ads may collect or share device identifiers, approximate location, app interactions, ad interactions, diagnostics, and other advertising data. Declare these categories according to Google's current Mobile Ads data disclosure guidance and the exact consent configuration.

## Local data

Media, download records, browser history, bookmarks, WebView cookies, preferences, hashes, and temporary fragments are stored on the device. Local-only data that is never transmitted may fall outside Play's collected-data definition, but it is disclosed in the privacy policy for transparency.

## Security and deletion

- Analytics is sent over HTTPS.
- Users can clear local browser and app data.
- Raw Old Alex Hub analytics events are retained for up to 24 months, then deleted or retained only in aggregated form without an installation identifier.
- Provide a support process for analytics access or deletion requests tied to an installation ID where technically feasible.
