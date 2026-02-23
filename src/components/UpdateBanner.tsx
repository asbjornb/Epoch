import { useState, useEffect, useCallback } from "react";

declare const __BUILD_TIMESTAMP__: string;

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function UpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const checkForUpdate = useCallback(async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}version.json?_=${Date.now()}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.v && data.v !== __BUILD_TIMESTAMP__) {
        setUpdateAvailable(true);
      }
    } catch {
      // Network error — ignore silently
    }
  }, []);

  useEffect(() => {
    // Don't check in dev mode
    if (import.meta.env.DEV) return;

    // Initial check after a short delay
    const initialTimeout = setTimeout(checkForUpdate, 30_000);
    const interval = setInterval(checkForUpdate, CHECK_INTERVAL);
    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [checkForUpdate]);

  if (!updateAvailable) return null;

  return (
    <div className="update-banner" onClick={() => window.location.reload()}>
      <span className="update-banner-text">A new version is available</span>
      <button className="update-banner-btn">Refresh</button>
    </div>
  );
}
