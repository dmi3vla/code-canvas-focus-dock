# Code Canvas · Focus Dock

A from-scratch Electron implementation of a local code architecture canvas with a permanent right-hand **Focus Dock**.

## Focus Dock

- **Code** — click a semantic card to open its source file directly at the referenced method or class.
- **Chat** — project-aware AI conversation with streaming output.
- **Split** — code and chat side by side; the dock expands automatically.
- A graph-node click synchronizes the selected node, reveals and highlights its file in the project tree, then opens the editor at the symbol range.
- The project panel supports collapse, expand, close, and reopen.
- The assistant panel supports collapse, expand, fullscreen, close, and reopen.
- The selected canvas node is shown as an explicit context chip.
- `Ctrl/Cmd + J` focuses Chat.

## Core workflow

1. Open a local project.
2. A structural import map appears immediately without an API call.
3. Pan/zoom the infinite canvas and drag nodes.
4. Select a semantic node to open its file, reveal the exact symbol range, and highlight the referenced lines in Focus Dock.
5. Configure an OpenAI-compatible provider in Settings.
6. Use **Generate** to create an AI-refined codemap.
7. Ask questions in Chat with the selected file and codemap attached as context.
8. Save or open `.canvas` / `.json` workspace files.

## Security model

- Electron renderer uses `sandbox: true`, `contextIsolation: true`, and `nodeIntegration: false`.
- Popup windows and renderer navigation are blocked.
- Renderer capabilities are exposed through a narrow preload bridge.
- File reads and writes are restricted to the selected project root, including symlink checks.
- API keys are encrypted with Electron `safeStorage` when available and the settings file is restricted to mode `0600` where supported.
- AI and canvas text is rendered from escaped content; raw HTML is not accepted.

## Run

```bash
npm install
npm start
```

Do not add `--no-sandbox` to normal launch commands.

## AI settings

The app supports OpenAI-compatible endpoints. Defaults:

- Base URL: `https://api.deepseek.com/v1`
- Model: `deepseek-chat`
- Language: `Русский`

The structural codemap works without an API key. AI generation and Chat require a configured key.

## Project structure

```text
main.js                         Electron lifecycle and IPC
preload.js                      Restricted renderer bridge
main/services/
  ai-service.js                 Codemap generation and streaming Chat
  project-service.js            Scan, symbol locations, import graph, cache, path sandbox
  settings-service.js           Encrypted provider settings
src/
  index.html                    App shell and Focus Dock markup
  styles.css                    Production UI
  app.mjs                       Workflow orchestration
  canvas.mjs                    Infinite canvas rendering/interactions
  dock.mjs                      Code / Chat / Split behavior
```

## Keyboard shortcuts

- `Ctrl/Cmd + O` — open project
- `Ctrl/Cmd + S` — save canvas
- `Ctrl/Cmd + J` — Focus Dock Chat
- `Enter` — send chat message
- `Shift + Enter` — newline
- `Escape` — stop an active chat response / close settings

## Validation

```bash
npm run check
node tests/project-service.test.js
```

## License

MIT
