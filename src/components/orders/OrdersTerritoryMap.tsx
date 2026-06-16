import React, { useMemo, useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polygon, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Users, MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

// Fix leaflet default icon issue dynamically if needed, but we'll use DivIcons
const createCustomIcon = (color: string, isHighlighted: boolean) => {
  return L.divIcon({
    className: "bg-transparent",
    html: `<div style="
      background-color: ${color};
      width: ${isHighlighted ? '24px' : '16px'};
      height: ${isHighlighted ? '24px' : '16px'};
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      transition: all 0.2s ease-in-out;
    "></div>`,
    iconSize: isHighlighted ? [24, 24] : [16, 16],
    iconAnchor: isHighlighted ? [12, 12] : [8, 8],
  });
};

type CaseRow = any; // Will use the same from OperacaoM30

// Mock territories for Irati
const territories = [
  {
    id: "norte",
    name: "Zona Norte",
    color: "#3b82f6", // blue
    polygon: [
      [-25.440, -50.680],
      [-25.440, -50.630],
      [-25.467, -50.630],
      [-25.467, -50.680],
    ] as [number, number][],
  },
  {
    id: "sul",
    name: "Zona Sul",
    color: "#ef4444", // red
    polygon: [
      [-25.467, -50.680],
      [-25.467, -50.630],
      [-25.500, -50.630],
      [-25.500, -50.680],
    ] as [number, number][],
  },
  {
    id: "leste",
    name: "Zona Leste",
    color: "#10b981", // green
    polygon: [
      [-25.440, -50.630],
      [-25.440, -50.590],
      [-25.500, -50.590],
      [-25.500, -50.630],
    ] as [number, number][],
  },
  {
    id: "oeste",
    name: "Zona Oeste",
    color: "#f59e0b", // amber
    polygon: [
      [-25.440, -50.720],
      [-25.440, -50.680],
      [-25.500, -50.680],
      [-25.500, -50.720],
    ] as [number, number][],
  },
];

// Helper to generate mock coordinates near Irati center
const getRandomCoord = (seed: string) => {
  // Very simple pseudo-random based on string to keep markers stable
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const r1 = (Math.abs(hash) % 100) / 100; // 0 to 1
  const r2 = (Math.abs(hash >> 2) % 100) / 100;
  
  // Irati center ~ -25.467, -50.651
  const lat = -25.467 + (r1 - 0.5) * 0.05;
  const lng = -50.651 + (r2 - 0.5) * 0.05;
  return [lat, lng] as [number, number];
};

const vendorColors = [
  "#6366f1", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316", "#eab308"
];

export function OrdersTerritoryMap({ 
  cases 
}: { 
  cases: CaseRow[] 
}) {
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");

  // Process vendors and their stats
  const { vendors, markers } = useMemo(() => {
    const vMap = new Map<string, { id: string, name: string, count: number, color: string }>();
    let colorIdx = 0;

    const mappedMarkers = cases.map(c => {
      const vId = c.assigned_user_id || "unassigned";
      const vName = c.users_profile?.display_name || c.users_profile?.email || "Sem Responsável";
      
      if (!vMap.has(vId)) {
        vMap.set(vId, {
          id: vId,
          name: vName,
          count: 0,
          color: vId === "unassigned" ? "#94a3b8" : vendorColors[colorIdx % vendorColors.length]
        });
        if (vId !== "unassigned") colorIdx++;
      }
      
      const v = vMap.get(vId)!;
      v.count++;

      // Try to get coords from meta_json, fallback to mock
      const metaLat = c.meta_json?.lat || c.meta_json?.latitude;
      const metaLng = c.meta_json?.lng || c.meta_json?.longitude;
      const coords = (metaLat && metaLng) 
        ? [parseFloat(metaLat), parseFloat(metaLng)] as [number, number]
        : getRandomCoord(c.id);

      return {
        id: c.id,
        title: c.title || "Sem título",
        status: c.status || "Pendente",
        vendorId: vId,
        coords,
        color: v.color
      };
    });

    // Sort vendors by case count
    const sortedVendors = Array.from(vMap.values()).sort((a, b) => b.count - a.count);

    return { vendors: sortedVendors, markers: mappedMarkers };
  }, [cases]);

  const filteredVendors = vendors.filter(v => v.name.toLowerCase().includes(searchQ.toLowerCase()));

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-220px)] w-full gap-4 bg-slate-50 p-2 rounded-[24px]">
      
      {/* Sidebar: Ranking & Filters */}
      <div className="w-full md:w-80 flex flex-col bg-white rounded-[20px] shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-byfrost-accent" />
            Territórios
          </h2>
          <p className="text-xs text-slate-500 mt-1">Ranking de vendedores por região</p>
        </div>

        <div className="p-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input 
              placeholder="Buscar vendedor..." 
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              className="pl-9 h-9 rounded-xl text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar">
          {filteredVendors.map((v, i) => (
            <div 
              key={v.id}
              onClick={() => setSelectedVendorId(selectedVendorId === v.id ? null : v.id)}
              className={cn(
                "flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border",
                selectedVendorId === v.id 
                  ? "bg-slate-50 border-slate-300 shadow-sm" 
                  : "bg-white border-transparent hover:bg-slate-50"
              )}
            >
              <div className="flex items-center gap-3">
                <div 
                  className="w-3 h-3 rounded-full shadow-sm" 
                  style={{ backgroundColor: v.color }} 
                />
                <div>
                  <div className="text-sm font-semibold text-slate-800 line-clamp-1">{v.name}</div>
                  <div className="text-[11px] text-slate-500">#{i + 1} no ranking</div>
                </div>
              </div>
              <Badge variant="secondary" className="font-bold bg-slate-100 text-slate-700">
                {v.count}
              </Badge>
            </div>
          ))}

          {filteredVendors.length === 0 && (
            <div className="text-center text-slate-500 text-sm mt-10">
              Nenhum vendedor encontrado.
            </div>
          )}
        </div>
      </div>

      {/* Map Area */}
      <div className="flex-1 bg-slate-200 rounded-[20px] overflow-hidden relative shadow-inner border border-slate-200 z-0">
        <MapContainer 
          center={[-25.467, -50.651]} 
          zoom={13} 
          style={{ height: '100%', width: '100%' }}
          className="z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />

          {/* Territories (Zonas) */}
          {territories.map(t => (
            <Polygon 
              key={t.id} 
              positions={t.polygon}
              pathOptions={{ 
                color: t.color, 
                fillColor: t.color, 
                fillOpacity: 0.1, 
                weight: 2,
                dashArray: "5, 5"
              }}
            >
              <Tooltip sticky className="font-semibold">{t.name}</Tooltip>
            </Polygon>
          ))}

          {/* Markers */}
          {markers.map(m => {
            // Fade out markers not belonging to selected vendor
            const isSelected = selectedVendorId === m.vendorId;
            const isFaded = selectedVendorId !== null && !isSelected;
            
            if (isFaded) return null; // Or render with lower opacity, but null is cleaner for focus

            return (
              <Marker 
                key={m.id} 
                position={m.coords}
                icon={createCustomIcon(m.color, isSelected)}
              >
                <Popup className="rounded-xl">
                  <div className="p-1">
                    <div className="font-bold text-slate-800 mb-1">{m.title}</div>
                    <div className="text-xs text-slate-600 mb-2">Status: {m.status}</div>
                    <Badge variant="outline" style={{ borderColor: m.color, color: m.color }}>
                      Ver Detalhes
                    </Badge>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
