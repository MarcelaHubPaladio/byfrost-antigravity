import React from "react";
import { Layer } from "./MediaKitCanvas";
import { 
  Layers, 
  Type, 
  Image as ImageIcon, 
  Square, 
  ChevronUp, 
  ChevronDown,
  Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";

type MediaKitLayersProps = {
  layers: Layer[];
  selectedLayerId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onReorder: (id: string, direction: "up" | "down") => void;
};

export function MediaKitLayers({ layers, selectedLayerId, onSelect, onRemove, onReorder }: MediaKitLayersProps) {
  const sortedLayers = [...layers].sort((a, b) => b.zIndex - a.zIndex);

  const getIcon = (type: Layer["type"]) => {
    switch (type) {
      case "text": return <Type className="h-4 w-4 text-blue-500" />;
      case "image": return <ImageIcon className="h-4 w-4 text-emerald-500" />;
      case "shape": return <Square className="h-4 w-4 text-amber-500" />;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-6">
        <Layers className="h-5 w-5 text-slate-400" />
        <h3 className="font-bold text-slate-900 leading-none">Camadas</h3>
      </div>

      <div className="space-y-1 overflow-y-auto pr-2 custom-scrollbar flex-1">
        {sortedLayers.map((layer, index) => (
          <div
            key={layer.id}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget || (e.target as HTMLElement).closest('.layer-info')) {
                e.stopPropagation();
                onSelect(layer.id);
              }
            }}
            className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all cursor-pointer group
              ${selectedLayerId === layer.id 
                ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100" 
                : "border-transparent hover:bg-slate-50 hover:border-slate-200"}`}
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white shadow-sm border border-slate-100 shrink-0">
              {getIcon(layer.type)}
            </div>
            
            <div className="flex-1 min-w-0 layer-info">
              <p className="text-xs font-bold text-slate-900 truncate uppercase tracking-tight layer-info">
                {layer.type === "text" ? (layer.content || "Texto") : layer.type}
              </p>
              <p className="text-[10px] text-slate-400 layer-info">Layer {layer.id.slice(0, 4)}</p>
            </div>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="icon"
                disabled={index === 0}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onReorder(layer.id, "up");
                }}
                className="h-6 w-6 rounded-md hover:bg-white hover:text-blue-600"
              >
                <ChevronUp className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={index === sortedLayers.length - 1}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onReorder(layer.id, "down");
                }}
                className="h-6 w-6 rounded-md hover:bg-white hover:text-blue-600"
              >
                <ChevronDown className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRemove(layer.id);
                }}
                className="h-6 w-6 rounded-md hover:bg-white hover:text-red-500"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
        {layers.length === 0 && (
          <div className="py-12 text-center">
            <Layers className="h-10 w-10 text-slate-200 mx-auto mb-3 opacity-20" />
            <p className="text-[11px] text-slate-400 font-medium">Nenhuma camada nesta página.</p>
          </div>
        )}
      </div>
    </div>
  );
}
