# Browser review

Use a temporary Chrome profile dedicated to testing. Do not sign it into Chrome or enable synchronization. Save only dummy accounts and avoid importing real account cookies or passwords.

Run `npm run build` and load `.output/chrome-mv3` through `chrome://extensions`. Reload both the extension and target page after extension changes. Automated tests and browser checks provide different evidence; record which checks you actually completed.

## Automated integration coverage

Run `npm run zip`, `npm run package:verify`, `npx playwright install chromium`, and `npm run test:browser`. On Linux, install browser dependencies with `npx playwright install --with-deps chromium` first. CI and Prepare release run these checks automatically.

Tests use a fresh Chromium profile, localhost fixtures on ports 4175 and 4176, and generated dummy WebAuthn credentials. They cover disabled/hidden controls and enabled-state transitions, synchronous form mutation, duplicate submission, removal and navigation, content-script invalidation during extension reload, automatic passkey activation/completion/cancellation, visible approved authentication frames without tab URL access, and rejection of registration commands from an ordinary extension tab. Unit regressions cover concurrent authorized popup registration/removal and method/frame consistency. The actual popup UI is covered by unit tests and the manual keyboard checks below.

The test harness installs only the production build through Chromium's [Extensions protocol](https://chromedevtools.github.io/devtools-protocol/tot/Extensions/). It closes the browser and removes its temporary profile after each test. Test-installed unpacked extensions can be unloaded by `runtime.reload`; the lifecycle test verifies that the old script stops. A separate page-reload check confirms that a fresh document can submit once. The extension itself does not use the debugger API. Failure traces in `test-results/` contain only fixtures and are not packaged.

Virtual WebAuthn verifies the authentication request and cancellation path; it does not reproduce the actual Chrome/OS account chooser or biometric screen. The tests use dummy prefilled password fields, not Google Password Manager's real native autofill. Complete the manual checks below for those behaviors before a release.

## Password fixture

Run `npm run browser:fixture` and open `http://127.0.0.1:4174`. The fixture does not send entered values externally; it displays a submission count. Add a dummy account for that origin to Chrome's password manager to test browser autofill.

| Scenario | Expected behavior |
| --- | --- |
| Chrome autofills an unregistered login form | No automatic submission; a registration candidate appears in the popup |
| Register a candidate in the popup | The origin is saved and submission is attempted on the current page |
| Reload a registered login form | Once autofill is confirmed, submission occurs once |
| Register before autofill is confirmed | If Chrome supports retrieval, initial confirmation is followed by retrieval and submission; no separate start button |
| Start manual input or paste | No overwrite or automatic submission |
| Open a sign-up or password-change form | No saved credential retrieval, input, or automatic submission |
| The form changes to new-password while a policy/credential request is pending | No filling or submission |
| Submit control is disabled or hidden | Wait until it is available; never fall back to direct submission |
| Reload the extension while a request is pending | The old content script does not fill or submit |
| Remove an origin and reload | No automatic submission |
| Open a password login form in an iframe | No automatic submission |
| Save multiple matching accounts | If Chrome refuses silent retrieval, normal autofill is awaited |

Use Tab and Enter to register and remove sites. Check long origins, error feedback, no registrations, and scrolling with many registered sites. Inspect any screenshots captured for visual review.

## Passkey fixtures

Keep the fixture server running and open `http://localhost:4174/passkey`. Use `localhost`, not `127.0.0.1`, because WebAuthn RP IDs cannot be IP addresses. Manually create a dummy test passkey with the fixture's creation button. Private keys and authentication results are not sent to a server.

| Scenario | Expected behavior |
| --- | --- |
| An unregistered page has a passkey sign-in button | A candidate appears; the button is not activated automatically |
| Complete passkey authentication manually | A passkey-use candidate appears without changing registration |
| Register after detected use | The method is saved for future visits; authentication is not repeated immediately |
| Use a passkey on a password-registered site | The saved method is retained; no switch is proposed |
| Create a passkey or cancel authentication | No completed-usage detection |
| Register for passkeys and reload | User verification starts; authentication starts once |
| Cancel Chrome/OS verification | No automatic retry |
| Reload after cancellation | One authentication attempt is allowed for the new page load |
| Enter an email or username on a registered site | Activation waits for input to settle, then occurs once without a popup start action |
| Interact elsewhere on the page or press Escape | Automatic activation stops and input is retained |
| Detect usage while an activation permission check is pending | Usage detection does not stop activation |
| Reveal a button after account input on an unregistered site | A candidate appears, but there is no automatic activation |
| Manually register a site without a candidate | The method can be chosen, Password is the default, and nothing runs before confirmation |
| Use an authentication iframe on another origin | Both origins are shown; only the confirmed parent/authentication pair is allowed |
| Embed the same authentication origin under another parent | Permission is not inherited; it is offered as a new candidate |
| Open the popup for a registered site | The method is read-only; there is no method switch or manual start button |
| Remove and register with another method | Removal disables automation; registration enables only the chosen method |
| Use the Japanese and English popup | Method labels, explanations, and feedback use the selected language |

Additional fixtures:

| URL | Purpose |
| --- | --- |
| `http://localhost:4174/passkey-generic` | A generic login button calls WebAuthn. A usage candidate should appear only after authentication, not from button detection. Automatic activation of this generic button on future visits is outside the supported scope. |
| `http://localhost:4174/passkey-email` | Check detection and activation after email input |
| `http://127.0.0.1:4174/passkey-iframe` | Embeds `http://localhost:4174/passkey-email` and permits WebAuthn retrieval. Create the dummy passkey at the top-level passkey fixture first. |

## Real-site verification and recorded evidence

On a real site, check that the popup shows the parent and embedded authentication origins and that activation is limited to the approved pair. Nested iframes, Shadow DOM, candidate-list-only screens, and sites requiring an actual user gesture are outside the supported scope.

During development, a user reported that App Store Connect automatically opened the passkey verification prompt. This confirms prompt activation in that user's environment, not a complete login result or a repeatable compatibility guarantee. A maintainer-run, repeatable browser review of that site has not been recorded.

For a browser report, record the extension commit/version, Chrome and OS versions, scenario, and observed result. Local fixture success does not establish successful server-side login on a real site.

## Cleanup

Delete dummy passkeys from the browser or OS credential manager after testing. Stop the fixture server with Ctrl+C and close the temporary profile.
