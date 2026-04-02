export type LinkifiedTextToken =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string; href: string };

const LINK_REGEX = /(https?:\/\/[^\s<]+)/gi;

const TRAILING_PUNCTUATION_REGEX = /[.,!?;:]+$/;

function trimUrlCandidate(url: string): { href: string; trailing: string } {
  let href = url;
  let trailing = '';

  const punctuationMatch = href.match(TRAILING_PUNCTUATION_REGEX);
  if (punctuationMatch) {
    trailing = punctuationMatch[0] + trailing;
    href = href.slice(0, -punctuationMatch[0].length);
  }

  while (href.endsWith(')') && (href.match(/\(/g)?.length || 0) < (href.match(/\)/g)?.length || 0)) {
    href = href.slice(0, -1);
    trailing = `)${trailing}`;
  }

  while (href.endsWith(']') && (href.match(/\[/g)?.length || 0) < (href.match(/\]/g)?.length || 0)) {
    href = href.slice(0, -1);
    trailing = `]${trailing}`;
  }

  return { href, trailing };
}

export function tokenizeLinkifiedText(text: string): LinkifiedTextToken[] {
  if (!text) return [];

  const tokens: LinkifiedTextToken[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(LINK_REGEX)) {
    const rawUrl = match[0];
    const matchIndex = match.index ?? 0;

    if (matchIndex > lastIndex) {
      tokens.push({ type: 'text', value: text.slice(lastIndex, matchIndex) });
    }

    const { href, trailing } = trimUrlCandidate(rawUrl);
    if (href) {
      tokens.push({ type: 'link', value: href, href });
    }
    if (trailing) {
      tokens.push({ type: 'text', value: trailing });
    }

    lastIndex = matchIndex + rawUrl.length;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return tokens;
}
