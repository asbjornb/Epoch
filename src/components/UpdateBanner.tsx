import { useVersionCheck } from "../hooks/useVersionCheck.ts";

export function UpdateBanner({ onBeforeRefresh }: { onBeforeRefresh: () => void }) {
  const updateAvailable = useVersionCheck();

  if (!updateAvailable) return null;

  return (
    <div className="update-banner">
      <span>A new version is available.</span>
      <button className="update-banner-btn" onClick={() => {
        onBeforeRefresh();
        location.reload();
      }}>
        Refresh
      </button>
    </div>
  );
}
