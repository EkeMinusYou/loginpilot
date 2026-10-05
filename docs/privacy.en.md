# Privacy and credential handling

Login Pilot monitors forms on HTTP and HTTPS pages. Its content script runs on all supported sites so it can also detect unregistered sites. Retrieving saved credentials and automatically submitting forms are restricted to origins registered by the user.

## Information stored on your device

| Key | Contents | When removed |
| --- | --- | --- |
| `registeredOrigins` | Origins allowed to use automatic login | When removed in the popup, or when the extension is uninstalled |
| `pendingSite` | The latest unregistered origin detected and its detection time | When that origin is registered, another candidate replaces it, or the extension is uninstalled |
| `language` | Display language preference: automatic, Japanese, or English | When replaced with another preference, or when the extension is uninstalled |

These values are stored in `chrome.storage.local`. They are not synchronized through Chrome Sync or sent to a developer-operated server. Browser and operating system backups follow their own settings. Login Pilot does not store complete forms, a list of browsing history, IDs, or passwords.

## How credentials are handled

1. With normal autofill, the content script checks values Chrome has placed in the page’s input fields.
2. For click-free retrieval, Login Pilot calls Chrome’s `navigator.credentials.get({ password: true, mediation })` on a registered origin. The returned ID and password are handled temporarily in the content script and entered into the page’s form.
3. Messages to the background process contain the origin and action information. They do not contain credentials.
4. When a form is submitted, its values are passed to the site’s own form handler and destination. Login Pilot does not redirect submissions to a developer-operated server.

Login Pilot does not use saved credentials for automatic login on unregistered sites, in iframes, on forms with new-password fields, or on forms with multiple password fields. It also does not automatically submit forms once you start entering details manually. It may add an `autocomplete` hint to a field without an existing hint to help identify the form.

“Never stores credentials” does not mean Login Pilot never reads them. Credentials are handled temporarily to fill and submit forms. Review the destination site’s security and submission behavior, as well as Google Password Manager’s storage and synchronization settings.

## External services

The extension contains no developer-operated server connections, analytics, advertising, or tracking code. Distribution and updates through GitHub and the Chrome Web Store use those services.

The landing page is hosted on Cloudflare and loads CSS and fonts from Google Fonts. Request information, such as your IP address, is processed by Cloudflare and Google when you open the landing page. The extension does not make these font requests.

The language selected on the landing page is stored in its `localStorage` under `loginpilot.lp.language`. This preference is separate from the extension’s language setting and is removed when you clear the site’s browser data. Opening a support link takes you to Buy Me a Coffee and uses that service.

For contact information and vulnerability reporting, see [SECURITY.md](../SECURITY.md).
