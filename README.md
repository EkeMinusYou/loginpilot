# Login Pilot

[日本語](README.ja.md) · [Website](https://loginpilot.ekeminusyou.com/en/) · [User guide](docs/usage.md)

A Chrome extension that submits login forms after Google Password Manager autofills them and activates passkey or external sign-in buttons on sites you register.

- Register sites explicitly; automatic login runs only on approved origins.
- Start password, passkey, or external login automatically on future visits.
- Choose a provider such as Google, Apple, Facebook, X / Twitter, Microsoft, or GitHub for each external-login site.
- Keep passkey verification and account selection in Chrome or your operating system.
- Use the popup and notifications in English or Japanese.

Chrome Web Store release is in preparation. You can currently build and load the extension from source.

## Install from source

Use the Node.js version in [.nvmrc](.nvmrc) and npm. With nvm, run `nvm install && nvm use` after cloning the repository.

```sh
git clone https://github.com/EkeMinusYou/loginpilot.git
cd loginpilot
npm ci
npm run build
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `.output/chrome-mv3`.

## Get started

1. Sign in once with password autofill, a password form, a passkey, or a recognized external provider such as Google.
2. Open Login Pilot's popup, check the candidate site and login method, and choose **Register and enable auto login**.
3. Approve Chrome's confirmation if prompted. On future visits, Login Pilot starts the registered login flow automatically.

Registration is offered only after login activity is detected, using the origin and method detected at that time. There is no registration button for an unrelated page. Remove a site from the registered list to disable automatic login. To change its login method or provider, remove it, sign in with the desired method, and register the new candidate.

See the [user guide](docs/usage.md) for registration details, supported pages, and troubleshooting.

## Privacy and limitations

Credentials are handled temporarily in the page to fill and submit forms. They are never stored in extension storage or sent to the background process or a developer-operated server. Site registrations and language preferences stay in `chrome.storage.local`. See the [privacy policy](docs/privacy.en.md) ([日本語](docs/privacy.md)) for the complete data flow.

Password login supports ordinary username/password forms. Passkey automation requires a single explicit sign-in button; verification still takes place in Chrome or the OS. Additional steps such as two-factor authentication and CAPTCHA require your action. Login Pilot attempts login; it does not verify server-side success. See the [supported conditions](docs/usage.md#supported-conditions-and-limitations).

## Development

Built with WXT, TypeScript, Manifest V3, Vite, and Tailwind CSS.

```sh
npm ci
npm run dev
```

Load the generated extension in Chrome as described above. See the [development guide](docs/development.md) for validation commands, project structure, localization, and design assets.

## Documentation and support

| Topic | Document |
| --- | --- |
| Usage and troubleshooting | [User guide](docs/usage.md) |
| Local development, validation, and design assets | [Development](docs/development.md) |
| Dependency updates, CI, and releases | [Maintenance](docs/maintenance.md) |
| Manual browser checks | [Browser review](docs/browser-review.md) |
| Landing page deployment | [Deployment](docs/deployment.md) |
| Vulnerability reporting | [Security policy](SECURITY.md) |

If you find Login Pilot useful, you can [support development on Buy Me a Coffee](https://buymeacoffee.com/euonymuslke).

## Project policy

Bug reports and feature requests are welcome through [GitHub Issues](https://github.com/EkeMinusYou/loginpilot/issues/new/choose). External pull requests are not accepted. Maintainers use pull requests for their own changes, and automated dependency update PRs are allowed. Report vulnerabilities privately through the [security policy](SECURITY.md).

## License

Original code, the Pilot brand icon, and design files are released under the [MIT License](LICENSE). Third-party code, icons, and fonts retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

`private: true` in `package.json` prevents accidental publication to npm.
