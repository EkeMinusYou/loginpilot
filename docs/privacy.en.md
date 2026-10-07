# Privacy and credential handling

Login Pilot monitors forms on HTTP and HTTPS pages. Its content script runs on all supported sites so it can also detect unregistered sites. Retrieving saved credentials and automatically submitting forms are restricted to origins registered by the user.

## Information stored on your device

| Key | Contents | When removed |
| --- | --- | --- |
| `registeredOrigins` | Origins allowed to use automatic login | When removed in the popup, or when the extension is uninstalled |
| `passkeyOrigins` | Registered origins whose passkey sign-in button may be activated automatically | When removed from registered sites or the extension is uninstalled |
| `passkeyFrameOrigins` | The authentication frame origin approved for each parent site | When site registration is removed, replaced with another authentication origin or a top-level flow, or the extension is uninstalled |
| `federatedProviders` | The external login provider approved for each registered origin | When site registration is removed or the extension is uninstalled |
| `pendingSite` | The latest candidate origin, detection time, and method; password submission or passkey completion and frame-origin hints; or the external provider and whether its sign-in button was manually clicked | When that origin is registered, another candidate replaces it, or the extension is uninstalled |
| `language` | Display language preference: automatic, Japanese, or English | When replaced with another preference, or when the extension is uninstalled |

These values are stored in `chrome.storage.local`. They are not synchronized through Chrome Sync or sent to a developer-operated server. Browser and operating system backups follow their own settings. Login Pilot does not store complete forms, a list of browsing history, IDs, or passwords.

## How credentials are handled

1. With normal autofill, the content script checks values Chrome has placed in the page’s input fields.
2. On page load or registration, Login Pilot calls Chrome’s `navigator.credentials.get({ password: true, mediation })` on a registered origin. The returned ID and password are handled temporarily in the content script and entered into the page’s form.
3. Messages to the background process contain the origin and action information. They do not contain credentials.
4. When a form is submitted, its values are passed to the site’s own form handler and destination. Login Pilot does not redirect submissions to a developer-operated server.

Login Pilot does not use saved passwords for automatic login on unregistered sites, in iframes, on forms with new-password fields, or on forms with multiple password fields. It also does not automatically submit forms once you start entering details manually. A password-form submission can offer registration after manual input. Only the origin and an attempt flag are sent to the background, never field values. Submission is a hint of an attempt, not proof of login success. Registering after submission applies to the next visit without submitting again immediately. It may add an `autocomplete` hint to a field without an existing hint to help identify the form.

“Never stores credentials” does not mean Login Pilot never reads them. Credentials are handled temporarily to fill and submit forms. Review the destination site’s security and submission behavior, as well as Google Password Manager’s storage and synchronization settings.

## Passkeys

On registered sites configured for passkey login, Login Pilot activates an explicit passkey sign-in button. The site itself starts WebAuthn authentication; Chrome or the operating system handles verification and account selection. The extension does not retrieve or store passkeys or read private keys, authentication challenges, signatures, account identifiers, or authentication payloads. It does not create or modify authentication requests or skip user verification.

To offer registration after passkey use, Login Pilot adds a completion observer to the page’s `navigator.credentials.get()` method. It temporarily checks the request mode, whether a credential allow list is present, and whether the result is an authentication response. It preserves the original arguments, return value, and success or failure. Only a usage-detected signal crosses into the extension, never an authentication payload. The signal is a registration hint: no origin is registered until you confirm in the popup. The login method of a registered site stays unchanged; changing it requires removing the site and registering it again. The extension does not verify server-side sign-in success. Registration after usage permits automatic activation on your next visit without starting another authentication immediately.

Passkey button detection runs in secure pages and frames. A button alone does not offer registration; completed passkey usage is required. For a frame, Login Pilot checks the parent page’s origin and authentication origin and verifies the frame’s visibility through the parent page. A usage-completed hint may also come from the same document and parent-site pair verified within the last 15 seconds if the site has just closed the authentication frame. This exception never authorizes automatic activation. The authentication origin is shown in the popup before registration; automatic activation is restricted to the combination approved by the user. Target tab, frame, and document identifiers are handled temporarily in background memory and are not stored persistently.

Login Pilot does not automatically retry after cancellation or switch to password login. Password retrieval and automatic form submission are disabled on sites configured for passkey login. For email fields and fields marked `autocomplete="username"`, automatic activation waits until input has settled for 300 milliseconds. Other page interactions or the Escape key stop automatic activation. Usage-detected signals are only registration hints and do not stop automatic activation.

## External login

For an external-login registration, Login Pilot activates a recognized sign-in button or link for the provider detected from the user’s manual sign-in click. The site and provider handle the authentication request, account selection, consent, and verification. Login Pilot does not retrieve tokens, account identifiers, or authentication responses, construct OAuth URLs, or alter those requests. It stores only the registered origin and provider name. Password retrieval and automatic form submission are disabled for these registrations.

To offer registration, Login Pilot observes a trusted manual click on a recognized provider button; button detection alone does not offer registration. That click is a hint that authentication was started, not proof of completion or server-side success. No site is registered or provider changed without confirmation in the popup. Registration after a manual click takes effect on the next visit. Automatic activation is limited to one attempt per page load, stops after manual interaction, and does not retry cancellation or choose another provider. Detection and activation are limited to secure top-level pages.

## External services

The extension contains no developer-operated server connections, analytics, advertising, or tracking code. Distribution and updates through GitHub and the Chrome Web Store use those services.

The landing page is hosted on Cloudflare and loads CSS and fonts from Google Fonts. Request information, such as your IP address, is processed by Cloudflare and Google when you open the landing page. The extension does not make these font requests.

The language selected on the landing page is stored in its `localStorage` under `loginpilot.lp.language`. This preference is separate from the extension’s language setting and is removed when you clear the site’s browser data. Opening a support link takes you to Buy Me a Coffee and uses that service.

For contact information and vulnerability reporting, see [SECURITY.md](../SECURITY.md).
