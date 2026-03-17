import React, { useRef, useImperativeHandle, forwardRef } from "react";
import { cn, hexToRgba } from "@/lib/utils";
import * as LucideIcons from "lucide-react";
import * as FaIcons from "react-icons/fa6";
import * as MdIcons from "react-icons/md";
import * as IoIcons from "react-icons/io5";

export type Layer = {
  id: string;
  type: "text" | "image" | "shape" | "icon";
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
  isVariable?: boolean;
  variableField?: string;
  variableRoomType?: string;
  borderRadius?: number;
  name?: string;
  locked?: boolean;
  borderWidth?: number;
  borderColor?: string;
  fontFamily?: string;
  fontStyle?: "normal" | "italic";
  textAlign?: "left" | "center" | "right";
  objectFit?: "cover" | "contain" | "fill";
  isList?: boolean;
  listSeparator?: string;
  listShowIcons?: boolean;
  listLayout?: "horizontal" | "vertical";
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowBlur?: number;
  shadowOpacity?: number;
  shadowColor?: string;
  imageOffsetX?: number;
  imageOffsetY?: number;
};

type MediaKitCanvasProps = {
  layers: Layer[];
  width: number;
  height: number;
  selectedLayerIds: string[] | null;
  onSelectLayer: (id: string, isShift?: boolean) => void;
  onSelectLayers: (ids: string[]) => void;
  onUpdateLayer: (id: string, delta: Partial<Layer>, pushHistory?: boolean) => void;
  onUpdateLayers: (ids: string[], delta: Partial<Layer> | ((layer: Layer) => Partial<Layer>), pushHistory?: boolean) => void;
  scale: number;
  entityData?: any;
  entityPhotos?: any[];
  roomCounts?: Record<string, number>;
};

export const MediaKitCanvas = forwardRef<{ exportImage: () => Promise<string> }, MediaKitCanvasProps>(
  ({ layers, width, height, selectedLayerIds, onSelectLayer, onSelectLayers, onUpdateLayer, onUpdateLayers, scale, entityData, entityPhotos, roomCounts }, ref) => {
    const canvasRef = useRef<HTMLDivElement>(null);
    const [selectionBox, setSelectionBox] = React.useState<{ x: number; y: number; width: number; height: number } | null>(null);
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [positioningId, setPositioningId] = React.useState<string | null>(null);

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

    const getEffectiveValue = (layer: Layer) => {
      if (layer.isList && roomCounts) {
        // If it's a list of rooms
        const roomEntries = Object.entries(roomCounts).filter(([_, count]) => count > 0);
        if (roomEntries.length === 0) return "";

        const items = roomEntries.map(([room, count]) => `${room}: ${count}`);
        const separator = layer.listSeparator === "\\n" ? "\n" : (layer.listSeparator || " | ");
        return items.join(separator);
      }

      if (!layer.isVariable || !layer.variableField || !entityData) return layer.content;
      
      const field = layer.variableField;
      
      // Special check for room counts
      if (field.startsWith("room_") && roomCounts) {
        const roomName = field.replace("room_", "");
        const count = roomCounts[roomName];
        return count !== undefined ? String(count) : "0";
      }

      // Check core fields first
      if (entityData[field] !== undefined && entityData[field] !== null) {
        return String(entityData[field]);
      }
      
      // Then metadata
      if (entityData.metadata?.[field] !== undefined && entityData.metadata?.[field] !== null) {
        return String(entityData.metadata[field]);
      }
      
      return layer.content;
    };

    const getEffectiveImage = (layer: Layer) => {
      if (!layer.isVariable || !entityData) return layer.content;

      // New: variableRoomType takes precedence for images
      if (layer.variableRoomType && entityPhotos) {
        const photo = entityPhotos.find(p => p.room_type === layer.variableRoomType);
        if (photo) return photo.url;
      }

      if (!layer.variableField) return layer.content;

      // Fallback to legacy variableField logic
      if (entityData[layer.variableField]) return entityData[layer.variableField];
      if (entityData.metadata?.[layer.variableField]) return entityData.metadata[layer.variableField];

      return layer.content;
    };

    const replacePlaceholders = (text: string) => {
      if (!entityData) return text;
      return text.replace(/\{\{(.*?)\}\}/g, (_, key) => {
        const trimmedKey = key.trim();
        
        // Handle room_ prefix in placeholders
        if (trimmedKey.startsWith("room_") && roomCounts) {
          const roomName = trimmedKey.replace("room_", "");
          const count = roomCounts[roomName];
          return count !== undefined ? String(count) : "0";
        }

        const val = entityData[trimmedKey] ?? entityData.metadata?.[trimmedKey];
        return val !== undefined && val !== null ? String(val) : `{{${key}}}`;
      });
    };

    const handleResizeMouseDown = (e: React.MouseEvent, layer: Layer) => {
      e.stopPropagation();
      if (layer.locked) return;
      onSelectLayer(layer.id);

      const startX = e.clientX;
      const startY = e.clientY;
      
      // Get all selected layers for multi-resize
      const selectedLayers = layers.filter(l => selectedLayerIds?.includes(l.id));
      const startStates = selectedLayers.map(l => ({
        id: l.id,
        width: l.width || 0,
        height: l.height || 0,
        fontSize: l.fontSize || 16,
        x: l.x,
        y: l.y
      }));

      const primaryStartWidth = layer.width || 0;
      const primaryStartHeight = layer.height || 0;
      const aspectRatio = primaryStartWidth / primaryStartHeight;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const dw = (moveEvent.clientX - startX) / scale;
        const dh = (moveEvent.clientY - startY) / scale;

        // Calculate scale factors based on primary layer
        const scaleX = (primaryStartWidth + dw) / primaryStartWidth;
        const scaleY = (primaryStartHeight + dh) / primaryStartHeight;
        
        let usedScale = scaleX;
        if (moveEvent.shiftKey || layer.type === "icon" || layer.type === "text") {
           usedScale = scaleX;
        }

        startStates.forEach(state => {
          const l = layers.find(lay => lay.id === state.id);
          if (!l) return;

          if (l.type === "text") {
            const newFontSize = Math.max(8, state.fontSize * scaleX);
            onUpdateLayer(l.id, { fontSize: Math.round(newFontSize) });
          } else {
            let newWidth = Math.max(10, state.width * scaleX);
            let newHeight = Math.max(10, state.height * (moveEvent.shiftKey ? scaleX : scaleY));
            
            if (moveEvent.shiftKey || l.type === "icon") {
              newHeight = state.height * scaleX;
            }

            onUpdateLayer(l.id, {
              width: Math.round(newWidth),
              height: Math.round(newHeight),
            });
          }
        });
      };

      const onMouseUp = (upEvent: MouseEvent) => {
        const dw = (upEvent.clientX - startX) / scale;
        const dh = (upEvent.clientY - startY) / scale;
        const scaleX = (primaryStartWidth + dw) / primaryStartWidth;
        const scaleY = (primaryStartHeight + dh) / primaryStartHeight;

        startStates.forEach(state => {
          const l = layers.find(lay => lay.id === state.id);
          if (!l) return;

          if (l.type === "text") {
            const newFontSize = Math.max(8, state.fontSize * scaleX);
            onUpdateLayer(l.id, { fontSize: Math.round(newFontSize) }, true);
          } else {
            let newWidth = Math.max(10, state.width * scaleX);
            let newHeight = Math.max(10, state.height * (upEvent.shiftKey ? scaleX : scaleY));

            if (upEvent.shiftKey || l.type === "icon") {
              newHeight = state.height * scaleX;
            }

            onUpdateLayer(l.id, {
              width: Math.round(newWidth),
              height: Math.round(newHeight),
            }, true);
          }
        });

        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp as any);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };

    const handleMouseDown = (e: React.MouseEvent, layer: Layer) => {
      e.stopPropagation();
      if (layer.locked) return;
      if (editingId === layer.id || positioningId === layer.id) return;
      
      const isPartofSelection = selectedLayerIds?.includes(layer.id);
      if (!isPartofSelection) {
        onSelectLayer(layer.id, e.shiftKey);
      }

      const startX = e.clientX;
      const startY = e.clientY;
      
      // Store initial positions of all affected layers
      const targets = (isPartofSelection ? selectedLayerIds : [layer.id]) || [layer.id];
      const affectedLayers = layers.filter(l => targets.includes(l.id) && !l.locked);
      const startPositions = affectedLayers.map(l => ({ id: l.id, x: l.x, y: l.y }));

      const onMouseMove = (moveEvent: MouseEvent) => {
        const dx = (moveEvent.clientX - startX) / scale;
        const dy = (moveEvent.clientY - startY) / scale;
        
        onUpdateLayers(
          affectedLayers.map(l => l.id),
          (l) => {
            const start = startPositions.find(s => s.id === l.id);
            if (!start) return {};
            return {
              x: Math.round(start.x + dx),
              y: Math.round(start.y + dy),
            };
          }
        );
      };

      const onMouseUp = (upEvent: MouseEvent) => {
        const dx = (upEvent.clientX - startX) / scale;
        const dy = (upEvent.clientY - startY) / scale;

        onUpdateLayers(
          affectedLayers.map(l => l.id),
          (l) => {
            const start = startPositions.find(s => s.id === l.id);
            if (!start) return {};
            return {
              x: Math.round(start.x + dx),
              y: Math.round(start.y + dy),
            };
          },
          true
        );

        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp as any);
    };
    
    const handleImagePositionMouseDown = (e: React.MouseEvent, layer: Layer) => {
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const startOffsetX = layer.imageOffsetX ?? 50;
      const startOffsetY = layer.imageOffsetY ?? 50;
      
      const onMouseMove = (moveEvent: MouseEvent) => {
        const dx = (moveEvent.clientX - startX) / scale;
        const dy = (moveEvent.clientY - startY) / scale;
        
        // Sensitivity factor could be adjusted. Standardizing sensitivity based on container size is better.
        // If we want it to feel like "dragging the image", movement should be inverted and scaled.
        // For simplicity, let's use a percentage-based move.
        // 1px move in container = (1 / width) * 100 % in object-position
        const moveX = (dx / (layer.width || 1)) * 100;
        const moveY = (dy / (layer.height || 1)) * 100;
        
        onUpdateLayer(layer.id, {
          imageOffsetX: Math.max(0, Math.min(100, startOffsetX - moveX)),
          imageOffsetY: Math.max(0, Math.min(100, startOffsetY - moveY)),
        });
      };
      
      const onMouseUp = (upEvent: MouseEvent) => {
        const dx = (upEvent.clientX - startX) / scale;
        const dy = (upEvent.clientY - startY) / scale;
        const moveX = (dx / (layer.width || 1)) * 100;
        const moveY = (dy / (layer.height || 1)) * 100;
        
        onUpdateLayer(layer.id, {
          imageOffsetX: Math.max(0, Math.min(100, startOffsetX - moveX)),
          imageOffsetY: Math.max(0, Math.min(100, startOffsetY - moveY)),
        }, true);
        
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };
      
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };

    React.useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setEditingId(null);
          setPositioningId(null);
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    const handleCanvasMouseDown = (e: React.MouseEvent) => {
      if (e.target !== e.currentTarget) return;
      
      // Exit modes when clicking canvas background
      setEditingId(null);
      setPositioningId(null);

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const startX = (e.clientX - rect.left) / scale;
      const startY = (e.clientY - rect.top) / scale;

      onSelectLayer("", e.shiftKey);

      let currentBox: { x: number; y: number; width: number; height: number } | null = null;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const currentX = (moveEvent.clientX - rect.left) / scale;
        const currentY = (moveEvent.clientY - rect.top) / scale;
        
        currentBox = {
          x: Math.min(startX, currentX),
          y: Math.min(startY, currentY),
          width: Math.abs(startX - currentX),
          height: Math.abs(startY - currentY),
        };
        setSelectionBox(currentBox);
      };

      const onMouseUp = () => {
        if (currentBox) {
          const selectedIds = layers
            .filter(l => {
              if (l.locked) return false;
              const lx = l.x;
              const ly = l.y;
              const lw = l.width || 0;
              const lh = l.height || 0;
              
              return (
                lx < currentBox!.x + currentBox!.width &&
                lx + lw > currentBox!.x &&
                ly < currentBox!.y + currentBox!.height &&
                ly + lh > currentBox!.y
              );
            })
            .map(l => l.id);
          
          onSelectLayers(selectedIds);
        }
        
        setSelectionBox(null);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };

    return (
      <div 
        className="relative group/canvas bg-white shadow-2xl overflow-visible"
        style={{
          width: width * scale,
          height: height * scale,
        }}
        onMouseDown={handleCanvasMouseDown}
      >
        <div
          ref={canvasRef}
          className="relative origin-top-left"
          style={{
            width,
            height,
            transform: `scale(${scale})`,
          }}
        >
        {layers
          .sort((a, b) => a.zIndex - b.zIndex)
          .map((layer) => (
            <div
              key={layer.id}
              onMouseDown={(e) => handleMouseDown(e, layer)}
              onDoubleClick={(e) => {
                if (layer.type === "text" && !layer.locked && !layer.isVariable && !layer.isList) {
                  e.stopPropagation();
                  setEditingId(layer.id);
                } else if (layer.type === "image" && !layer.locked) {
                  e.stopPropagation();
                  setPositioningId(layer.id);
                }
              }}
              className={cn(
                "absolute cursor-move select-none group pointer-events-auto bg-transparent",
                selectedLayerIds?.includes(layer.id) && "ring-2 ring-blue-500 ring-offset-2 shadow-lg"
              )}
              style={{
                left: layer.x,
                top: layer.y,
                width: (layer.type === "image" || layer.type === "shape") ? layer.width : undefined,
                height: (layer.type === "image" || layer.type === "shape") ? layer.height : undefined,
                zIndex: layer.zIndex,
                opacity: layer.opacity ?? 1,
                borderRadius: layer.borderRadius || 0,
                border: layer.borderWidth ? `${layer.borderWidth}px solid ${layer.borderColor || "#000"}` : undefined,
                pointerEvents: layer.locked ? "none" : "auto",
                overflow: "hidden",
                boxShadow: layer.type !== "text" && layer.shadowBlur !== undefined ? `${layer.shadowOffsetX || 0}px ${layer.shadowOffsetY || 0}px ${layer.shadowBlur}px ${hexToRgba(layer.shadowColor || "#000", layer.shadowOpacity ?? 0.5)}` : undefined,
              }}
            >
              {layer.type === "text" && (
                <div
                  style={{
                    fontSize: layer.fontSize,
                    color: layer.color,
                    fontWeight: layer.fontWeight || "normal",
                    fontFamily: layer.fontFamily || "inherit",
                    fontStyle: layer.fontStyle || "normal",
                    textAlign: layer.textAlign || "left",
                    whiteSpace: "pre-wrap",
                    width: "100%",
                    height: "100%",
                    textShadow: layer.shadowBlur !== undefined ? `${layer.shadowOffsetX || 0}px ${layer.shadowOffsetY || 0}px ${layer.shadowBlur}px ${hexToRgba(layer.shadowColor || "#000", layer.shadowOpacity ?? 0.5)}` : undefined,
                  }}
                >
                  {editingId === layer.id ? (
                    <textarea
                      autoFocus
                      defaultValue={layer.content}
                      onBlur={(e) => {
                        onUpdateLayer(layer.id, { content: e.target.value }, true);
                        setEditingId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          onUpdateLayer(layer.id, { content: (e.target as HTMLTextAreaElement).value }, true);
                          setEditingId(null);
                        }
                        if (e.key === "Escape") {
                          setEditingId(null);
                        }
                      }}
                      className="bg-transparent border-none outline-none resize-none p-0 m-0 w-full h-full block leading-tight overflow-hidden"
                      style={{
                        fontSize: "inherit",
                        color: "inherit",
                        fontWeight: "inherit",
                        fontFamily: "inherit",
                        fontStyle: "inherit",
                        textAlign: "inherit",
                      }}
                    />
                  ) : (
                    layer.isVariable || layer.isList ? getEffectiveValue(layer) : replacePlaceholders(layer.content)
                  )}
                </div>
              )}
              {layer.type === "image" && (
                <img
                  src={layer.isVariable ? getEffectiveImage(layer) : replacePlaceholders(layer.content)}
                  alt=""
                  onMouseDown={(e) => {
                    if (positioningId === layer.id) {
                      handleImagePositionMouseDown(e, layer);
                    }
                  }}
                  style={{
                    width: layer.width,
                    height: layer.height,
                    pointerEvents: positioningId === layer.id ? "auto" : "none",
                    objectFit: (layer.objectFit as any) || "cover",
                    objectPosition: `${layer.imageOffsetX ?? 50}% ${layer.imageOffsetY ?? 50}%`,
                    cursor: positioningId === layer.id ? "move" : undefined,
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
              {layer.type === "icon" && (
                <div
                  style={{
                    width: layer.width,
                    height: layer.height,
                    color: layer.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {(() => {
                    let IconComponent = (LucideIcons as any)[layer.content];
                    
                    if (layer.content.startsWith("Fa")) IconComponent = (FaIcons as any)[layer.content];
                    else if (layer.content.startsWith("Md")) IconComponent = (MdIcons as any)[layer.content];
                    else if (layer.content.startsWith("Io")) IconComponent = (IoIcons as any)[layer.content];

                    return IconComponent ? <IconComponent size={layer.width} /> : null;
                  })()}
                </div>
              )}
              {selectedLayerIds?.includes(layer.id) && (
                <>
                  {/* Custom Bounding Box for better visual */}
                  <div className="absolute inset-0 border border-blue-200 pointer-events-none -m-[1px]" />
                  
                  {/* Resize Handle */}
                  <div
                    className="absolute bottom-0 right-0 w-5 h-5 bg-blue-600 border-2 border-white rounded-lg cursor-nwse-resize translate-x-1/2 translate-y-1/2 z-50 shadow-md hover:scale-125 transition-transform flex items-center justify-center p-0.5"
                    onMouseDown={(e) => handleResizeMouseDown(e, layer)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="w-1.5 h-1.5 border-r-2 border-b-2 border-white rotate-45 mb-0.5 mr-0.5" />
                  </div>
                </>
              )}
            </div>
          ))}
          
          {selectionBox && (
            <div 
              className="absolute border border-blue-500 bg-blue-500/10 pointer-events-none z-[1000]"
              style={{
                left: selectionBox.x,
                top: selectionBox.y,
                width: selectionBox.width,
                height: selectionBox.height,
              }}
            />
          )}
        </div>
      </div>
    );
  }
);

MediaKitCanvas.displayName = "MediaKitCanvas";
