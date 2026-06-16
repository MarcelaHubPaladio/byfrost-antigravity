import React, { useMemo, useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, Tooltip, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MapPin, Search, Settings, Save, Crosshair } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/providers/TenantProvider";

// Custom marker
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

type CaseRow = any; 

const getRandomCoord = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const r1 = (Math.abs(hash) % 100) / 100;
  const r2 = (Math.abs(hash >> 2) % 100) / 100;
  
  const lat = -25.467 + (r1 - 0.5) * 0.05;
  const lng = -50.651 + (r2 - 0.5) * 0.05;
  return [lat, lng] as [number, number];
};

const vendorColors = ["#6366f1", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316", "#eab308"];

export function OrdersTerritoryMap({ 
  cases,
  isFullscreen = false
}: { 
  cases: CaseRow[];
  isFullscreen?: boolean;
}) {
  const { activeTenantId } = useTenant();
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  
  // Storage key based on tenant
  const storageKey = `territory_config_${activeTenantId}`;

  // Vendor radius config: vendorId -> { lat, lng, radiusKm }
  const [vendorConfig, setVendorConfig] = useState<Record<string, {lat: number, lng: number, radiusKm: number}>>({});
  const [editingConfig, setEditingConfig] = useState<string | null>(null);
  
  // Temp state for editing
  const [editLat, setEditLat] = useState("");
  const [editLng, setEditLng] = useState("");
  const [editRadius, setEditRadius] = useState("");

  useEffect(() => {
    if (activeTenantId) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) setVendorConfig(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load territory config", e);
      }
    }
  }, [activeTenantId, storageKey]);

  const saveConfig = (vId: string) => {
    const newConfig = {
      ...vendorConfig,
      [vId]: {
        lat: parseFloat(editLat) || -25.467,
        lng: parseFloat(editLng) || -50.651,
        radiusKm: parseFloat(editRadius) || 3
      }
    };
    setVendorConfig(newConfig);
    localStorage.setItem(storageKey, JSON.stringify(newConfig));
    setEditingConfig(null);
  };

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

    const sortedVendors = Array.from(vMap.values()).sort((a, b) => b.count - a.count);

    return { vendors: sortedVendors, markers: mappedMarkers };
  }, [cases]);

  const filteredVendors = vendors.filter(v => v.name.toLowerCase().includes(searchQ.toLowerCase()));

  // Leaflet Component to handle map clicks for configuration
  const MapClicker = () => {
    useMapEvents({
      click(e) {
        if (editingConfig) {
          setEditLat(e.latlng.lat.toFixed(5));
          setEditLng(e.latlng.lng.toFixed(5));
        }
      },
    });
    return null;
  };

  return (
    <div className={cn("flex flex-col md:flex-row w-full gap-4", isFullscreen ? "h-full bg-slate-900 rounded-none p-0" : "h-[calc(100vh-220px)] bg-slate-50 p-2 rounded-[24px]")}>
      
      {/* Sidebar: Ranking & Filters */}
      <div className={cn(
        "flex flex-col rounded-[20px] shadow-sm border overflow-hidden",
        isFullscreen ? "w-full md:w-96 bg-slate-800 border-slate-700" : "w-full md:w-80 bg-white border-slate-200"
      )}>
        <div className={cn("p-4 border-b", isFullscreen ? "border-slate-700 bg-slate-800/50" : "border-slate-100 bg-slate-50/50")}>
          <h2 className={cn("text-lg font-bold flex items-center gap-2", isFullscreen ? "text-slate-100" : "text-slate-800")}>
            <MapPin className="w-5 h-5 text-blue-500" />
            Territórios
          </h2>
          <p className={cn("text-xs mt-1", isFullscreen ? "text-slate-400" : "text-slate-500")}>Ranking e área de atuação</p>
        </div>

        {!isFullscreen && (
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
        )}

        <div className="flex-1 overflow-y-auto p-3 space-y-3 no-scrollbar">
          {filteredVendors.map((v, i) => (
            <div key={v.id} className="flex flex-col gap-1">
              <div 
                onClick={() => setSelectedVendorId(selectedVendorId === v.id ? null : v.id)}
                className={cn(
                  "flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border",
                  selectedVendorId === v.id 
                    ? (isFullscreen ? "bg-slate-700 border-slate-600 shadow-sm" : "bg-slate-50 border-slate-300 shadow-sm")
                    : (isFullscreen ? "bg-slate-800 border-transparent hover:bg-slate-700" : "bg-white border-transparent hover:bg-slate-50")
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: v.color }} />
                  <div>
                    <div className={cn("text-sm font-semibold line-clamp-1", isFullscreen ? "text-slate-100" : "text-slate-800")}>{v.name}</div>
                    <div className={cn("text-[11px]", isFullscreen ? "text-slate-400" : "text-slate-500")}>#{i + 1} no ranking</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className={cn("font-bold", isFullscreen ? "bg-slate-900 text-slate-300" : "bg-slate-100 text-slate-700")}>
                    {v.count}
                  </Badge>
                  
                  {/* Setup Button (Only when not fullscreen & not Unassigned) */}
                  {!isFullscreen && v.id !== "unassigned" && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (editingConfig === v.id) {
                          setEditingConfig(null);
                        } else {
                          const conf = vendorConfig[v.id] || { lat: -25.467, lng: -50.651, radiusKm: 3 };
                          setEditLat(conf.lat.toString());
                          setEditLng(conf.lng.toString());
                          setEditRadius(conf.radiusKm.toString());
                          setEditingConfig(v.id);
                          setSelectedVendorId(v.id);
                        }
                      }}
                      className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Editing Panel */}
              {editingConfig === v.id && !isFullscreen && (
                <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl mt-1 space-y-3 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-blue-800">
                    <Crosshair className="w-3.5 h-3.5" />
                    Configurar Raio (Clique no mapa para alterar o centro)
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Latitude</label>
                      <Input value={editLat} onChange={e => setEditLat(e.target.value)} className="h-8 text-xs rounded-lg bg-white" />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Longitude</label>
                      <Input value={editLng} onChange={e => setEditLng(e.target.value)} className="h-8 text-xs rounded-lg bg-white" />
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Raio (em Km)</label>
                    <Input type="number" step="0.5" value={editRadius} onChange={e => setEditRadius(e.target.value)} className="h-8 text-xs rounded-lg bg-white" />
                  </div>

                  <Button size="sm" className="w-full h-8 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs" onClick={() => saveConfig(v.id)}>
                    <Save className="w-3.5 h-3.5 mr-2" />
                    Salvar Território
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Map Area */}
      <div className={cn(
        "flex-1 overflow-hidden relative shadow-inner border z-0",
        isFullscreen ? "rounded-[20px] border-slate-700 bg-slate-900" : "rounded-[20px] bg-slate-200 border-slate-200"
      )}>
        <MapContainer 
          center={[-25.467, -50.651]} 
          zoom={13} 
          style={{ height: '100%', width: '100%', background: isFullscreen ? '#0f172a' : '#e2e8f0' }}
          className="z-0"
        >
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url={isFullscreen 
              ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" // Dark map for TV
              : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" // Light map
            }
          />

          <MapClicker />

          {/* Render Vendor Territory Circles */}
          {vendors.map(v => {
            if (v.id === "unassigned") return null;
            
            const conf = vendorConfig[v.id];
            if (!conf) return null;

            const isSelected = selectedVendorId === v.id;
            const isFaded = selectedVendorId !== null && !isSelected;
            
            if (isFaded) return null;

            return (
              <Circle 
                key={`circle-${v.id}`}
                center={[conf.lat, conf.lng]}
                radius={conf.radiusKm * 1000} // Leaflet uses meters
                pathOptions={{
                  color: v.color,
                  fillColor: v.color,
                  fillOpacity: isSelected ? 0.2 : 0.1,
                  weight: isSelected ? 3 : 1,
                  dashArray: isSelected ? undefined : "5, 5"
                }}
              >
                <Tooltip sticky className="font-semibold">{v.name}</Tooltip>
              </Circle>
            )
          })}

          {/* Render Active Editing Circle */}
          {editingConfig && editLat && editLng && editRadius && (
             <Circle 
                center={[parseFloat(editLat) || 0, parseFloat(editLng) || 0]}
                radius={(parseFloat(editRadius) || 0) * 1000}
                pathOptions={{ color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.3, weight: 2 }}
              />
          )}

          {/* Markers */}
          {markers.map(m => {
            const isSelected = selectedVendorId === m.vendorId;
            const isFaded = selectedVendorId !== null && !isSelected;
            
            if (isFaded) return null; 

            return (
              <Marker 
                key={m.id} 
                position={m.coords}
                icon={createCustomIcon(m.color, isSelected)}
              >
                <Popup className="rounded-xl shadow-xl">
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

        {editingConfig && !isFullscreen && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[400] bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg text-xs font-bold animate-pulse pointer-events-none">
            Modo Edição Ativo: Clique no mapa para mover o centro
          </div>
        )}
      </div>
    </div>
  );
}
