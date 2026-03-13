import React, { useRef, useImperativeHandle, forwardRef } from "react";
import { cn } from "@/lib/utils";

export type Layer = {
  id: string;
  type: "text" | "image" | "shape";
  content: string;
  x: number;
  y: number;
  fontSize?: number;
  color?: string;
  fontWeight?: string;
  width?: number;
  height?: number;
  opacity?: number;
  zIndex: number;
};

type MediaKitCanvasProps = {
  layers: Layer[];
  width: number;
  height: number;
  selectedLayerId: string | null;
  onSelectLayer: (id: string) => void;
  onUpdateLayer: (id: string, delta: Partial<Layer>) => void;
  scale: number;
  entityData?: any;
};

export const MediaKitCanvas = forwardRef<{ exportImage: () => Promise<string> }, MediaKitCanvasProps>(
  ({ layers, width, height, selectedLayerId, onSelectLayer, onUpdateLayer, scale, entityData }, ref) => {
    const canvasRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      exportImage: async () => {
        if (!canvasRef.current) return "";
        const { toPng } = await import("html-to-image");
        return await toPng(canvasRef.current, {
          width,
          height,
          style: {
            transform: "scale(1)",
            left: "0",
            top: "0",
          },
        });
      },
    }));

    const replacePlaceholders = (text: string) => {
      if (!entityData) return text;
      return text.replace(/\{\{(.*?)\}\}/g, (_, key) => {
        const val = entityData[key.trim()];
        return val !== undefined ? String(val) : `{{${key}}}`;
      });
    };

    const handleMouseDown = (e: React.MouseEvent, layer: Layer) => {
      e.stopPropagation();
      onSelectLayer(layer.id);

      const startX = e.clientX;
      const startY = e.clientY;
      const startLayerX = layer.x;
      const startLayerY = layer.y;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const dx = (moveEvent.clientX - startX) / scale;
        const dy = (moveEvent.clientY - startY) / scale;
        onUpdateLayer(layer.id, {
          x: Math.round(startLayerX + dx),
          y: Math.round(startLayerY + dy),
        });
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };

    return (
      <div
        className="relative bg-white shadow-2xl overflow-hidden"
        style={{
          width: width * scale,
          height: height * scale,
        }}
        onClick={() => onSelectLayer("")}
      >
        <div
          ref={canvasRef}
          className="relative h-full w-full"
          style={{
            width,
            height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
        {layers
          .sort((a, b) => a.zIndex - b.zIndex)
          .map((layer) => (
            <div
              key={layer.id}
              onMouseDown={(e) => handleMouseDown(e, layer)}
              className={cn(
                "absolute cursor-move select-none",
                selectedLayerId === layer.id && "ring-2 ring-blue-500 ring-offset-1"
              )}
              style={{
                left: layer.x,
                top: layer.y,
                zIndex: layer.zIndex,
                opacity: layer.opacity ?? 1,
              }}
            >
              {layer.type === "text" && (
                <div
                  style={{
                    fontSize: layer.fontSize,
                    color: layer.color,
                    fontWeight: layer.fontWeight,
                    whiteSpace: "nowrap",
                  }}
                >
                  {replacePlaceholders(layer.content)}
                </div>
              )}
              {layer.type === "image" && (
                <img
                  src={replacePlaceholders(layer.content)}
                  alt=""
                  style={{
                    width: layer.width,
                    height: layer.height,
                    pointerEvents: "none",
                  }}
                />
              )}
              {layer.type === "shape" && (
                <div
                  style={{
                    width: layer.width,
                    height: layer.height,
                    backgroundColor: layer.color,
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }
);

MediaKitCanvas.displayName = "MediaKitCanvas";
