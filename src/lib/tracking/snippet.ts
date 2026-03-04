export const SZAP_ATTR_STORAGE_KEY = '_szap_attr';

export const SZAP_QUERY_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'gclid',
  'gbraid',
  'wbraid',
  'fbclid',
  'ttclid',
  'msclkid',
] as const;

export type SnippetAttrState = Record<string, string>;

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseCookieValue(cookieHeader: string | null | undefined, key: string): string | null {
  const source = cleanString(cookieHeader);
  if (!source) return null;
  const matcher = new RegExp(`(?:^|;\\s*)${key}=([^;]+)`);
  const match = source.match(matcher);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function mergeSnippetAttributionState(input: {
  storedState?: Record<string, unknown> | null;
  currentParams?: URLSearchParams | null;
  locationHref: string;
  referrer?: string | null;
  cookieHeader?: string | null;
  nowMs?: number;
}): SnippetAttrState {
  const nowMs = input.nowMs ?? Date.now();
  const merged: SnippetAttrState = {};

  const stored = input.storedState || {};
  Object.entries(stored).forEach(([key, value]) => {
    const cleaned = cleanString(value);
    if (cleaned) {
      merged[key] = cleaned;
    }
  });

  const params = input.currentParams;
  if (params) {
    SZAP_QUERY_KEYS.forEach((key) => {
      const value = cleanString(params.get(key));
      if (value) {
        merged[key] = value;
      }
    });
  }

  merged._szap_lp = input.locationHref;
  const referrer = cleanString(input.referrer);
  if (referrer) {
    merged._szap_ref = referrer;
  }

  const cookieFbc = parseCookieValue(input.cookieHeader, '_fbc');
  const cookieFbp = parseCookieValue(input.cookieHeader, '_fbp');

  if (cookieFbc) {
    merged._szap_fbc = cookieFbc;
  } else if (cleanString(merged.fbclid)) {
    merged._szap_fbc = `fb.1.${nowMs}.${merged.fbclid}`;
  }

  if (cookieFbp) {
    merged._szap_fbp = cookieFbp;
  }

  return merged;
}

export function buildUniversalAttributionSnippet(): string {
  return `<script>
(function(){
  var STORAGE_KEY = '_szap_attr';
  var KEY_LIST = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','gbraid','wbraid','fbclid','ttclid','msclkid'];

  function readCookie(name){
    var match = document.cookie.match(new RegExp('(?:^|;\\\\s*)' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function loadStored(){
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
    } catch (err) {
      return {};
    }
  }

  var stored = loadStored();
  var params = new URLSearchParams(location.search);
  var data = Object.assign({}, stored);

  KEY_LIST.forEach(function(key){
    var value = params.get(key);
    if (value) data[key] = value;
  });

  data._szap_lp = location.href;
  if (document.referrer) data._szap_ref = document.referrer;

  var fbcCookie = readCookie('_fbc');
  var fbpCookie = readCookie('_fbp');

  if (fbcCookie) data._szap_fbc = fbcCookie;
  else if (data.fbclid) data._szap_fbc = 'fb.1.' + Date.now() + '.' + data.fbclid;

  if (fbpCookie) data._szap_fbp = fbpCookie;

  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));

  document.addEventListener('DOMContentLoaded', function(){
    document.querySelectorAll('form').forEach(function(form){
      Object.keys(data).forEach(function(key){
        if (form.querySelector('input[name="' + key + '"]')) return;
        var input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = String(data[key]);
        form.appendChild(input);
      });
    });
  });
})();
</script>`;
}

