# User guide

See the [README](../README.md#install-from-source) for installation. The Chrome Web Store release is still in preparation.

## Register a site

Open the site's login page, then open Login Pilot's popup. Autofill detection or an explicit passkey sign-in button can produce a registration candidate. Check the displayed origin and login method before choosing **Register and enable auto login**.

An origin consists of the scheme, host, and port. Registration applies to other login pages on the same origin. Automatic login does not run on unregistered sites.

If there is no candidate, choose **Register this site**, select the login method, and confirm. Manual registration defaults to Password. A registered site's method is read-only: remove the site and register it again to change methods. Existing password registrations remain password registrations when passkey use is detected.

Remove a site from the registered list to disable automatic login. Reload the extension and login page after updating the extension.

## Password login

On a registered site, Login Pilot attempts to submit a supported form once Chrome autofill has populated it. Chrome can display autofill without exposing the field values to the page until a user interaction occurs. To support login without that extra interaction, Login Pilot also tries the Credential Management API on registered sites.

This retrieval requires HTTPS or a secure localhost context. Click-free retrieval is available when exactly one matching account is saved and Chrome's **Sign in automatically** setting is enabled. Multiple accounts, device verification, browser refusal, or site behavior can prevent retrieval; in that case, Login Pilot waits for normal autofill.

Registration may trigger Chrome's account and automatic sign-in confirmation. Approve it in Chrome. Future visits use `mediation: 'silent'`; registration uses `mediation: 'optional'` only when autofill is not already confirmed. There is no separate start button, debugger connection, or helper application.

Login Pilot leaves the page's focus in place. It does not overwrite or submit a form after manual input has started. Autofill detection combines field values, input events, and autofill pseudo-classes because Chrome does not expose a complete input-source detection API.

## Passkey login

Login Pilot can detect an explicit passkey sign-in button or completed passkey authentication and offer registration. Detection is only a hint: it does not register a site or change its saved method automatically.

After registration, Login Pilot activates the site's own passkey sign-in button. Chrome or the OS handles account selection and user verification, such as a fingerprint, face scan, or PIN. Login Pilot does not create or modify WebAuthn requests. A passkey creation or cancelled request is not treated as completed passkey use.

Registration immediately after completed passkey use does not trigger another authentication. Automation starts on the next visit. A detected usage signal does not prove that the site's server accepted the login.

For an authentication iframe, registration approves the parent origin and the displayed authentication origin as a pair. The same authentication origin embedded by a different parent requires separate approval.

On registered sites, activation waits until email or `autocomplete="username"` input has settled for 300 milliseconds. Page changes trigger another check; a 250-millisecond fallback detects changes in layout or CSS. Other page interactions or Escape stop automatic activation. Usage-detected signals update candidates without stopping activation.

Automatic activation is limited to one attempt per page load. Cancelling does not trigger a retry or a switch to password login. Reload the page to try again.

## Supported conditions and limitations

| Flow | Supported conditions | Limitations |
| --- | --- | --- |
| Password | Ordinary username/password `form` elements on HTTP/HTTPS pages; Credential Management API retrieval only in secure contexts | Forms with `autocomplete="new-password"` or multiple password fields are excluded. Password forms in iframes, Shadow DOM, pages without a `form`, and separate username/password steps are not supported. |
| Passkey | One explicit Japanese or English sign-in button on a secure page, including an approved visible authentication iframe | Creation, registration, and management buttons are excluded. Multiple candidates, nested iframes, Shadow DOM, and sites requiring an actual user gesture are not supported. |
| Passkey usage detection | A completed site authentication request that the page observer can identify | Detection can be unavailable when the site replaces the authentication API or uses a credential allow list without an explicit passkey button. Detection alone cannot automate a generic login button on the next visit. |
| Additional verification | Chrome/OS verification and site prompts remain available | Two-factor authentication and CAPTCHA require manual completion. |

Form intent cannot always be identified accurately. Review the site and login form before registering it. An automatic submission or button activation is an attempt, not confirmation of successful login.

## Permissions and data

| Permission or access | Purpose |
| --- | --- |
| Content scripts on HTTP/HTTPS sites | Detect login forms, autofill, and passkey candidates, including on unregistered sites. Password retrieval and automatic login are restricted to registered origins. |
| `activeTab` | Read the active tab's URL when opening the popup. |
| `notifications` | Notify you of registration candidates. |
| `storage` | Keep registrations, login methods, approved authentication origins, the latest candidate, and language preferences on the device. |

Credentials are handled temporarily in the page and passed to the destination site's form handler when submitted. They are not stored by the extension or sent to its background process or a developer-operated service. The extension has no analytics, advertising, or tracking code. See the [privacy policy](privacy.en.md) ([日本語](privacy.md)) for details, including passkey observation and external website services.

## Language

Choose Automatic, English, or Japanese in the popup's footer. Automatic follows Chrome's display language. The preference is stored locally and also applies to notifications.

The landing page has its own language selector and stored preference; it is independent of the extension.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| No password registration candidate | Confirm Chrome autofill is available and the page has a supported form. Reload the page. Browser restrictions can defer autofill confirmation until a page interaction. You can also register the current site manually. |
| Click-free password retrieval is unavailable | Check HTTPS, exactly one matching saved account, and Chrome's **Sign in automatically** setting. Normal autofill is used if retrieval is unavailable. |
| Fields are filled but the form is not submitted | Check for manual input, multiple password fields, additional verification, or a disabled submit button. Use manual login if the site blocks automation. |
| Passkey verification does not start | Check the saved login method, explicit button, approved parent/authentication origins, and whether other page interactions stopped activation. Reload after cancellation. Sites requiring an actual user gesture may need manual login. |
| The extension stopped working after an update | Reload it in `chrome://extensions`, then reload the login page. |

For bugs, open an [issue](https://github.com/EkeMinusYou/loginpilot/issues/new/choose) with sanitized reproduction steps. Use [SECURITY.md](../SECURITY.md) to report vulnerabilities privately.
