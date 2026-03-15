import { ComponentType, LazyExoticComponent, lazy } from "react";

/**
 * A wrapper around React.lazy that adds a retry mechanism specifically for chunk load failures.
 * This happens when a new version of the app is deployed and the browser tries to load a hash
 * that no longer exists on the server.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  return lazy(async () => {
    const pageHasAlreadyBeenForceRefreshed = JSON.parse(
      window.sessionStorage.getItem("page-has-been-force-refreshed") || "false"
    );

    try {
      const component = await componentImport();
      window.sessionStorage.setItem("page-has-been-force-refreshed", "false");
      return component;
    } catch (error) {
      if (!pageHasAlreadyBeenForceRefreshed) {
        // Logging the error for diagnostics
        console.error("Chunk load failed. Force refreshing the page...", error);
        
        // Mark as refreshed to avoid infinite reload loops
        window.sessionStorage.setItem("page-has-been-force-refreshed", "true");
        window.location.reload();
        
        // Return a promise that never resolves while the page reloads
        return new Promise(() => {});
      }

      // If we already tried refreshing once and it still fails, throw the error
      throw error;
    }
  });
}
