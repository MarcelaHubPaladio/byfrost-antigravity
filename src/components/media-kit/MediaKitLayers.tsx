import React from "react";
import { Layer } from "./MediaKitCanvas";
import { 
  Layers, 
  Type, 
  Image as ImageIcon, 
  Square, 
  ChevronUp, 
  ChevronDown,
  Trash2,
  GripVertical
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type MediaKitLayersProps = {
  layers: Layer[];
  selectedLayerIds: string[] | null;
  onSelect: (id: string, isShift?: boolean) => void;
  onRemove: (id: string) => void;
  onReorder: (id: string, direction: "up" | "down") => void;
  onDragReorder: (newLayers: Layer[]) => void;
};

interface SortableItemProps {
  layer: Layer;
  index: number;
  totalLayers: number;
  isSelected: boolean;
  onSelect: (id: string, isShift?: boolean) => void;
  onRemove: (id: string) => void;
  onReorder: (id: string, direction: "up" | "down") => void;
}

function SortableLayerItem({ 
  layer, 
  isSelected, 
  onSelect, 
  onRemove, 
  onReorder,
  index,
  totalLayers
}: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: layer.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  const getIcon = (type: Layer["type"]) => {
    switch (type) {
      case "text": return <Type className="h-4 w-4 text-blue-500" />;
      case "image": return <ImageIcon className="h-4 w-4 text-emerald-500" />;
      case "shape": return <Square className="h-4 w-4 text-amber-500" />;
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onMouseDown={(e) => {
        // Only select if not clicking on buttons or drag handle
        if (e.target === e.currentTarget || (e.target as HTMLElement).closest('.layer-info')) {
          e.stopPropagation();
          onSelect(layer.id, e.shiftKey);
        }
      }}
      className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all cursor-pointer group
        ${isSelected 
          ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100" 
          : "border-transparent hover:bg-slate-50 hover:border-slate-200"}
        ${isDragging ? "opacity-50 grayscale shadow-lg border-blue-400 bg-white" : ""}`}
    >
      <div 
        {...attributes} 
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 -ml-1 text-slate-300 hover:text-slate-400"
      >
        <GripVertical className="h-4 w-4" />
      </div>

      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white shadow-sm border border-slate-100 shrink-0 pointer-events-none">
        {getIcon(layer.type)}
      </div>
      
      <div className="flex-1 min-w-0 layer-info pointer-events-none">
        <p className="text-xs font-bold text-slate-900 truncate uppercase tracking-tight layer-info">
          {layer.type === "text" ? (layer.content || "Texto") : (layer.type === "image" ? "Imagem" : "Forma")}
        </p>
        <p className="text-[10px] text-slate-400 layer-info">Layer {layer.id.slice(0, 4)}</p>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove(layer.id);
          }}
          className="h-7 w-7 rounded-md hover:bg-white hover:text-red-500"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

export function MediaKitLayers({ 
  layers, 
  selectedLayerIds, 
  onSelect, 
  onRemove, 
  onReorder,
  onDragReorder 
}: MediaKitLayersProps) {
  // We sort layers so the visually top (highest zIndex) appears first in the list
  const sortedLayers = [...layers].sort((a, b) => b.zIndex - a.zIndex);
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = sortedLayers.findIndex((l) => l.id === active.id);
      const newIndex = sortedLayers.findIndex((l) => l.id === over.id);
      
      const newSortedArray = arrayMove(sortedLayers, oldIndex, newIndex);
      
      // Calculate new z-indices based on the new array order
      // (Highest z-index for the first item in our visual list)
      const reorderedLayers = layers.map(l => {
        const visualIdx = newSortedArray.findIndex(s => s.id === l.id);
        const reversedIdx = newSortedArray.length - visualIdx; // Inverse order
        return { ...l, zIndex: reversedIdx * 10 };
      });

      onDragReorder(reorderedLayers);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-6">
        <Layers className="h-5 w-5 text-slate-400" />
        <h3 className="font-bold text-slate-900 leading-none">Camadas</h3>
      </div>

      <div className="space-y-1 overflow-y-auto pr-2 custom-scrollbar flex-1">
        <DndContext 
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext 
            items={sortedLayers.map(l => l.id)}
            strategy={verticalListSortingStrategy}
          >
            {sortedLayers.map((layer, index) => (
              <SortableLayerItem
                key={layer.id}
                layer={layer}
                index={index}
                totalLayers={sortedLayers.length}
                isSelected={selectedLayerIds?.includes(layer.id) || false}
                onSelect={onSelect}
                onRemove={onRemove}
                onReorder={onReorder}
              />
            ))}
          </SortableContext>
        </DndContext>

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
