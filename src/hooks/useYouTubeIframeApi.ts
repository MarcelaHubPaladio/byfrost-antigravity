import { useEffect, useState } from "react";

let ytApiPromise: Promise<void> | null = null;

function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();

  // Already available
  if ((window as any).YT?.Player) return Promise.resolve();

  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise<void>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]'
    );

    const wireReady = () => {
      const prev = (window as any).onYouTubeIframeAPIReady;
      (window as any).onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve();
      };
    };

    if (existing) {
      wireReady();
      return;
    }

    wireReady();

    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });

  return ytApiPromise;
}

export function useYouTubeIframeApi() {
  const [ready, setReady] = useState(
    typeof window !== "undefined" ? Boolean((window as any).YT?.Player) : false
  );

  useEffect(() => {
    let cancelled = false;
    loadYouTubeIframeApi().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { ready };
}