import { useEffect, useMemo, useState } from "react";
import { YouTubeQuadrant } from "@/components/youtube/YouTubeQuadrant";

const STORAGE_KEY = "youtube_wall_2x2_video_ids_v1";

type WallState = {
  videoIds: Array<string | null>;
};

function normalizeState(raw: unknown): WallState {
  const fallback: WallState = { videoIds: [null, null, null, null] };
  if (!raw || typeof raw !== "object") return fallback;

  const any = raw as any;
  const ids = Array.isArray(any.videoIds) ? any.videoIds : null;
  if (!ids) return fallback;

  const videoIds: Array<string | null> = [null, null, null, null];
  for (let i = 0; i < 4; i++) {
    const v = ids[i];
    videoIds[i] = typeof v === "string" && v.trim() ? v.trim() : null;
  }

  return { videoIds };
}

export default function Screen() {
  const [videoIds, setVideoIds] = useState<Array<string | null>>([
    null,
    null,
    null,
    null,
  ]);
  const [maximizedIdx, setMaximizedIdx] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const next = normalizeState(parsed);
      setVideoIds(next.videoIds);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const payload: WallState = { videoIds };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [videoIds]);

  const anyMaximized = maximizedIdx !== null;

  const gridClass = useMemo(() => {
    if (anyMaximized) return "grid grid-cols-1 grid-rows-1";
    return "grid grid-cols-2 grid-rows-2";
  }, [anyMaximized]);

  return (
    <div className="h-screen w-screen bg-black">
      <div className={"h-full w-full " + gridClass}>
        {videoIds.map((id, idx) => {
          const hidden = maximizedIdx !== null && maximizedIdx !== idx;
          const maximized = maximizedIdx === idx;

          return (
            <div
              key={idx}
              className={
                "relative h-full w-full border border-white/10 " +
                (hidden ? "hidden" : "block")
              }
            >
              <YouTubeQuadrant
                index={idx}
                videoId={id}
                hidden={false}
                maximized={maximized}
                anyMaximized={anyMaximized}
                onToggleMaximize={() =>
                  setMaximizedIdx((cur) => (cur === idx ? null : idx))
                }
                onSetVideoId={(next) =>
                  setVideoIds((cur) => {
                    const copy = [...cur];
                    copy[idx] = next;
                    return copy;
                  })
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
