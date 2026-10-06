# Popup design notes

The popup uses a 360px width, a white surface, and the Pilot brand icon's navy and light blue palette. Show the current site's state first, followed by the registered-site list. Example origins in design files are placeholders.

The approved design source is `popup-redesign.pen` at the repository root. The implementation in `src/entrypoints/popup/` and translations in `src/shared/i18n.ts` determine exact dimensions and copy. These notes describe interaction principles rather than a separate pixel specification.

## Site states

| State | Presentation and action |
| --- | --- |
| Registered | Show the origin, enabled state, and saved login method. The method is read-only; there is no start button or method switch. Enabled status does not imply a successful login. |
| Candidate detected | Show the candidate origin and detection type: autofill, passkey button, or completed passkey use. Registration is the primary action. If the current and detected sites differ, identify both clearly. |
| No candidate | Show the current site's unregistered state and allow manual registration. Method selection belongs to confirmation for a new registration, with Password as the default. |
| Authentication iframe | Show the parent origin and authentication origin so consent applies to the visible pair. |

Registration normally allows an attempt on the current page. Registration after completed passkey use applies to future visits without repeating authentication immediately. Changing a saved method requires removal and a new registration.

## Layout

- Header: the 32px Pilot icon and product name.
- Main area: current site or candidate status, with text and icons as well as color.
- Registered sites: readable origins, login method, list count, and a secondary Remove action.
- Footer: support link and language selector.
- Long origins wrap and retain scheme and port differences.
- When the list grows, keep the current site and primary action accessible.

The screenshot in `design/previews/registered.png` is an earlier visual reference, not the specification for current UI behavior.

## Feedback and accessibility

Show registration and removal progress and prevent duplicate actions. Confirm that a site was registered or removed without claiming successful login. Errors should be specific, visually distinct, and close to the action.

Keep loading separate from unregistered status. Unsupported pages should explain why registration is unavailable. Preserve keyboard access and useful focus after actions.

## Review checklist

- Text, controls, and origins fit the popup width in both languages.
- Current and candidate sites cannot be confused.
- Enabled status is distinguishable from a successful login.
- The primary action is clear and removal remains secondary.
- Contrast, spacing, alignment, focus indicators, and keyboard interaction remain usable.
