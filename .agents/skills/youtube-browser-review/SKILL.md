---
name: youtube-browser-review
description: Verify this repository's YouTube extension in its isolated Docker browser using MCP, real keyboard input, DOM inspection, and visual review. Use for live-site UI checks, keyboard navigation regressions, or review-browser troubleshooting.
---

# YouTube browser review

Use the existing environment in `tools/browser`; follow the host-browser isolation rules in the repository's `AGENTS.md`. All commands below run from the repository root. The MCP server and noVNC operate the same dedicated Linux browser. Do not substitute a host browser or import the user's everyday profile.

## Prepare the current build

Inspect the relevant change and choose checks that reproduce its behavior. Read `README.md` under **Keyboard controls** for expected interactions and **Isolated browser review** for environment details.

Check Docker availability and the existing container:

```sh
docker info --format '{{.ServerVersion}}'
docker compose -f tools/browser/compose.yaml ps
```

If it is absent, start it with `npm run browser:up`. Install root dependencies with `npm ci` only if needed. Reuse a healthy container when its loaded extension and browser-tool image match the current files. After extension changes, copy any captures worth retaining, then rebuild and reload via recreation:

```sh
npm run browser:captures
npm run build
docker compose -f tools/browser/compose.yaml up -d --force-recreate --wait
```

Skip copying if no container exists. After changes to Docker tooling, also build the image (`npm run browser:up`) before recreation. Recreation resets the temporary browser profile. Check `docker compose -f tools/browser/compose.yaml logs --tail=80 browser` if startup fails; fix the observed cause instead of adding automatic restart loops. If Docker is unavailable, report the blocker and perform applicable non-browser checks without launching a host browser.

## Operate through MCP

Prefer the project-scoped `youtube_review` MCP tools registered in `.codex/config.toml`. If this session has not loaded that server, use the existing terminal client immediately; do not require a Codex restart to complete the review:

```sh
npm run browser:tool -- list_pages
npm run browser:tool -- list
```

Use the page ID from `list_pages`; `1` below is an example. Inspect the advertised schemas when a tool's arguments are unclear.

```sh
npm run browser:tool -- navigate_page '{"pageId":1,"type":"url","url":"https://www.youtube.com/results?search_query=landscape+photography"}'
npm run browser:tool -- press_key '{"pageId":1,"key":"l"}'
npm run browser:tool -- take_snapshot '{"pageId":1}'
npm run browser:tool -- take_screenshot '{"pageId":1,"filePath":"/artifacts/selected.png"}'
```

Use real `press_key`, `type_text`, and `click` actions to exercise the extension. Use `evaluate_script` for observing DOM, focus, computed styles, video IDs, and bounding rectangles; do not simulate success by directly changing selection or calling extension functions.

- Send uppercase `G` as `press_key` with `key: "G"`. `Shift+g` can emit lowercase `event.key` and test a different shortcut.
- Send `gg` or `gh` in one `type_text` action while the list has focus. Separate MCP calls can exceed the extension's one-second prefix timeout. In an input, `type_text` inserts text instead.
- Use a fresh `take_snapshot` before UID-based clicks. UIDs belong to the same MCP connection; separate `browser:tool` commands create new connections. For a multi-step UID workflow, use native MCP tools or a container-side script with `connect()` from `/opt/browser/mcp-client.mjs`, as demonstrated by `tools/browser/review.mjs`.
- Change appearance through YouTube's own settings. Media emulation alone may not switch its theme.

For the maintained search/navigation smoke check, run `npm run browser:review`. It assumes page ID `1` and Japanese YouTube controls, navigates that tab, and writes `/artifacts/review.json` plus screenshots. Inspect `list_pages` and the script before using it in a different page setup. On failure, inspect the report and current UI to distinguish a product regression from changed site markup, language, or loading behavior. Fix the cause and rerun the affected checks; do not relax assertions merely to obtain a pass.

## Verify behavior and appearance

Choose the checks relevant to the request rather than repeating every scenario:

- Selection: verify selected and focused video IDs, card visibility within the viewport, and exclusion of ads (including cards nested inside ad renderers). For appearance changes, inspect varied thumbnails, light/dark themes, and a narrower viewport. Check title overlap and surrounding cards, respecting the user's current design preferences.
- Navigation: use `h/j/k/l`, `gg`, and `G`; verify destination IDs and actual row geometry. At a loading boundary, compare result counts before and after and move into appended results. Scrolling by itself does not prove that continuation works.
- Input and transitions: check `/`, ordinary text entry, and Escape without unexpected selection movement; open a selected video with Enter and verify selection restoration after Back. Navigation to a watch page does not prove media playback or related-video navigation.

A fresh signed-out home can show no recommendations. Search results remain useful, but a passing search check does not verify the home grid or its continuation. Report the missing coverage explicitly. Do not import cookies or sign into an account to fill this gap unless the user requests it.

Save screenshots inside `/artifacts`, then copy them with `npm run browser:captures`. Open the copied images in `.output/browser-review` with the available image-viewing tool before judging appearance. If an image is clipped or fails to show the selected card, adjust the actual selection/scroll position and recapture. A saved image or DOM assertion alone is not a completed visual review.

The user can directly operate the same desktop at <http://127.0.0.1:6080/vnc.html?autoconnect=true&resize=scale>. Opening this viewer is optional; MCP does not require it.

## Finish

Report what was actually exercised, any fixes, evidence paths, and unverified behavior. Run source checks appropriate to any implementation changes; for a browser-only review, do not imply that unit tests were rerun. Keep the environment available for the user's manual review and state whether it is running. When stopping is requested, copy needed artifacts first, then use `npm run browser:down`; container removal deletes its internal captures and temporary profile. Do not add schedules or automatic restarts.
