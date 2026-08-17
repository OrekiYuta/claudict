# Preserve Markdown Frontmatter During Archive Writes

## Goal

When Claudict saves a translation to an existing archive Markdown file, it must
update only its vocabulary table. YAML frontmatter, including `created` and
`updated` fields, and all other content outside that table must remain exactly
unchanged.

## Scope

This change affects `appendTranslation` in `main.js`. Existing archive behavior
inside the vocabulary table remains unchanged:

- New lookups appear directly below the table header.
- Re-querying a word replaces its prior row case-insensitively.
- The replacement row receives the current query time.
- Cells continue to escape line breaks and pipe characters.

## Table Identification

The archive table is identified by one of the supported first-column header
labels (`English Word` or the legacy `英语单词`) followed by a Markdown table
separator row. The table range starts at that header and includes its separator
and all immediately following table rows.

Only this contiguous range is parsed, deduplicated, and regenerated with the
standard English header and separator. Table-looking lines elsewhere in the
document are not included in the archive table.

## Write Behavior

For an existing archive with an identified vocabulary table:

1. Read and retain the complete original document.
2. Rebuild the identified table with the new or refreshed row at the top.
3. Replace only the identified table character range.
4. Write the resulting document without changing any text before or after that
   range.

This retains YAML frontmatter byte-for-byte, so the plugin neither adds nor
updates frontmatter properties.

For an existing archive without an identified vocabulary table, append the
standard table to the end of the document. Add only the newline separation
needed between existing content and the new table.

For a missing archive, preserve the current behavior: create the parent folder
when necessary and create a new file containing the standard table.

## Error Handling

Malformed or unrelated Markdown tables are treated as non-archive content and
are not modified. If the expected archive header is present but has no valid
separator row, it is also left unchanged and a new archive table is appended.

## Verification

Test the table-replacement helper and archive write behavior with:

- A file containing the supplied YAML frontmatter and vocabulary table; verify
  its frontmatter remains unchanged after saving a new word.
- A re-queried word; verify only its archive-table row is replaced and moved to
  the top.
- Markdown content before and after the archive table; verify both are
  unchanged.
- An existing Markdown file without an archive table; verify a table is
  appended without deleting content.
- A missing archive file; verify creation still produces a valid table.
