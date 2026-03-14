import * as React from 'react';

const MOBILE_VIEWPORT_QUERY = '(max-width: 1023px)';

export function useMobileViewport() {
  const [isMobileViewport, setIsMobileViewport] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(MOBILE_VIEWPORT_QUERY).matches;
  });

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia(MOBILE_VIEWPORT_QUERY);

    const handleMediaChange = (event: MediaQueryListEvent) => {
      setIsMobileViewport(event.matches);
    };

    setIsMobileViewport(media.matches);

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleMediaChange);
      return () => media.removeEventListener('change', handleMediaChange);
    }

    media.addListener(handleMediaChange);
    return () => media.removeListener(handleMediaChange);
  }, []);

  return isMobileViewport;
}