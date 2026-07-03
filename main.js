'use strict';

const { Plugin, ItemView, Notice, PluginSettingTab, Setting, TFile, FuzzySuggestModal } = require('obsidian');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// ============================================================
// Constants
// ============================================================

const VIEW_TYPE_CLAUDICT = 'claudict-view';

// Fixed English table headers for the archive file.
const TABLE_HEADERS = ['English Word', 'Chinese Meaning', 'Query Time'];

// First-column header labels treated as a header row (includes legacy Chinese
// headers so old files get normalized to English headers).
const HEADER_FIRST_COLS = ['English Word', '英语单词'];

// Default prompt sent to Claude. The word is appended at the end.
const DEFAULT_PROMPT = [
  'You are an English dictionary assistant. I will give you an English word or phrase.',
  'Reply with ONLY its most common Chinese meaning. Requirements:',
  '1. Output only the Chinese meaning itself. No English word, no explanation, no examples, no surrounding punctuation.',
  '2. If there are multiple common senses, separate them with "；", at most 3.',
  '3. No prefix (such as "Translation:") and no pleasantries.',
  '',
  'The content to translate is:',
].join('\n');

const DEFAULT_SETTINGS = {
  language: 'zh',                 // 'zh' | 'en' (UI language only)
  claudeCliPath: '',              // empty = auto-detect
  resultFilePath: 'Translations.md',
  prompt: DEFAULT_PROMPT,
};

// ============================================================
// i18n (UI strings only; table headers are always English)
// ============================================================

const TRANSLATIONS = {
  zh: {
    pluginTitle: 'Claudict',
    openPanel: '打开 Claudict',
    openPanelCmd: '打开 Claudict 面板',
    // translate
    translatePlaceholder: '输入英文单词或短语…（回车翻译）',
    translateBtn: '翻译',
    translating: '翻译中…',
    callingClaude: '正在调用 Claude…',
    inputWordFirst: '请输入要翻译的单词',
    // settings
    settingsTitle: 'Claudict 设置',
    settingLanguage: '界面语言',
    settingLanguageDesc: '切换插件界面的显示语言。',
    settingCliPath: 'Claude CLI 路径',
    settingCliPathDesc: '留空则自动检测。自动检测失败时，请填写 claude 可执行文件的完整路径。',
    settingCliCurrent: '当前生效的 CLI 路径',
    settingResultFile: '翻译结果归档文件',
    settingResultFileDesc: '翻译结果会以表格形式写入此 Markdown 文件（vault 内相对路径）。',
    settingPickFile: '选择归档文件',
    settingPickFileDesc: '点击按钮，通过搜索从已有的 Markdown 文件中快速选择。',
    settingPickBtn: '搜索并选择…',
    fuzzyPlaceholder: '输入关键字搜索 Markdown 文件…',
    settingPrompt: '翻译提示词',
    settingPromptDesc: '发送给 Claude 的提示词。单词会拼接在末尾。',
    settingResetPrompt: '重置提示词',
    settingResetBtn: '恢复默认',
    fileSelected: (p) => `已选择归档文件：${p}`,
    // errors
    errorTitle: '翻译失败',
    errorDetailLabel: '详细信息',
    cliNotFound: (p) => `找不到 claude CLI（路径：${p}）。请在设置中填写正确的 Claude CLI 路径。`,
    errAuth: '身份认证失败或未登录。请在终端运行 `claude` 完成登录后重试。',
    errQuota: '额度已用尽或触发速率限制。请稍后再试，或检查你的账户用量。',
    errNetwork: '网络连接失败。请检查网络或代理设置后重试。',
    errTimeout: '调用超时。Claude 响应时间过长，请稍后重试。',
    errEmpty: 'Claude 未返回任何内容。请重试或检查提示词设置。',
    errExit: (code) => `Claude 进程异常退出（退出码 ${code}）。`,
  },
  en: {
    pluginTitle: 'Claudict',
    openPanel: 'Open Claudict',
    openPanelCmd: 'Open Claudict panel',
    translatePlaceholder: 'Enter an English word or phrase… (Enter to translate)',
    translateBtn: 'Translate',
    translating: 'Translating…',
    callingClaude: 'Calling Claude…',
    inputWordFirst: 'Please enter a word to translate',
    settingsTitle: 'Claudict Settings',
    settingLanguage: 'Interface language',
    settingLanguageDesc: 'Switch the display language of the plugin UI.',
    settingCliPath: 'Claude CLI path',
    settingCliPathDesc: 'Leave empty to auto-detect. If auto-detection fails, enter the full path to the claude executable.',
    settingCliCurrent: 'Current effective CLI path',
    settingResultFile: 'Translation archive file',
    settingResultFileDesc: 'Translations are written as a table to this Markdown file (vault-relative path).',
    settingPickFile: 'Choose archive file',
    settingPickFileDesc: 'Click the button to quickly pick an existing Markdown file via search.',
    settingPickBtn: 'Search and select…',
    fuzzyPlaceholder: 'Type to search Markdown files…',
    settingPrompt: 'Translation prompt',
    settingPromptDesc: 'The prompt sent to Claude. The word is appended at the end.',
    settingResetPrompt: 'Reset prompt',
    settingResetBtn: 'Restore default',
    fileSelected: (p) => `Archive file selected: ${p}`,
    errorTitle: 'Translation failed',
    errorDetailLabel: 'Details',
    cliNotFound: (p) => `claude CLI not found (path: ${p}). Please set the correct Claude CLI path in settings.`,
    errAuth: 'Authentication failed or not logged in. Run `claude` in a terminal to log in, then try again.',
    errQuota: 'Quota exhausted or rate limited. Please try again later or check your account usage.',
    errNetwork: 'Network connection failed. Please check your network or proxy settings and retry.',
    errTimeout: 'The call timed out. Claude took too long to respond, please retry later.',
    errEmpty: 'Claude returned no content. Please retry or check your prompt settings.',
    errExit: (code) => `Claude process exited abnormally (exit code ${code}).`,
  },
};

// ============================================================
// Fuzzy file picker modal
// ============================================================

class FileSuggestModal extends FuzzySuggestModal {
  constructor(app, plugin, onChoose) {
    super(app);
    this.plugin = plugin;
    this.onChoose = onChoose;
    this.setPlaceholder(plugin.t('fuzzyPlaceholder'));
  }

  getItems() {
    return this.app.vault.getMarkdownFiles();
  }

  getItemText(file) {
    return file.path;
  }

  onChooseItem(file) {
    this.onChoose(file.path);
  }
}

// ============================================================
// Plugin main class
// ============================================================

class ClaudictPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.registerView(
      VIEW_TYPE_CLAUDICT,
      (leaf) => new ClaudictView(leaf, this)
    );

    this.addRibbonIcon('book-a', this.t('openPanel'), () => {
      void this.activateView();
    });

    this.addCommand({
      id: 'open-panel',
      name: this.t('openPanelCmd'),
      callback: () => void this.activateView(),
    });

    this.addSettingTab(new ClaudictSettingTab(this.app, this));
  }

  onunload() {}

  // i18n lookup for UI strings.
  t(key) {
    const lang = this.settings?.language === 'en' ? 'en' : 'zh';
    return TRANSLATIONS[lang][key] ?? TRANSLATIONS.zh[key] ?? key;
  }

  // Re-render all open views (used after a language switch).
  refreshAllViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CLAUDICT)) {
      const view = leaf.view;
      if (view instanceof ClaudictView) {
        view.renderContent();
      }
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_CLAUDICT)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      await leaf.setViewState({ type: VIEW_TYPE_CLAUDICT, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  // ---------- Claude CLI ----------

  // Resolve the claude executable path: setting first, then common locations, then PATH.
  resolveClaudeCliPath() {
    if (this.settings.claudeCliPath && this.settings.claudeCliPath.trim()) {
      return this.settings.claudeCliPath.trim();
    }
    const home = process.env.USERPROFILE || process.env.HOME || '';
    const candidates = [
      path.join(home, '.local', 'bin', 'claude.exe'),
      path.join(home, '.local', 'bin', 'claude'),
      path.join(home, 'AppData', 'Local', 'Claude', 'claude.exe'),
      '/usr/local/bin/claude',
      '/opt/homebrew/bin/claude',
    ];
    for (const c of candidates) {
      try { if (fs.existsSync(c)) return c; } catch (_) {}
    }
    return process.platform === 'win32' ? 'claude.exe' : 'claude';
  }

  // Absolute path of the vault on disk (used as the CLI working directory).
  getVaultBasePath() {
    const adapter = this.app.vault.adapter;
    if (adapter && typeof adapter.getBasePath === 'function') {
      return adapter.getBasePath();
    }
    return process.cwd();
  }

  // Build an Error that carries a user-friendly reason plus the raw detail.
  makeClaudeError(friendly, detail) {
    const err = new Error(friendly);
    err.friendly = friendly;                       // human-readable reason
    err.detail = (detail || '').trim();            // raw CLI output (optional)
    return err;
  }

  // Map raw stderr / exit code to a friendly, categorized reason.
  classifyClaudeError(stderr, code) {
    const text = (stderr || '').toLowerCase();
    if (/(unauthor|not logged in|login|authenticat|forbidden|401|invalid api key|api key)/.test(text)) {
      return this.t('errAuth');
    }
    if (/(quota|rate limit|too many requests|429|usage limit|overloaded|529)/.test(text)) {
      return this.t('errQuota');
    }
    if (/(network|econn|etimedout|enotfound|dns|socket|proxy|fetch failed|getaddrinfo)/.test(text)) {
      return this.t('errNetwork');
    }
    // Fallback: report the abnormal exit code.
    return this.t('errExit')(code);
  }

  // Spawn claude with the given args and resolve with stdout.
  runClaude(args) {
    return new Promise((resolve, reject) => {
      const cliPath = this.resolveClaudeCliPath();
      const child = spawn(cliPath, args, {
        cwd: this.getVaultBasePath(),
        env: process.env,
        windowsHide: true,
        // Close stdin so `claude -p` does not wait for standard input.
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('error', (err) => {
        if (err && err.code === 'ENOENT') {
          reject(this.makeClaudeError(this.t('cliNotFound')(cliPath), ''));
        } else {
          reject(this.makeClaudeError(err.message || String(err), ''));
        }
      });
      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(this.makeClaudeError(this.classifyClaudeError(stderr, code), stderr));
        }
      });
    });
  }

  // One-shot translation via `claude -p`.
  async translateViaClaude(word) {
    const fullPrompt = `${this.settings.prompt}\n${word}`;
    const out = await this.runClaude(['-p', fullPrompt]);
    const meaning = out.trim();
    if (!meaning) {
      throw this.makeClaudeError(this.t('errEmpty'), '');
    }
    return meaning;
  }

  // ---------- Write translation into the Markdown table (dedupe: update if exists) ----------

  async appendTranslation(word, meaning) {
    const filePath = this.settings.resultFilePath || 'Translations.md';
    const now = window.moment
      ? window.moment().format('YYYY-MM-DD HH:mm:ss')
      : new Date().toLocaleString();

    let content = '';
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) {
      content = await this.app.vault.read(file);
    }

    const header = `| ${TABLE_HEADERS[0]} | ${TABLE_HEADERS[1]} | ${TABLE_HEADERS[2]} |`;
    const separator = '| --- | --- | --- |';
    const escWord = escapeCell(word);

    // Extract existing data rows (skip header, separator and non-table lines)
    // so the table is rebuilt correctly regardless of the original content.
    const dataRows = [];
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line.startsWith('|')) continue;             // skip non-table lines
      const cells = line.split('|').map((c) => c.trim());
      const firstCol = cells[1];
      if (firstCol === undefined) continue;
      if (HEADER_FIRST_COLS.includes(firstCol)) continue;  // skip header row
      if (/^:?-{1,}:?$/.test(firstCol)) continue;      // skip separator row
      dataRows.push(line);
    }

    const newRow = `| ${escWord} | ${escapeCell(meaning)} | ${now} |`;

    // Dedupe: if the word already exists, remove its old row so the refreshed
    // entry is re-inserted at the top (newest first).
    let replaced = false;
    for (let i = dataRows.length - 1; i >= 0; i--) {
      const cells = dataRows[i].split('|').map((c) => c.trim());
      const firstCol = cells[1];
      if (firstCol && firstCol.toLowerCase() === escWord.toLowerCase()) {
        dataRows.splice(i, 1);
        replaced = true;
      }
    }

    // Newest query goes to the top (right below the header).
    dataRows.unshift(newRow);

    // Always rebuild a complete, renderable table: header + separator + data rows.
    const finalContent = [header, separator, ...dataRows].join('\n') + '\n';

    if (file instanceof TFile) {
      await this.app.vault.modify(file, finalContent);
    } else {
      const dir = path.posix.dirname(filePath);
      if (dir && dir !== '.' && !this.app.vault.getAbstractFileByPath(dir)) {
        try { await this.app.vault.createFolder(dir); } catch (_) {}
      }
      await this.app.vault.create(filePath, finalContent);
    }

    return { replaced, time: now };
  }
}

// Escape a Markdown table cell: collapse newlines and escape pipes.
function escapeCell(text) {
  return String(text).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

// ============================================================
// Main view (ItemView): single translate UI, no tabs
// ============================================================

class ClaudictView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return VIEW_TYPE_CLAUDICT; }
  getDisplayText() { return this.plugin.t('pluginTitle'); }
  getIcon() { return 'book-a'; }

  async onOpen() {
    this.renderContent();
  }

  async onClose() {
    if (this._resultTimer) { clearTimeout(this._resultTimer); this._resultTimer = null; }
  }

  // Full render (also called to refresh after a language switch).
  renderContent() {
    const container = this.contentEl;
    container.empty();
    container.addClass('claudict-container');

    const body = container.createDiv({ cls: 'claudict-body' });
    this.renderTranslate(body);
  }

  renderTranslate(el) {
    const t = (k) => this.plugin.t(k);

    const inputWrap = el.createDiv({ cls: 'claudict-translate-input-wrap' });
    const input = inputWrap.createEl('textarea', {
      cls: 'claudict-translate-input',
      attr: { placeholder: t('translatePlaceholder'), rows: '3' },
    });
    const btn = inputWrap.createEl('button', { text: t('translateBtn'), cls: 'claudict-btn mod-cta claudict-translate-btn' });

    const resultEl = el.createDiv({ cls: 'claudict-result' });

    const showIdle = () => {
      resultEl.empty();
      resultEl.createDiv({ cls: 'claudict-idle', text: '(=^･ω･^=)' });
    };

    showIdle();

    const doTranslate = async () => {
      const word = input.value.trim();
      if (!word) { new Notice(t('inputWordFirst')); return; }
      btn.disabled = true;
      btn.setText(t('translating'));
      if (this._resultTimer) { clearTimeout(this._resultTimer); this._resultTimer = null; }
      resultEl.empty();
      resultEl.createSpan({ text: t('callingClaude'), cls: 'claudict-loading' });
      try {
        const meaning = await this.plugin.translateViaClaude(word);
        resultEl.empty();
        const card = resultEl.createDiv({ cls: 'claudict-result-card' });
        card.createDiv({ cls: 'claudict-result-word', text: word });
        card.createDiv({ cls: 'claudict-result-meaning', text: meaning });
        // Archive silently (no "saved to file" tip).
        await this.plugin.appendTranslation(word, meaning);
        input.value = '';
        input.focus();
        this._resultTimer = setTimeout(showIdle, 60000);
      } catch (err) {
        resultEl.empty();
        this.renderError(resultEl, err);
        this._resultTimer = setTimeout(showIdle, 60000);
      } finally {
        btn.disabled = false;
        btn.setText(t('translateBtn'));
      }
    };

    btn.addEventListener('click', () => void doTranslate());
    input.addEventListener('keydown', (e) => {
      // Enter translates; Shift+Enter inserts a newline.
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        void doTranslate();
      }
    });
    window.setTimeout(() => input.focus(), 0);
  }

  // Render an error with a red highlighted title (the friendly reason) and,
  // when available, the raw CLI output in a readable code block below.
  renderError(el, err) {
    const t = (k) => this.plugin.t(k);
    const reason = err && (err.friendly || err.message) ? (err.friendly || err.message) : String(err);
    const detail = err && err.detail ? err.detail : '';

    const box = el.createDiv({ cls: 'claudict-error' });

    const head = box.createDiv({ cls: 'claudict-error-head' });
    head.createSpan({ cls: 'claudict-error-icon', text: '⚠' });
    head.createSpan({ cls: 'claudict-error-title', text: t('errorTitle') });

    box.createDiv({ cls: 'claudict-error-reason', text: reason });

    if (detail && detail !== reason) {
      const details = box.createEl('details', { cls: 'claudict-error-details' });
      details.createEl('summary', { text: t('errorDetailLabel') });
      details.createEl('pre', { cls: 'claudict-error-detail-pre', text: detail });
    }
  }
}

// ============================================================
// Settings tab
// ============================================================

class ClaudictSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    const t = (k) => this.plugin.t(k);
    containerEl.empty();

    containerEl.createEl('h2', { text: t('settingsTitle') });

    // Interface language
    new Setting(containerEl)
      .setName(t('settingLanguage'))
      .setDesc(t('settingLanguageDesc'))
      .addDropdown((dd) => {
        dd.addOption('zh', '中文');
        dd.addOption('en', 'English');
        dd.setValue(this.plugin.settings.language);
        dd.onChange(async (value) => {
          this.plugin.settings.language = value;
          await this.plugin.saveSettings();
          this.plugin.refreshAllViews();
          this.display();
        });
      });

    // Claude CLI path
    new Setting(containerEl)
      .setName(t('settingCliPath'))
      .setDesc(t('settingCliPathDesc'))
      .addText((text) => {
        text
          .setPlaceholder(this.plugin.resolveClaudeCliPath())
          .setValue(this.plugin.settings.claudeCliPath)
          .onChange(async (value) => {
            this.plugin.settings.claudeCliPath = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t('settingCliCurrent'))
      .setDesc(this.plugin.resolveClaudeCliPath());

    // Archive file (text input)
    new Setting(containerEl)
      .setName(t('settingResultFile'))
      .setDesc(t('settingResultFileDesc'))
      .addText((text) => {
        this.resultFileInput = text;
        text
          .setPlaceholder('Translations.md')
          .setValue(this.plugin.settings.resultFilePath)
          .onChange(async (value) => {
            this.plugin.settings.resultFilePath = value.trim() || 'Translations.md';
            await this.plugin.saveSettings();
          });
      });

    // Pick a file via fuzzy search modal (replaces a long dropdown).
    new Setting(containerEl)
      .setName(t('settingPickFile'))
      .setDesc(t('settingPickFileDesc'))
      .addButton((btn) =>
        btn
          .setButtonText(t('settingPickBtn'))
          .setCta()
          .onClick(() => {
            new FileSuggestModal(this.app, this.plugin, async (filePath) => {
              this.plugin.settings.resultFilePath = filePath;
              await this.plugin.saveSettings();
              // Sync the text input above without re-rendering the whole page.
              if (this.resultFileInput) this.resultFileInput.setValue(filePath);
              new Notice(t('fileSelected')(filePath));
            }).open();
          })
      );

    // Translation prompt
    new Setting(containerEl)
      .setName(t('settingPrompt'))
      .setDesc(t('settingPromptDesc'))
      .addTextArea((ta) => {
        ta.setValue(this.plugin.settings.prompt)
          .onChange(async (value) => {
            this.plugin.settings.prompt = value;
            await this.plugin.saveSettings();
          });
        ta.inputEl.rows = 8;
        ta.inputEl.addClass('claudict-prompt-textarea');
      });

    new Setting(containerEl)
      .setName(t('settingResetPrompt'))
      .addButton((btn) =>
        btn.setButtonText(t('settingResetBtn')).onClick(async () => {
          this.plugin.settings.prompt = DEFAULT_PROMPT;
          await this.plugin.saveSettings();
          this.display();
        })
      );
  }
}

module.exports = ClaudictPlugin;
