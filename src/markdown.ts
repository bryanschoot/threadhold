import DOMPurify from 'dompurify';
import { Marked } from 'marked';

const markdown = new Marked({ gfm: true, breaks: true, async: false });
markdown.use({
  extensions: [{
    name: 'adoMention',
    level: 'inline',
    start(source) {
      const index = source.indexOf('@<');
      return index === -1 ? undefined : index;
    },
    tokenizer(source) {
      const mention = /^@<([a-zA-Z0-9][a-zA-Z0-9-]*)>/.exec(source);
      if (mention) return { type: 'adoMention', raw: mention[0] };
      return undefined;
    },
    renderer(token) {
      // Preserve the reference without pretending its identity has been resolved.
      return token.raw.replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    },
  }],
});
const linkProtocols: Readonly<Record<string, true>> = { 'http:': true, 'https:': true, 'mailto:': true, 'tel:': true };
const imageProtocols: Readonly<Record<string, true>> = { 'http:': true, 'https:': true };

function safeUrl(value: string, protocols: Readonly<Record<string, true>>): URL | undefined {
  try {
    const url = new URL(value, document.baseURI);
    return Object.hasOwn(protocols, url.protocol) ? url : undefined;
  } catch {
    return undefined;
  }
}

/** Render only the preview; the stored Markdown remains the source for editing and publication. */
export function renderMarkdown(body: string): DocumentFragment {
  const fragment = DOMPurify.sanitize(markdown.parse(body, { async: false }), {
    RETURN_DOM_FRAGMENT: true,
    ALLOWED_TAGS: [
      'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'del', 's',
      'a', 'img', 'ul', 'ol', 'li', 'input', 'blockquote', 'pre', 'code', 'table', 'thead',
      'tbody', 'tfoot', 'tr', 'th', 'td', 'div', 'span', 'sup', 'sub', 'kbd', 'details', 'summary',
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'start', 'colspan', 'rowspan', 'align', 'type', 'checked', 'disabled'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
  for (const link of fragment.querySelectorAll('a')) {
    const href = link.getAttribute('href');
    const url = href === null ? undefined : safeUrl(href, linkProtocols);
    if (!url) {
      link.removeAttribute('href');
    } else if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== location.origin) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    // Same-origin links, relative attachment URLs and fragment anchors keep native navigation.
  }
  for (const image of fragment.querySelectorAll('img')) {
    const src = image.getAttribute('src');
    if (src === null || !safeUrl(src, imageProtocols)) {
      image.removeAttribute('src');
    }
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
  }
  for (const input of fragment.querySelectorAll('input')) {
    if (input.getAttribute('type') !== 'checkbox') {
      input.remove();
    } else {
      input.disabled = true;
      input.tabIndex = -1;
    }
  }
  return fragment;
}
