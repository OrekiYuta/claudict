# Claudict

A dictionary assistant for [Obsidian](https://obsidian.md) powered by the local **Claude Code CLI**. Translate English words and phrases, and automatically archive every lookup into a Markdown table in your vault.

## Highlights

- **Effortless to use** — One click to open, type a word, press Enter. No API keys, no configuration headaches — it works out of the box with your local Claude Code CLI.
- **Every lookup is saved to Markdown** — Translated words are automatically archived into a Markdown table in your vault, building a personal vocabulary log you fully own and can review anytime.

## Features

- **Word translation** — Enter an English word or phrase, press Enter, and get its Chinese meaning from Claude.
- **Automatic archiving** — Every lookup is appended to a Markdown table with three columns: `English Word`, `Chinese Meaning`, `Query Time`.
- **Newest first** — New (and re-queried) words are inserted at the top of the table, so your most recent lookups stay visible.
- **Deduplication** — Looking up the same word again updates its meaning and timestamp instead of creating a duplicate row.
- **Customizable archive file** — Pick the target Markdown file via a fuzzy search picker (no long dropdowns).
- **Customizable prompt** — Tune the prompt sent to Claude in settings.
- **Bilingual UI** — Switch the interface between Chinese and English.
- **Auto CLI detection** — Finds the `claude` executable automatically, with a manual override available.

## Requirements

- **Obsidian** v1.0.0 or later.
- **Desktop only** (Windows, macOS, Linux). The plugin spawns a local process, so it does not work on mobile.
- **Claude Code CLI** installed and authenticated. See the [Claude Code docs](https://code.claude.com/docs/en/overview).
  - Verify it works in a terminal:
    ```bash
    claude -p "Reply with OK"
    ```

## Installation

### Manual install (from source)

1. Locate your vault's plugins folder:
   ```
   <your-vault>/.obsidian/plugins/
   ```
2. Create a folder named `claudict` and copy these files into it:
   ```
   <your-vault>/.obsidian/plugins/claudict/
   ├── manifest.json
   ├── main.js
   └── styles.css
   ```
3. In Obsidian, go to **Settings → Community plugins** and make sure Restricted Mode is **off**.
4. Click the refresh icon (or restart Obsidian), find **Claudict** in the installed plugins list, and enable it.

## Usage

1. Click the **Claudict** icon (a book) in the left ribbon, or run the command **"Open Claudict panel"** from the command palette (`Ctrl/Cmd + P`).
2. The panel opens in the right sidebar with a single input box.
3. Type an English word or phrase and press **Enter** (use **Shift + Enter** for a newline).
4. Claude returns the Chinese meaning, shown in a result card.
5. The lookup is automatically saved to your archive file as a new top row.

### Example archive output

```markdown
| English Word | Chinese Meaning | Query Time |
| --- | --- | --- |
| apple | 苹果 | 2026-06-30 01:25:28 |
| hello | 你好；喂 | 2026-06-30 01:11:32 |
```

## Settings

| Setting | Description |
|---------|-------------|
| **Interface language** | Switch the UI between Chinese (中文) and English. |
| **Claude CLI path** | Leave empty to auto-detect. Set the full path to the `claude` executable if auto-detection fails. |
| **Current effective CLI path** | Read-only display of the path currently in use. |
| **Translation archive file** | The vault-relative Markdown file where results are stored. |
| **Choose archive file** | Open a fuzzy search picker to quickly select an existing Markdown file. |
| **Translation prompt** | The prompt sent to Claude. The looked-up word is appended at the end. |
| **Reset prompt** | Restore the default prompt. |

## Troubleshooting

### "claude CLI not found"

The plugin could not locate your Claude Code installation. This is common with Node version managers (nvm, fnm, volta).

**Solution:** Find the CLI path and set it in **Settings → Claude CLI path**.

| Platform | Command | Example path |
|----------|---------|--------------|
| macOS / Linux | `which claude` | `/usr/local/bin/claude` |
| Windows (native) | `where.exe claude` | `C:\Users\you\.local\bin\claude.exe` |

### Table is not rendering

A Markdown table needs a header row **and** a separator row to render. Claudict rebuilds the full table on every write, so simply translating one more word will repair a malformed file automatically.

## How it works

- The plugin runs `claude -p "<prompt>\n<word>"` as a child process with your vault as the working directory.
- The default prompt instructs Claude to reply with **only** the Chinese meaning, so the output stays clean.
- Results are parsed and written into the archive table, rebuilding it on each write to guarantee valid, renderable Markdown.

## License

MIT
