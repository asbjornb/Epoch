import { useEffect, useRef, useState, useCallback } from "react";

const STORAGE_KEY = "epoch_keep_screen_on";

export function useWakeLock() {
  const [enabled, setEnabled] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) === "true";
  });
  const [active, setActive] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const supported = "wakeLock" in navigator;

  // Acquire/release when enabled changes
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;

    if (enabled) {
      navigator.wakeLock.request("screen").then(
        (sentinel) => {
          if (cancelled) {
            sentinel.release();
            return;
          }
          wakeLockRef.current = sentinel;
          setActive(true);
          sentinel.addEventListener("release", () => {
            wakeLockRef.current = null;
            setActive(false);
          });
        },
        () => {
          // request can fail if page is hidden or permission denied
        },
      );
    } else if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }

    return () => {
      cancelled = true;
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    };
  }, [enabled, supported]);

  // Re-acquire when tab becomes visible again (wake lock auto-releases on hide)
  useEffect(() => {
    if (!enabled || !supported) return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && !wakeLockRef.current) {
        navigator.wakeLock.request("screen").then(
          (sentinel) => {
            wakeLockRef.current = sentinel;
            setActive(true);
            sentinel.addEventListener("release", () => {
              wakeLockRef.current = null;
              setActive(false);
            });
          },
          () => { /* ignore */ },
        );
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [enabled, supported]);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  return { supported, enabled, active, toggle };
}
