import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Maximize2,
  Minimize2,
  Pencil,
  Play,
  Pause,
  Plus,
  X,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { extractYouTubeVideoId } from "@/lib/youtube";
import { useYouTubeIframeApi } from "@/hooks/useYouTubeIframeApi";

type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  getPlayerState: () => number;
  cueVideoById?: (videoId: string) => void;
  loadVideoById?: (videoId: string) => void;
  destroy: () => void;
};

type YouTubeQuadrantProps = {
  index: number;
  videoId: string | null;
  maximized: boolean;
  anyMaximized: boolean;
  onToggleMaximize: () => void;
  onSetVideoId: (next: string | null) => void;
  hidden?: boolean;
};

export function YouTubeQuadrant(props: YouTubeQuadrantProps) {
  const { ready } = useYouTubeIframeApi();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const lastVideoIdRef = useRef<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftUrl, setDraftUrl] = useState("");

  const title = useMemo(() => `Quadrante ${props.index + 1}`, [props.index]);

  useEffect(() => {
    if (!ready) return;

    // If no video, destroy any existing player.
    if (!props.videoId) {
      lastVideoIdRef.current = null;
      setIsPlaying(false);
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
      return;
    }

    if (!containerRef.current) return;

    const YT = (window as any).YT;
    if (!YT?.Player) return;

    const onStateChange = (evt: any) => {
      const state = evt?.data;
      // 1 = playing, 2 = paused
      setIsPlaying(state === 1);
    };

    if (!playerRef.current) {
      playerRef.current = new YT.Player(containerRef.current, {
        width: "100%",
        height: "100%",
        videoId: props.videoId,
        playerVars: {
          controls: 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          fs: 0,
          iv_load_policy: 3,
          disablekb: 1,
        },
        events: {
          onStateChange,
        },
      });
      lastVideoIdRef.current = props.videoId;
      return;
    }

    // Update an existing player when videoId changes.
    if (lastVideoIdRef.current !== props.videoId) {
      lastVideoIdRef.current = props.videoId;
      setIsPlaying(false);
      const p = playerRef.current;
      if (p.cueVideoById) p.cueVideoById(props.videoId);
      else if (p.loadVideoById) p.loadVideoById(props.videoId);
    }
  }, [ready, props.videoId]);

  useEffect(() => {
    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, []);

  const togglePlayPause = () => {
    const p = playerRef.current;
    if (!p) return;
    const state = p.getPlayerState();
    // 1 = playing
    if (state === 1) p.pauseVideo();
    else p.playVideo();
  };

  const startEditing = () => {
    setDraftUrl("");
    setEditing(true);
  };

  const saveDraft = () => {
    const id = extractYouTubeVideoId(draftUrl);
    if (!id) return;
    props.onSetVideoId(id);
    setEditing(false);
    setDraftUrl("");
  };

  const clearVideo = () => {
    props.onSetVideoId(null);
    setEditing(false);
    setDraftUrl("");
  };

  return (
    <div
      className={cn(
        "group relative h-full w-full overflow-hidden bg-black",
        props.hidden ? "hidden" : "block",
        props.anyMaximized && !props.maximized ? "pointer-events-none" : ""
      )}
      aria-label={title}
    >
      {props.videoId ? (
        <div className="absolute inset-0">
          <div ref={containerRef} className="h-full w-full" />
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/80 hover:bg-white/10"
            onClick={startEditing}
          >
            <Plus className="h-4 w-4" />
            Adicionar link
          </button>
        </div>
      )}

      {/* Hover overlay */}
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-black/40" />

        <div className="pointer-events-auto absolute left-3 top-3 flex gap-2">
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="h-9 w-9 rounded-xl bg-white/10 text-white hover:bg-white/15"
            onClick={startEditing}
            aria-label="Editar link"
          >
            <Pencil className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="h-9 w-9 rounded-xl bg-white/10 text-white hover:bg-white/15"
            onClick={props.onToggleMaximize}
            aria-label={props.maximized ? "Restaurar" : "Maximizar"}
          >
            {props.maximized ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="pointer-events-auto absolute bottom-3 left-3 flex gap-2">
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="h-10 w-10 rounded-xl bg-white/10 text-white hover:bg-white/15"
            onClick={togglePlayPause}
            disabled={!props.videoId}
            aria-label={isPlaying ? "Pausar" : "Play"}
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Edit overlay */}
      {editing ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-6">
          <div className="w-full max-w-xl space-y-3 rounded-2xl border border-white/10 bg-black/60 p-4">
            <div className="text-sm font-medium text-white">{title}</div>
            <Input
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              placeholder="Cole aqui o link do YouTube (watch, youtu.be, embed…)"
              className="h-11 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/40"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") saveDraft();
                if (e.key === "Escape") setEditing(false);
              }}
            />

            <div className="flex items-center justify-between gap-3">
              <div className="flex gap-2">
                <Button
                  type="button"
                  className="h-10 rounded-xl"
                  onClick={saveDraft}
                  disabled={!draftUrl.trim()}
                >
                  <Check className="mr-2 h-4 w-4" />
                  Salvar
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 rounded-xl"
                  onClick={() => setEditing(false)}
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancelar
                </Button>
              </div>

              <Button
                type="button"
                variant="destructive"
                className="h-10 rounded-xl"
                onClick={clearVideo}
                disabled={!props.videoId}
              >
                Limpar
              </Button>
            </div>

            {draftUrl.trim() ? (
              <div className="text-xs text-white/60">
                {extractYouTubeVideoId(draftUrl)
                  ? "Link válido."
                  : "Não consegui extrair o videoId desse link."}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
