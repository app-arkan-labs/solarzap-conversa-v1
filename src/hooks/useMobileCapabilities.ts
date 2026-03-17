import { useMemo } from 'react';

interface MobileCapabilities {
  isTouchDevice: boolean;
  isIOSWebKit: boolean;
  isMobileChatExperience: boolean;
}

let cached: MobileCapabilities | null = null;

function detect(): MobileCapabilities {
  if (cached) return cached;
  if (typeof window === 'undefined') {
    return { isTouchDevice: false, isIOSWebKit: false, isMobileChatExperience: false };
  }

  const ua = navigator.userAgent;
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isIOSWebKit = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && isTouchDevice);
  const isMobileChatExperience = isTouchDevice && window.matchMedia('(max-width: 1023px)').matches;

  cached = { isTouchDevice, isIOSWebKit, isMobileChatExperience };
  return cached;
}

export function useMobileCapabilities(): MobileCapabilities {
  return useMemo(() => detect(), []);
}

/** Non-hook helper for use outside React components */
export function getMobileCapabilities(): MobileCapabilities {
  return detect();
}
