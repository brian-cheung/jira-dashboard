// Convert Atlassian Document Format (ADF) JSON to HTML
export function adfToHtml(adf) {
  if (!adf) return '';
  if (typeof adf === 'string') {
    // Try to parse as JSON, if it fails return the string as-is (already HTML)
    try { adf = JSON.parse(adf); } catch { return adf; }
  }
  if (!adf.content) return '';

  return adf.content.map(node => renderNode(node)).join('');
}

function renderNode(node) {
  if (!node) return '';

  switch (node.type) {
    case 'paragraph':
      return `<p>${renderContent(node.content)}</p>`;
    case 'heading':
      const level = node.attrs?.level || 1;
      return `<h${level}>${renderContent(node.content)}</h${level}>`;
    case 'bulletList':
      return `<ul>${renderContent(node.content)}</ul>`;
    case 'orderedList':
      return `<ol>${renderContent(node.content)}</ol>`;
    case 'listItem':
      return `<li>${renderContent(node.content)}</li>`;
    case 'codeBlock':
      const lang = node.attrs?.language || '';
      return `<pre><code${lang ? ` class="language-${lang}"` : ''}>${escapeHtml(node.content?.[0]?.text || '')}</code></pre>`;
    case 'blockquote':
      return `<blockquote>${renderContent(node.content)}</blockquote>`;
    case 'rule':
      return '<hr>';
    case 'panel':
      return `<div class="adf-panel">${renderContent(node.content)}</div>`;
    case 'text':
      let text = escapeHtml(node.text || '');
      if (node.marks) {
        for (const mark of node.marks) {
          text = applyMark(text, mark);
        }
      }
      return text;
    case 'mention':
      return `<span class="adf-mention">@${escapeHtml(node.attrs?.text || node.attrs?.id || 'unknown')}</span>`;
    case 'inlineCard':
    case 'blockCard':
      return `<span class="adf-card">[${escapeHtml(node.attrs?.url || 'link')}]</span>`;
    case 'hardBreak':
      return '<br>';
    case 'emoji':
      return node.attrs?.shortName || '';
    case 'media':
      return node.attrs?.url ? `<img src="${escapeHtml(node.attrs.url)}" alt="${escapeHtml(node.attrs.alt || '')}" />` : '';
    case 'mediaGroup':
      return renderContent(node.content);
    case 'table':
      return `<table class="adf-table">${renderContent(node.content)}</table>`;
    case 'tableRow':
      return `<tr>${renderContent(node.content)}</tr>`;
    case 'tableCell':
      return `<td>${renderContent(node.content)}</td>`;
    case 'tableHeader':
      return `<th>${renderContent(node.content)}</th>`;
    default:
      if (node.content) return renderContent(node.content);
      return '';
  }
}

function renderContent(content) {
  if (!content) return '';
  return content.map(node => renderNode(node)).join('');
}

function applyMark(text, mark) {
  switch (mark.type) {
    case 'strong': return `<strong>${text}</strong>`;
    case 'em': return `<em>${text}</em>`;
    case 'underline': return `<u>${text}</u>`;
    case 'strike': return `<s>${text}</s>`;
    case 'code': return `<code>${text}</code>`;
    case 'link': return `<a href="${escapeHtml(mark.attrs?.href || '#')}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    case 'textColor': return `<span style="color:${escapeHtml(mark.attrs?.color || '')}">${text}</span>`;
    default: return text;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
