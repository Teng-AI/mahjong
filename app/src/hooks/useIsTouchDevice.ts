'use client';

import { useState } from 'react';

/**
 * Check if device has touch capabilities (likely mobile)
 * Returns true if the device supports touch events
 */
export function useIsTouchDevice(): boolean {
  const [isTouch] = useState(() => {
    if (typeof window === 'undefined') return false;
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  });

  return isTouch;
}
