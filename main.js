'use strict';

const { Plugin, ItemView, Notice, PluginSettingTab, Setting, TFile, FuzzySuggestModal, requestUrl } = require('obsidian');

// ============================================================
// Constants
// ============================================================

const VIEW_TYPE_CLAUDICT = 'claudict-view';

// First-column header labels treated as a header row (includes legacy Chinese
// headers so old files get normalized to English headers).
const HEADER_FIRST_COLS = ['English Word', '英语单词'];
const TABLE_HEADERS = ['English Word', 'Chinese Meaning', 'Query Time'];

// Default system prompt sent to the configured AI service.
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
  apiBaseUrl: '',
  apiKey: '',
  apiQueryParams: '',
  model: '',
  availableModels: [],
  resultFilePath: 'Translations.md',
  rotationIntervalSeconds: 5,
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
    callingAi: '正在调用 AI…',
    inputWordFirst: '请输入要翻译的单词',
    // settings
    settingsTitle: 'Claudict 设置',
    settingLanguage: '界面语言',
    settingLanguageDesc: '切换插件界面的显示语言。',
    settingApiBaseUrl: 'API Base URL',
    settingApiBaseUrlDesc: 'OpenAI 兼容接口的基础地址，例如 https://api.openai.com/v1。',
    settingApiKey: 'API Key',
    settingApiKeyDesc: '密钥将保存在此插件的本地 data.json 中。',
    settingApiQueryParams: '附加查询参数',
    settingApiQueryParamsDesc: '可选。填写 URL 查询字符串，例如 api-version=2025-03-01-preview。',
    settingFetchModels: '模型列表',
    settingFetchModelsDesc: '从 /models 拉取可用模型，成功后自动更新本地配置文件。',
    settingFetchModelsBtn: '获取模型',
    settingFetchingModelsBtn: '获取中…',
    settingModel: 'AI 模型',
    settingModelDesc: '选择已拉取并保存到本地配置的模型。',
    settingModelEmpty: '请先获取模型',
    modelsFetched: (count) => `已获取并保存 ${count} 个模型`,
    settingResultFile: '翻译结果归档文件',
    settingResultFileDesc: '翻译结果会以表格形式写入此 Markdown 文件（vault 内相对路径）。',
    settingPickFile: '选择归档文件',
    settingPickFileDesc: '点击按钮，通过搜索从已有的 Markdown 文件中快速选择。',
    settingPickBtn: '搜索并选择…',
    fuzzyPlaceholder: '输入关键字搜索 Markdown 文件…',
    settingRotationInterval: '单词轮转间隔',
    settingRotationIntervalDesc: '空闲状态下轮转显示已有单词的间隔时间，单位：秒。',
    settingPrompt: '翻译提示词',
    settingPromptDesc: '作为 system 消息发送给 AI 的翻译提示词。',
    settingResetPrompt: '重置提示词',
    settingResetBtn: '恢复默认',
    fileSelected: (p) => `已选择归档文件：${p}`,
    // errors
    errorTitle: '翻译失败',
    errorDetailLabel: '详细信息',
    errConfigUrl: '请先在设置中填写 API Base URL。',
    errConfigKey: '请先在设置中填写 API Key。',
    errConfigModel: '请先获取并选择一个 AI 模型。',
    errAuth: 'API Key 无效或没有访问权限。',
    errQuota: '额度已用尽或触发速率限制。请稍后再试，或检查你的账户用量。',
    errNetwork: '网络连接失败。请检查网络或代理设置后重试。',
    errNotFound: '接口不存在。请检查 Base URL 是否正确以及是否包含 /v1。',
    errServer: 'AI 服务暂时不可用，请稍后重试。',
    errBadResponse: 'AI 服务返回了不兼容的数据格式。',
    errEmpty: 'AI 未返回任何内容。请重试或检查提示词设置。',
    errHttp: (code) => `AI 请求失败（HTTP ${code}）。`,
  },
  en: {
    pluginTitle: 'Claudict',
    openPanel: 'Open Claudict',
    openPanelCmd: 'Open Claudict panel',
    translatePlaceholder: 'Enter an English word or phrase… (Enter to translate)',
    translateBtn: 'Translate',
    translating: 'Translating…',
    callingAi: 'Calling AI…',
    inputWordFirst: 'Please enter a word to translate',
    settingsTitle: 'Claudict Settings',
    settingLanguage: 'Interface language',
    settingLanguageDesc: 'Switch the display language of the plugin UI.',
    settingApiBaseUrl: 'API Base URL',
    settingApiBaseUrlDesc: 'Base URL of an OpenAI-compatible API, such as https://api.openai.com/v1.',
    settingApiKey: 'API key',
    settingApiKeyDesc: 'The key is stored in this plugin\'s local data.json file.',
    settingApiQueryParams: 'Additional query parameters',
    settingApiQueryParamsDesc: 'Optional URL query string, such as api-version=2025-03-01-preview.',
    settingFetchModels: 'Model list',
    settingFetchModelsDesc: 'Fetch models from /models and save the updated list to the local configuration file.',
    settingFetchModelsBtn: 'Fetch models',
    settingFetchingModelsBtn: 'Fetching…',
    settingModel: 'AI model',
    settingModelDesc: 'Select a model fetched and saved in the local configuration.',
    settingModelEmpty: 'Fetch models first',
    modelsFetched: (count) => `Fetched and saved ${count} models`,
    settingResultFile: 'Translation archive file',
    settingResultFileDesc: 'Translations are written as a table to this Markdown file (vault-relative path).',
    settingPickFile: 'Choose archive file',
    settingPickFileDesc: 'Click the button to quickly pick an existing Markdown file via search.',
    settingPickBtn: 'Search and select…',
    fuzzyPlaceholder: 'Type to search Markdown files…',
    settingRotationInterval: 'Word rotation interval',
    settingRotationIntervalDesc: 'Interval for rotating archived words while idle, in seconds.',
    settingPrompt: 'Translation prompt',
    settingPromptDesc: 'The translation prompt sent to the AI as a system message.',
    settingResetPrompt: 'Reset prompt',
    settingResetBtn: 'Restore default',
    fileSelected: (p) => `Archive file selected: ${p}`,
    errorTitle: 'Translation failed',
    errorDetailLabel: 'Details',
    errConfigUrl: 'Set the API Base URL in settings first.',
    errConfigKey: 'Set the API key in settings first.',
    errConfigModel: 'Fetch and select an AI model first.',
    errAuth: 'The API key is invalid or does not have access.',
    errQuota: 'Quota exhausted or rate limited. Please try again later or check your account usage.',
    errNetwork: 'Network connection failed. Please check your network or proxy settings and retry.',
    errNotFound: 'The endpoint was not found. Check the Base URL and whether it includes /v1.',
    errServer: 'The AI service is temporarily unavailable. Please try again later.',
    errBadResponse: 'The AI service returned an incompatible response.',
    errEmpty: 'The AI returned no content. Please retry or check your prompt settings.',
    errHttp: (code) => `AI request failed (HTTP ${code}).`,
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
    const data = (await this.loadData()) || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    // Guard against empty strings persisted by older versions: an empty
    // string would otherwise override the default via Object.assign, leaving
    // the archive path blank and writing to an unexpected location.
    if (!this.settings.resultFilePath || !this.settings.resultFilePath.trim()) {
      this.settings.resultFilePath = DEFAULT_SETTINGS.resultFilePath;
    }
    if (!this.settings.prompt || !this.settings.prompt.trim()) {
      this.settings.prompt = DEFAULT_SETTINGS.prompt;
    }
    if (this.settings.language !== 'en' && this.settings.language !== 'zh') {
      this.settings.language = DEFAULT_SETTINGS.language;
    }
    if (!Array.isArray(this.settings.availableModels)) {
      this.settings.availableModels = [];
    }
    this.settings.availableModels = [...new Set(this.settings.availableModels
      .filter((id) => typeof id === 'string' && id.trim())
      .map((id) => id.trim()))].sort();
    const interval = Number(this.settings.rotationIntervalSeconds);
    if (!Number.isFinite(interval) || interval <= 0) {
      this.settings.rotationIntervalSeconds = DEFAULT_SETTINGS.rotationIntervalSeconds;
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  getResultFilePath() {
    let filePath = (this.settings.resultFilePath || '').trim() || 'Translations.md';
    filePath = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!/\.md$/i.test(filePath)) filePath += '.md';
    return filePath;
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

  // ---------- OpenAI-compatible API ----------

  makeApiError(friendly, detail) {
    const err = new Error(friendly);
    err.friendly = friendly;
    err.detail = (detail || '').trim();
    return err;
  }

  getApiUrl(endpoint) {
    const baseUrl = (this.settings.apiBaseUrl || '').trim();
    if (!baseUrl) throw this.makeApiError(this.t('errConfigUrl'), '');
    let url;
    try {
      url = new URL(`${baseUrl.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`);
    } catch (_) {
      throw this.makeApiError(this.t('errConfigUrl'), '');
    }
    const query = new URLSearchParams((this.settings.apiQueryParams || '').trim().replace(/^\?/, ''));
    for (const [key, value] of query) url.searchParams.set(key, value);
    return url.toString();
  }

  getApiHeaders() {
    const apiKey = (this.settings.apiKey || '').trim();
    if (!apiKey) throw this.makeApiError(this.t('errConfigKey'), '');
    return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  }

  extractApiError(response) {
    const message = response?.json?.error?.message || response?.json?.message || response?.text || '';
    return String(message).trim().slice(0, 1000);
  }

  async apiRequest(options) {
    try {
      const response = await requestUrl(options);
      if (response.status < 200 || response.status >= 300) {
        throw this.makeApiError(this.classifyApiError(response.status), this.extractApiError(response));
      }
      return response;
    } catch (err) {
      if (err?.friendly) throw err;
      const status = Number(err?.status);
      if (Number.isFinite(status) && status > 0) {
        throw this.makeApiError(this.classifyApiError(status), this.extractApiError(err));
      }
      throw this.makeApiError(this.t('errNetwork'), err?.message || String(err));
    }
  }

  async fetchModels() {
    const response = await this.apiRequest({
      url: this.getApiUrl('models'),
      method: 'GET',
      headers: this.getApiHeaders(),
      throw: false,
    });
    const data = response.json?.data;
    if (!Array.isArray(data)) throw this.makeApiError(this.t('errBadResponse'), 'Missing data array in /models response.');
    const models = [...new Set(data
      .map((item) => item?.id)
      .filter((id) => typeof id === 'string' && id.trim())
      .map((id) => id.trim()))].sort();
    if (models.length === 0) throw this.makeApiError(this.t('errBadResponse'), 'The /models response contained no model IDs.');
    this.settings.availableModels = models;
    if (!models.includes(this.settings.model)) this.settings.model = models[0];
    await this.saveSettings();
    return models;
  }

  classifyApiError(status) {
    if (status === 401 || status === 403) return this.t('errAuth');
    if (status === 404) return this.t('errNotFound');
    if (status === 429) return this.t('errQuota');
    if (status >= 500) return this.t('errServer');
    return this.t('errHttp')(status);
  }

  async translateViaApi(word) {
    const model = (this.settings.model || '').trim();
    if (!model) throw this.makeApiError(this.t('errConfigModel'), '');
    const response = await this.apiRequest({
      url: this.getApiUrl('chat/completions'),
      method: 'POST',
      headers: this.getApiHeaders(),
      contentType: 'application/json',
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: this.settings.prompt },
          { role: 'user', content: word },
        ],
        stream: false,
      }),
      throw: false,
    });
    const content = response.json?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw this.makeApiError(this.t('errBadResponse'), 'Missing choices[0].message.content.');
    const meaning = content.trim();
    if (!meaning) {
      throw this.makeApiError(this.t('errEmpty'), '');
    }
    return meaning;
  }

  // ---------- Write translation into the Markdown table (dedupe: update if exists) ----------

  async appendTranslation(word, meaning) {
    // Normalize to a vault-relative POSIX path. Fall back to the default when
    // the setting is blank so archiving never silently no-ops.
    const filePath = this.getResultFilePath();
    const now = window.moment
      ? window.moment().format('YYYY-MM-DD HH:mm:ss')
      : new Date().toLocaleString();

    let content = '';
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) {
      content = await this.app.vault.read(file);
    }

    // Rebuild only Claudict's table; preserve frontmatter and all other Markdown.
    const result = updateArchiveTable(content, word, meaning, now);

    if (file instanceof TFile) {
      await this.app.vault.modify(file, result.content);
    } else {
      const separatorIndex = filePath.lastIndexOf('/');
      const dir = separatorIndex === -1 ? '.' : filePath.slice(0, separatorIndex);
      if (dir && dir !== '.' && !this.app.vault.getAbstractFileByPath(dir)) {
        try { await this.app.vault.createFolder(dir); } catch (_) {}
      }
      await this.app.vault.create(filePath, result.content);
    }

    return { replaced: result.replaced, time: now };
  }

  async readArchivedTranslations() {
    const file = this.app.vault.getAbstractFileByPath(this.getResultFilePath());
    if (!(file instanceof TFile)) return [];

    const content = await this.app.vault.read(file);
    const entries = [];
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line.startsWith('|')) continue;

      const cells = splitMarkdownTableRow(line);
      const word = cells[1];
      const meaning = cells[2];
      if (!word || !meaning) continue;
      if (HEADER_FIRST_COLS.includes(word)) continue;
      if (/^:?-{1,}:?$/.test(word)) continue;

      entries.push({ word: unescapeCell(word), meaning: unescapeCell(meaning) });
    }
    return entries;
  }
}

function escapeCell(text) {
  return String(text).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

function unescapeCell(text) {
  return String(text).replace(/\\\|/g, '|').trim();
}

function splitMarkdownTableRow(line) {
  const cells = [];
  let cell = '';
  let escaped = false;
  for (const ch of line) {
    if (ch === '|' && !escaped) {
      cells.push(cell.trim());
      cell = '';
      continue;
    }
    cell += ch;
    escaped = ch === '\\' && !escaped;
    if (ch !== '\\') escaped = false;
  }
  cells.push(cell.trim());
  return cells;
}

function isSeparatorRow(line) {
  const cells = splitMarkdownTableRow(line);
  return cells.length >= 5 && cells.slice(1, 4).every((cell) => /^:?-{1,}:?$/.test(cell));
}

function findArchiveTable(content) {
  const lines = content.match(/.*(?:\n|$)/g) || [];
  let offset = 0;

  for (let index = 0; index < lines.length - 1; index++) {
    const header = lines[index].replace(/\r?\n$/, '').trim();
    const firstCell = splitMarkdownTableRow(header)[1];
    const separator = lines[index + 1].replace(/\r?\n$/, '').trim();
    if (!HEADER_FIRST_COLS.includes(firstCell) || !isSeparatorRow(separator)) {
      offset += lines[index].length;
      continue;
    }

    let endIndex = index + 2;
    while (endIndex < lines.length && lines[endIndex].replace(/\r?\n$/, '').trim().startsWith('|')) {
      endIndex++;
    }

    const tableLines = lines.slice(index, endIndex);
    const lastTableLine = tableLines[tableLines.length - 1];
    const trailingLineEndingLength = lastTableLine.endsWith('\r\n') ? 2 : lastTableLine.endsWith('\n') ? 1 : 0;
    return {
      start: offset,
      end: offset + tableLines.join('').length - trailingLineEndingLength,
      rows: lines.slice(index + 2, endIndex).map((line) => line.replace(/\r?\n$/, '').trim()),
    };
  }

  return null;
}

function updateArchiveTable(content, word, meaning, time) {
  const table = findArchiveTable(content);
  const escapedWord = escapeCell(word);
  const newRow = `| ${escapedWord} | ${escapeCell(meaning)} | ${time} |`;
  const rows = table ? table.rows : [];
  let replaced = false;
  const retainedRows = rows.filter((row) => {
    const existingWord = splitMarkdownTableRow(row)[1];
    const isDuplicate = existingWord && existingWord.toLowerCase() === escapedWord.toLowerCase();
    replaced ||= Boolean(isDuplicate);
    return !isDuplicate;
  });
  const replacement = [
    `| ${TABLE_HEADERS[0]} | ${TABLE_HEADERS[1]} | ${TABLE_HEADERS[2]} |`,
    '| --- | --- | --- |',
    newRow,
    ...retainedRows,
  ].join('\n');

  if (table) {
    return {
      content: content.slice(0, table.start) + replacement + content.slice(table.end),
      replaced,
    };
  }

  const separator = content && !content.endsWith('\n\n') ? (content.endsWith('\n') ? '\n' : '\n\n') : '';
  return { content: content + separator + replacement + '\n', replaced };
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
    this.stopIdleRotation();
  }

  // Full render (also called to refresh after a language switch).
  renderContent() {
    this.stopIdleRotation();
    if (this._resultTimer) { clearTimeout(this._resultTimer); this._resultTimer = null; }
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
      this.startIdleRotation(resultEl);
    };

    showIdle();

    const stopResultTimers = () => {
      if (this._resultTimer) { clearTimeout(this._resultTimer); this._resultTimer = null; }
      this.stopIdleRotation();
    };

    const doTranslate = async () => {
      const word = input.value.trim();
      if (!word) { new Notice(t('inputWordFirst')); return; }
      btn.disabled = true;
      btn.setText(t('translating'));
      stopResultTimers();
      resultEl.empty();
      resultEl.createSpan({ text: t('callingAi'), cls: 'claudict-loading' });
      try {
        const meaning = await this.plugin.translateViaApi(word);
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

  stopIdleRotation() {
    this._idleToken = null;
    if (this._idleTimer) { clearInterval(this._idleTimer); this._idleTimer = null; }
  }

  startIdleRotation(resultEl) {
    this.stopIdleRotation();
    const token = Symbol('idle');
    this._idleToken = token;

    resultEl.empty();
    const idleEl = resultEl.createDiv({ cls: 'claudict-idle' });
    const wordEl = idleEl.createDiv({ cls: 'claudict-idle-word' });
    const meaningEl = idleEl.createDiv({ cls: 'claudict-idle-meaning' });

    void this.plugin.readArchivedTranslations().then((entries) => {
      if (this._idleToken !== token || !idleEl.isConnected || entries.length === 0) return;

      let index = 0;
      const renderEntry = () => {
        const entry = entries[index];
        wordEl.setText(entry.word);
        meaningEl.setText(entry.meaning);
      };

      renderEntry();
      this._idleTimer = setInterval(() => {
        if (this._idleToken !== token || !idleEl.isConnected) {
          this.stopIdleRotation();
          return;
        }
        index = (index + 1) % entries.length;
        renderEntry();
      }, this.plugin.settings.rotationIntervalSeconds * 1000);
    });
  }

  // Render an error with a red highlighted title (the friendly reason) and,
  // when available, the sanitized API error in a readable code block below.
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

    // OpenAI-compatible API connection
    new Setting(containerEl)
      .setName(t('settingApiBaseUrl'))
      .setDesc(t('settingApiBaseUrlDesc'))
      .addText((text) => {
        text
          .setPlaceholder('https://api.openai.com/v1')
          .setValue(this.plugin.settings.apiBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.apiBaseUrl = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t('settingApiKey'))
      .setDesc(t('settingApiKeyDesc'))
      .addText((text) => {
        text
          .setPlaceholder('sk-...')
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'password';
        text.inputEl.autocomplete = 'off';
      });

    new Setting(containerEl)
      .setName(t('settingApiQueryParams'))
      .setDesc(t('settingApiQueryParamsDesc'))
      .addText((text) => {
        text
          .setPlaceholder('api-version=2025-03-01-preview')
          .setValue(this.plugin.settings.apiQueryParams)
          .onChange(async (value) => {
            this.plugin.settings.apiQueryParams = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t('settingFetchModels'))
      .setDesc(t('settingFetchModelsDesc'))
      .addButton((btn) => btn
        .setButtonText(t('settingFetchModelsBtn'))
        .setCta()
        .onClick(async () => {
          btn.setDisabled(true).setButtonText(t('settingFetchingModelsBtn'));
          try {
            const models = await this.plugin.fetchModels();
            new Notice(t('modelsFetched')(models.length));
            this.display();
          } catch (err) {
            new Notice(err?.friendly || err?.message || String(err));
            btn.setDisabled(false).setButtonText(t('settingFetchModelsBtn'));
          }
        }));

    new Setting(containerEl)
      .setName(t('settingModel'))
      .setDesc(t('settingModelDesc'))
      .addDropdown((dd) => {
        const models = this.plugin.settings.availableModels;
        if (models.length === 0) dd.addOption('', t('settingModelEmpty'));
        for (const model of models) dd.addOption(model, model);
        dd.setValue(this.plugin.settings.model);
        dd.onChange(async (value) => {
          this.plugin.settings.model = value;
          await this.plugin.saveSettings();
        });
      });

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

    new Setting(containerEl)
      .setName(t('settingRotationInterval'))
      .setDesc(t('settingRotationIntervalDesc'))
      .addText((text) => {
        text
          .setPlaceholder(String(DEFAULT_SETTINGS.rotationIntervalSeconds))
          .setValue(String(this.plugin.settings.rotationIntervalSeconds))
          .onChange(async (value) => {
            const interval = Number(value);
            this.plugin.settings.rotationIntervalSeconds = Number.isFinite(interval) && interval > 0
              ? interval
              : DEFAULT_SETTINGS.rotationIntervalSeconds;
            await this.plugin.saveSettings();
            this.plugin.refreshAllViews();
          });
      });

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
