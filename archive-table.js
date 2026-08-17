'use strict';

const TABLE_HEADERS = ['English Word', 'Chinese Meaning', 'Query Time'];
const HEADER_FIRST_COLS = ['English Word', '英语单词'];

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
      // Leave the final row's line ending in place so blank lines and other
      // document content immediately after the table remain byte-for-byte.
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

module.exports = { escapeCell, unescapeCell, splitMarkdownTableRow, updateArchiveTable };
