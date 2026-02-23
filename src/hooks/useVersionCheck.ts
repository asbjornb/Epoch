import { useState, useEffect } from "react";

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function useVersionCheck(): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;

    async function check() {
      try {
        const res = await fetch(
          `${import.meta.env.BASE_URL}version.txt?t=${Date.now()}`,
        );
        if (!res.ok) return;
        const remote = (await res.text()).trim();
        if (remote && remote !== __BUILD_HASH__) {
          setUpdateAvailable(true);
        }
      } catch {
        // network error — ignore
      }
    }

    // First check after a short delay so it doesn't slow down startup
    const initial = setTimeout(() => {
      check();
      timer = setInterval(check, CHECK_INTERVAL);
    }, 30_000);

    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, []);

  return updateAvailable;
}
