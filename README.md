# Claudict

A dictionary assistant for [Obsidian](https://obsidian.md) powered by an **OpenAI-compatible API**. Translate English words and phrases, and automatically archive every lookup into a Markdown table in your vault.

## Highlights

- **No local AI tools required** — Configure an API URL and key, fetch the supported models, and start translating.
- **Every lookup is saved to Markdown** — Translated words are automatically archived into a Markdown table in your vault, building a personal vocabulary log you fully own and can review anytime.

## Features

- **Word translation** — Enter an English word or phrase, press Enter, and get its Chinese meaning from your selected AI model.
- **Automatic archiving** — Every lookup is appended to a Markdown table with three columns: `English Word`, `Chinese Meaning`, `Query Time`.
- **Newest first** — New (and re-queried) words are inserted at the top of the table, so your most recent lookups stay visible.
- **Deduplication** — Looking up the same word again updates its meaning and timestamp instead of creating a duplicate row.
- **Customizable archive file** — Pick the target Markdown file via a fuzzy search picker (no long dropdowns).
- **Model discovery** — Fetch supported models from the API and persist the list in the plugin's local configuration.
- **Customizable prompt** — Tune the system prompt sent to the AI in settings.
- **Bilingual UI** — Switch the interface between Chinese and English.

## Requirements

- **Obsidian** v1.0.0 or later.
- An OpenAI-compatible API Base URL and API key.
- Network access to the configured API.

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
4. The selected AI model returns the Chinese meaning, shown in a result card.
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
| **API Base URL** | Base URL of the OpenAI-compatible service, for example `https://api.openai.com/v1`. |
| **API key** | Bearer token used to authenticate. It is stored in the plugin's local `data.json`. |
| **Additional query parameters** | Optional query string required by some gateways, such as `api-version=2025-03-01-preview`. |
| **Model list** | Fetch models from `/models`; successful results are immediately saved to local configuration. |
| **AI model** | Select one of the fetched models for translations. |
| **Translation archive file** | The vault-relative Markdown file where results are stored. |
| **Choose archive file** | Open a fuzzy search picker to quickly select an existing Markdown file. |
| **Translation prompt** | The system prompt sent to the selected AI model. |
| **Reset prompt** | Restore the default prompt. |

## Troubleshooting

### Models cannot be fetched

Check that the Base URL includes the service API prefix (commonly `/v1`) and that the API key can access `GET /models`. Some Azure-compatible gateways also require an additional `api-version` query parameter.

### Table is not rendering

A Markdown table needs a header row **and** a separator row to render. Claudict rebuilds only its vocabulary table on each write. YAML frontmatter and any other content outside that table are preserved unchanged.

## How it works

- The plugin fetches available models from `GET <base-url>/models` and saves their IDs through Obsidian's `saveData()` API.
- It sends translations to `POST <base-url>/chat/completions` using the selected model.
- The default system prompt instructs the AI to reply with **only** the Chinese meaning, so the output stays clean.
- Results are parsed and written into the archive table. Claudict rebuilds only that table to keep it valid and renderable while preserving frontmatter and the rest of the Markdown file.

## License

MIT
