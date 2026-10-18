# ST-ExampleBuilder 1.0

A standalone HTML editor for SillyTavern example conversations. Import, edit, and export messages using `{{user}}:`, `{{char}}:`, and `<START>` markers.

![Example Builder preview](docs/preview-1.0.png)

## [Open the app on GitHub Pages](https://lunarfyre-st.github.io/Editor-for-SillyTavern-Chat-Examples/)

You can also download `ST-ExampleBuilder-1.0.html` and open it directly in a modern browser; no installation or server is required.

[Download releases](https://github.com/Lunarfyre-ST/Editor-for-SillyTavern-Chat-Examples/releases)

## Using the editor

- Click **Import chats** to either load a `.txt` file or paste properly formatted text into the **Formatted chat text** field, then click **Import**. You can also load a SillyTavern `.jsonl` log or a previously saved project JSON.
- Add, reorder, split, merge, and collapse messages and examples. Format narration and undo or redo edits.
- Use **Copy all** or **Download .txt** to export example conversations for SillyTavern. Example labels are excluded from these exports.
- Use **Save project** to download an editable JSON copy including labels. Import that file to resume later. The save indicator tracks changes since the last project download; copying or exporting text does not mark the project as saved. Your browser may ask before leaving with unsaved changes.

Both pasted text and `.txt` files use the same format:

```text
<START>
{{user}}: Hello!
{{char}}: Hi! How can I help?
```

Begin each message with `{{user}}:` or `{{char}}:`. Put `<START>` on its own line to separate examples; if you omit it, the text is imported as one example. Messages can span multiple lines.

Token counts are estimates. SillyTavern JSONL logs can be imported too: choose the messages to keep, then import them as an example. System messages and log metadata are excluded.

## Privacy and saving

Chat text and labels stay in the page's memory. The app has no analytics, external dependencies, network requests, cookies, or automatic draft storage. It removes the draft storage key used by older versions on startup, without restoring its contents.

Closing or reloading the page loses the draft, so download a project before leaving. Exported files and text copied to your clipboard can contain personal information you entered; manage those copies yourself.

When accessed online, GitHub Pages still receives normal hosting requests; use the downloaded HTML offline if you prefer. Browser extensions, browser recovery features, and the operating system are outside the app's control.

## GitHub Pages setup

1. Commit and push the project, including `.github/workflows/pages.yml`, to `main`.
2. In the repository's **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**.
3. Open **Actions → Deploy Example Builder to Pages**. If a deployment has not started, click **Run workflow**, select `main`, and run it. If an earlier run failed before you changed the source, run it again.
4. When the deployment succeeds, open the app link above. The root `index.html` opens the application.

The workflow publishes only `index.html` and `ST-ExampleBuilder-1.0.html`. It runs on pushes to `main` and can also be started manually. If deployment fails, open the failed step in that named workflow to see the error.

## Development tests

Use Node.js 20 or later and an installed Google Chrome, then run `npm install` and `npm test`. Tests run headlessly with Playwright and cover saving, undo/redo, text editing, composition events, imports, example boundaries, privacy, and mobile layout. Set `BROWSER_CHANNEL=msedge` to run against Microsoft Edge instead. Set `UPDATE_PREVIEW=1` to regenerate the README preview with sample dialogue.

Composition and mobile checks simulate browser events and screen sizes; they do not replace testing with a physical phone or an actual IME keyboard.
