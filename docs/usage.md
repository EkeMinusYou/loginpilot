# User guide

See the [README](../README.md#install-from-source) for installation. The Chrome Web Store release is still in preparation.

## Register a site

Sign in once on the site. Login Pilot offers registration after password autofill or a password-form submission, completed passkey authentication, or a manual click on a recognized external-provider sign-in button. Open the popup, check the detected origin and login method, and choose **Register and enable auto login**. Merely visiting a page or finding a sign-in button does not offer registration.

An origin consists of the scheme, host, and port. Registration applies to other login pages on the same origin. Automatic login does not run on unregistered sites.

If there is no candidate, sign in normally on a supported login page and reopen the popup. There is no manual registration or method selector. A candidate remains associated with the origin where the activity was detected, even after a redirect. Registering a usage candidate enables the next visit without repeating authentication immediately. A registered site's method is read-only: remove it, use the desired login method, and register the resulting candidate to change methods. Existing registrations remain unchanged when another method is used.

Remove a site from the registered list to disable automatic login. Reload the extension and login page after updating the extension.

## Password login

On a registered site, Login Pilot attempts to submit a supported form once Chrome autofill has populated it. Chrome can display autofill without exposing the field values to the page until a user interaction occurs. To support login without that extra interaction, Login Pilot also tries the Credential Management API on registered sites.

This retrieval requires HTTPS or a secure localhost context. Click-free retrieval is available when exactly one matching account is saved and Chrome's **Sign in automatically** setting is enabled. Multiple accounts, device verification, browser refusal, or site behavior can prevent retrieval; in that case, Login Pilot waits for normal autofill.

Registration may trigger Chrome's account and automatic sign-in confirmation. Approve it in Chrome. Future visits use `mediation: 'silent'`; registration uses `mediation: 'optional'` only when autofill is not already confirmed. There is no separate start button, debugger connection, or helper application.

Disabled, hidden, or ambiguous submit controls defer submission until a single available control can be used. A disabled control never falls back to direct form submission. The form and retained fields are rechecked after asynchronous work and page input/change handlers; registration changes cancel pending work.

Login Pilot leaves the page's focus in place. It does not overwrite or submit a form after manual input has started. Autofill detection combines field values, input events, and autofill pseudo-classes because Chrome does not expose a complete input-source detection API.

## Passkey login

Login Pilot offers registration after completed passkey authentication. An explicit sign-in button alone does not offer registration. Usage detection is only a hint: it does not register a site or change its saved method automatically.

After registration, Login Pilot activates the site's own passkey sign-in button. Chrome or the OS handles account selection and user verification, such as a fingerprint, face scan, or PIN. Login Pilot does not create or modify WebAuthn requests. A passkey creation or cancelled request is not treated as completed passkey use.

Registration immediately after completed passkey use does not trigger another authentication. Automation starts on the next visit. A detected usage signal does not prove that the site's server accepted the login.

For an authentication iframe, registration approves the parent origin and the displayed authentication origin as a pair. The same authentication origin embedded by a different parent requires separate approval.

On registered sites, activation waits until email or `autocomplete="username"` input has settled for 300 milliseconds. Page changes trigger another check; a 250-millisecond fallback detects changes in layout or CSS. Other page interactions or Escape stop automatic activation. Usage-detected signals update candidates without stopping activation.

Registration changes invalidate cached policy. The fast fallback checks cached candidate availability; unchanged unregistered sites do not repeatedly query the background worker. Permission and authentication-frame visibility are checked before activation without requiring temporary access to the tab URL.

Automatic activation is limited to one attempt per page load, including the immediate registration action. Cancelling does not trigger a retry or a switch to password login. Reload the page to try again.

## External login

Login Pilot can activate explicit Google, Apple, Facebook, X / Twitter, Microsoft, and GitHub sign-in buttons and links. Click the provider's sign-in button once, then confirm its registration candidate in the popup. The detected provider is saved per origin. For example, click **Continue with Google** on Buy Me a Coffee's login page and register the resulting Google candidate to activate that button automatically on future visits.

Button detection alone never produces a registration candidate. A trusted manual click on a recognized provider button produces a candidate, even if the site immediately navigates away. This means authentication was started, not that it succeeded. Registering that usage candidate applies to your next visit without repeating the click immediately.

Only the saved provider is activated. A registered site's method and provider stay unchanged; remove it and register it again to change them. Password retrieval and submission are disabled for external-login registrations. Account selection, consent, two-factor authentication, and identity verification remain on the provider's screen.

Activation waits until the page has loaded and the button is visible and enabled. It runs once per page load and stops after manual page interaction. Cancellation does not trigger another attempt or a switch to a different provider. The extension clicks the site's own button; it does not construct OAuth URLs, intercept tokens, or alter authentication requests. Embedded provider frames, Shadow DOM, icon-only buttons without accessible labels, and flows that require a genuine user gesture are outside the supported scope.

## Supported conditions and limitations

| Flow | Supported conditions | Limitations |
| --- | --- | --- |
| Password | Ordinary username/password `form` elements on HTTP/HTTPS pages; Credential Management API retrieval only in secure contexts | Forms with `autocomplete="new-password"` or multiple password fields are excluded. Password forms in iframes, Shadow DOM, pages without a `form`, and separate username/password steps are not supported. |
| Passkey | One explicit Japanese or English sign-in button on a secure page, including an approved visible authentication iframe | Creation, registration, and management buttons are excluded. Multiple candidates, nested iframes, Shadow DOM, and sites requiring an actual user gesture are not supported. |
| Passkey usage detection | A completed site authentication request that the page observer can identify | Detection can be unavailable when the site replaces the authentication API or uses a credential allow list without an explicit passkey button. Detection alone cannot automate a generic login button on the next visit. |
| External login | A single available button or link for the saved provider on a secure top-level page, with an explicit Japanese or English sign-in label | The provider is detected from a manual click before registration. Multiple matching buttons, embedded frames, Shadow DOM, and flows requiring a genuine user gesture are not supported. |
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

## Find a registered site

Use **Search registered sites** above the registered list to filter origins as you type. Matching ignores case and surrounding spaces. The count shows matching and total sites; clear the search to restore the full list. You can remove a site from the filtered results. The query stays in the open popup while changing language or removing sites and is not saved to extension storage.

## Language

Choose Automatic, English, or Japanese in the popup's footer. Automatic follows Chrome's display language. The preference is stored locally and also applies to notifications.

The landing page has its own language selector and stored preference; it is independent of the extension.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| No password registration candidate | Confirm Chrome autofill is available and the page has a supported form. Reload the page. Browser restrictions can defer autofill confirmation until a page interaction. Alternatively, submit the supported login form manually and register the detected candidate. |
| Click-free password retrieval is unavailable | Check HTTPS, exactly one matching saved account, and Chrome's **Sign in automatically** setting. Normal autofill is used if retrieval is unavailable. |
| Fields are filled but the form is not submitted | Check for manual input, multiple password fields, additional verification, or a disabled submit button. Use manual login if the site blocks automation. |
| Passkey verification does not start | Check the saved login method, explicit button, approved parent/authentication origins, and whether other page interactions stopped activation. Reload after cancellation. Sites requiring an actual user gesture may need manual login. |
| External login does not start | Confirm the registration uses External login and the right provider. If it was registered for Password or Passkey, remove it, click the desired provider manually, and register that candidate. Check the button is visible, enabled, and unambiguous, then reload without interacting with the page. |
| The extension stopped working after an update | Reload it in `chrome://extensions`, then reload the login page. |

For bugs, open an [issue](https://github.com/EkeMinusYou/loginpilot/issues/new/choose) with sanitized reproduction steps. Use [SECURITY.md](../SECURITY.md) to report vulnerabilities privately.
