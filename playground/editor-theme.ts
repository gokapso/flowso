import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

/** Light JSON theme in the spirit of Slack's Block Kit Builder payload editor. */
export const flowsoEditorTheme = [
  EditorView.theme({
    '&': { backgroundColor: '#ffffff', color: '#1d1c1d', fontSize: '13px' },
    '.cm-content': { fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", padding: '12px 0', lineHeight: '1.6' },
    '.cm-gutters': { backgroundColor: '#ffffff', color: '#9a9a9a', border: 'none', paddingLeft: '8px' },
    '.cm-lineNumbers .cm-gutterElement': { minWidth: '36px', paddingRight: '12px' },
    '.cm-activeLine': { backgroundColor: '#f6f7fb' },
    '.cm-activeLineGutter': { backgroundColor: '#f6f7fb', color: '#1d1c1d' },
    '&.cm-focused': { outline: 'none' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: '#dbe7ff !important' },
    '.cm-cursor': { borderLeftColor: '#1d1c1d' },
    '.cm-matchingBracket': { backgroundColor: '#e8f5f1', outline: '1px solid #b7e1d1' },
    '.cm-foldGutter .cm-gutterElement': { color: '#c4c4c4' },
    '.cm-lint-marker-error': { content: 'none' },
    '.cm-diagnostic-error': { borderLeftColor: '#e01e5a' },
    '.cm-diagnostic-warning': { borderLeftColor: '#ecb22e' },
    '.cm-tooltip': { border: '1px solid #e6e6e6', borderRadius: '8px', backgroundColor: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' },
  }),
  syntaxHighlighting(
    HighlightStyle.define([
      { tag: tags.propertyName, color: '#34426e' },
      { tag: tags.string, color: '#007a5a' },
      { tag: tags.number, color: '#e01e5a' },
      { tag: tags.bool, color: '#1264a3', fontWeight: '600' },
      { tag: tags.null, color: '#1264a3', fontWeight: '600' },
      { tag: tags.punctuation, color: '#7a7a7a' },
      { tag: tags.brace, color: '#7a7a7a' },
      { tag: tags.squareBracket, color: '#7a7a7a' },
      { tag: tags.invalid, color: '#e01e5a', textDecoration: 'underline wavy' },
    ]),
  ),
];
