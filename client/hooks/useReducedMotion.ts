import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// tokens/motion.css collapses every duration to 1ms under prefers-reduced-motion.
// RN has no media query for it, so screens read the OS flag and scale durations
// through `duration()` below rather than each animation checking for itself.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (active) setReduced(value);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { active = false; sub.remove(); };
  }, []);

  return reduced;
}

/** Duration to use for an animation, honouring the OS reduce-motion preference. */
export function duration(ms: number, reduced: boolean): number {
  return reduced ? 1 : ms;
}
