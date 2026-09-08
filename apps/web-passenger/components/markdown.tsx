function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(raw: string) {
  let s = escapeHtml(raw);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/g,
    '<a href="$2" rel="noopener noreferrer">$1</a>',
  );
  return s;
}

export function renderMarkdown(src: string) {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let list: string[] = [];

  const flushList = () => {
    if (!list.length) return;
    out.push(`<ul>${list.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`);
    list = [];
  };

  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      flushList();
      continue;
    }
    if (/^[-*] /.test(t)) {
      list.push(t.replace(/^[-*] /, ''));
      continue;
    }
    flushList();
    if (/^### /.test(t)) out.push(`<h3>${inline(t.slice(4))}</h3>`);
    else if (/^## /.test(t)) out.push(`<h2>${inline(t.slice(3))}</h2>`);
    else if (/^# /.test(t)) out.push(`<h2>${inline(t.slice(2))}</h2>`);
    else if (/^---+$/.test(t)) out.push('<hr />');
    else out.push(`<p>${inline(t)}</p>`);
  }
  flushList();
  return out.join('');
}

export function Markdown({ source }: { source: string }) {
  return (
    <div
      className="md-body"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }}
    />
  );
}
