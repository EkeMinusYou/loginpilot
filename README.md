# Login Pilot

[日本語](README.ja.md) · [Website](https://loginpilot.ekeminusyou.com/en/) · [User guide](docs/usage.md)

A Chrome extension that submits login forms after Google Password Manager autofills them and activates passkey sign-in buttons on sites you register.

- Register sites explicitly; automatic login runs only on approved origins.
- Start password or passkey login automatically on future visits.
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

1. Open a login page with credentials saved in Google Password Manager, or a page with an explicit passkey sign-in button.
2. Open Login Pilot's popup, check the candidate site and login method, and choose **Register and enable auto login**.
3. Approve Chrome's confirmation if prompted. On future visits, Login Pilot starts the registered login flow automatically.

You can also register the current site manually from the popup. Remove a site from the registered list to disable automatic login. To change its login method, remove it and register it again.

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

Load the generated extension in Chrome as described above. See [CONTRIBUTING.md](CONTRIBUTING.md) for validation commands, project structure, localization, and design assets.

## Documentation and support

| Topic | Document |
| --- | --- |
| Usage and troubleshooting | [User guide](docs/usage.md) |
| Development and project policy | [Contributing](CONTRIBUTING.md) |
| Dependency updates, CI, and releases | [Maintenance](docs/maintenance.md) |
| Manual browser checks | [Browser review](docs/browser-review.md) |
| Landing page deployment | [Deployment](docs/deployment.md) |
| Vulnerability reporting | [Security policy](SECURITY.md) |

Bug reports and feature requests are welcome through [GitHub Issues](https://github.com/EkeMinusYou/loginpilot/issues/new/choose). External pull requests are not accepted. Maintainers use pull requests for their own changes, and automated dependency update PRs are allowed. See the [project policy](CONTRIBUTING.md#contribution-policy). Report vulnerabilities privately through the security policy.

If you find Login Pilot useful, you can [support development on Buy Me a Coffee](https://buymeacoffee.com/euonymuslke).

## License

Original code, the Pilot brand icon, and design files are released under the [MIT License](LICENSE). Third-party code, icons, and fonts retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

`private: true` in `package.json` prevents accidental publication to npm.
