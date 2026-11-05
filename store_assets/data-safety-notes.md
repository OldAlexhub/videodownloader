# Google Play Data Safety release checklist

These are draft declarations for the quality-remake build. Reconcile them with the deployed backend, hosting logs, AdMob SDK and consent configuration before submission. Do not copy older default-on browser-insights declarations.

| Data category to review in Play Console | Collection and purpose | Choice |
| --- | --- | --- |
| Device or other IDs / installation reference | Pseudonymous installation reference, keyed hash in PostgreSQL; analytics and verified requests | Operational collection; preserve prior refusals |
| App interactions / diagnostics | Sessions, detection/download outcomes, failures, version, Android API, locale/time zone; reliability | Operational collection |
| In-app search history / web browsing | Search terms, visited domains, sanitized completed-download page/media links (paths included, query/fragment/userinfo excluded); product insights | Affirmative Insights consent, withdraw in Settings |
| App interactions / playback | Playback duration, completion, seeking and buffering | Affirmative Insights consent; private sessions excluded |
| Approximate location | Server derives approximate city/country from request IP; no GPS permission | Operational analytics; audit host logs separately |
| Advertising data | AdMob identifiers, approximate location, interactions and diagnostics; app measures requests, fill, impressions and paid value/currency/precision | UMP and applicable regional choices |

Current analytics endpoint: `POST https://vd.server.oldalexhub.com/v2/events/batch`. V1 remains compatible with installed older clients; their historical title/filename fields remain until deletion/retention expiry. Current V2 clients reject media bytes, cookies, credentials, page content, titles and filenames. A link path is browsing information even after its query is removed; do not declare that no links are collected.

All capabilities remain free regardless of behavioral consent. New installs and migrated default-on settings do not constitute affirmative consent. Existing refusals remain refused. Private-session searches, domains, links and playback details are excluded. Local download files/history/bookmarks/session state are disclosed in the policy but are not analytics uploads.

Request my data / Request data deletion prepare user-sent email drafts to info@oldalexhub.com with a verified, seven-day code. Copy details if no email app exists. In-app deletion clears uploads, deletes current-installation events and rotates the identifier while preserving consent. Public installation references alone cannot authorize exports. Legacy identities require separate verification.

Raw retention: maximum 730 days, hourly scheduled cleanup. Release operations must configure backup expiry of at most 30 days and replay tombstones before a restored database accepts traffic. Keep tombstones separate from raw analytics retention. Hosting logs and support email need their own documented retention.

Before submission: host the matching policy on HTTPS, validate all declarations against [Play User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311), review [AdMob privacy integration](https://developers.google.com/admob/android/privacy), test consent/withdrawal and confirm the deployed support and deletion APIs. These repository drafts do not change Play Console or publish a policy.
