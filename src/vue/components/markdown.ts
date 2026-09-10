/** Minimal WhatsApp-style markdown to HTML: *bold*, _italic_, ~strike~, `code`, line breaks. Escapes HTML first. */
export function renderInlineMarkdown(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*(?!\s)(.+?)(?<!\s)\*(?=[\s).,;!?]|$)/g, '$1<strong>$2</strong>')
    .replace(/(^|[\s(])_(?!\s)(.+?)(?<!\s)_(?=[\s).,;!?]|$)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])~(?!\s)(.+?)(?<!\s)~(?=[\s).,;!?]|$)/g, '$1<s>$2</s>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

/** Block-level markdown subset used by RichText: headings, lists, paragraphs, tables are flattened to lines. */
export function renderBlockMarkdown(text: string): string {
  const lines = text.split('\n');
  const html: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  const closeList = () => {
    if (listType) html.push(`</${listType}>`);
    listType = null;
  };
  for (const line of lines) {
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (heading && heading[1] && heading[2] !== undefined) {
      closeList();
      html.push(`<h${heading[1].length}>${renderInlineMarkdown(heading[2])}</h${heading[1].length}>`);
    } else if (bullet && bullet[1] !== undefined) {
      if (listType !== 'ul') {
        closeList();
        listType = 'ul';
        html.push('<ul>');
      }
      html.push(`<li>${renderInlineMarkdown(bullet[1])}</li>`);
    } else if (numbered && numbered[1] !== undefined) {
      if (listType !== 'ol') {
        closeList();
        listType = 'ol';
        html.push('<ol>');
      }
      html.push(`<li>${renderInlineMarkdown(numbered[1])}</li>`);
    } else if (line.trim() === '') {
      closeList();
    } else {
      closeList();
      html.push(`<p>${renderInlineMarkdown(line)}</p>`);
    }
  }
  closeList();

  return html.join('');
}

export function textLines(value: unknown): string {
  if (Array.isArray(value)) return value.map((line) => String(line ?? '')).join('\n');
  if (value === null || value === undefined) return '';

  return String(value);
}
