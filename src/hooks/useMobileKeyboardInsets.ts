import { useState, useEffect, useCallback } from 'react';

interface KeyboardInsets {
  keyboardHeight: number;
  viewportHeight: number;
  isKeyboardOpen: boolean;
}

/**
 * Observes window.visualViewport to detect virtual keyboard presence
 * and compute real usable height on iOS / Android mobile browsers.
 */
export function useMobileKeyboardInsets(): KeyboardInsets {
  const [insets, setInsets] = useState<KeyboardInsets>(() => ({
    keyboardHeight: 0,
    viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
    isKeyboardOpen: false,
  }));

  const update = useCallback(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const fullHeight = window.innerHeight;
    const viewportHeight = vv.height;
    const keyboardHeight = Math.max(0, Math.round(fullHeight - viewportHeight));
    const isKeyboardOpen = keyboardHeight > 100; // threshold to avoid false positives from address bar changes

    setInsets(prev => {
      if (prev.keyboardHeight === keyboardHeight && prev.viewportHeight === viewportHeight) return prev;
      return { keyboardHeight, viewportHeight, isKeyboardOpen };
    });
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [update]);

  return insets;
}
