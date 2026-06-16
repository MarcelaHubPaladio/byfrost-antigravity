import React, { useMemo, useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, Polygon, GeoJSON, Tooltip, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MapPin, Search, Settings, Save, Crosshair, Map as MapIcon, Hexagon, Building2, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/providers/TenantProvider";

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

const vendorColors = ["#6366f1", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316", "#eab308", "#10b981", "#ef4444", "#3b82f6"];

type VendorTerritory = {
  type: "circle" | "polygon" | "city";
  lat?: number;
  lng?: number;
  radiusKm?: number;
  polygonCoords?: [number, number][];
  cityName?: string;
  geojson?: any;
};

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
  
  const storageKey = `territory_config_${activeTenantId}`;

  const [vendorConfig, setVendorConfig] = useState<Record<string, VendorTerritory>>({});
  
  // Edit State
  const [editingConfig, setEditingConfig] = useState<string | null>(null);
  const [editTab, setEditTab] = useState<"circle" | "polygon" | "city">("circle");

  // Circle Edit
  const [editLat, setEditLat] = useState("");
  const [editLng, setEditLng] = useState("");
  const [editRadius, setEditRadius] = useState("");

  // Polygon Edit
  const [editPolygon, setEditPolygon] = useState<[number, number][]>([]);

  // City Edit
  const [editCityQuery, setEditCityQuery] = useState("");
  const [editCityGeoJson, setEditCityGeoJson] = useState<any>(null);
  const [isCityLoading, setIsCityLoading] = useState(false);

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
    let newConf: VendorTerritory = { type: editTab };

    if (editTab === "circle") {
      newConf.lat = parseFloat(editLat) || -25.467;
      newConf.lng = parseFloat(editLng) || -50.651;
      newConf.radiusKm = parseFloat(editRadius) || 3;
    } else if (editTab === "polygon") {
      newConf.polygonCoords = [...editPolygon];
    } else if (editTab === "city") {
      newConf.cityName = editCityQuery;
      newConf.geojson = editCityGeoJson;
    }

    const newConfig = { ...vendorConfig, [vId]: newConf };
    setVendorConfig(newConfig);
    localStorage.setItem(storageKey, JSON.stringify(newConfig));
    setEditingConfig(null);
  };

  const handleCitySearch = async () => {
    if (!editCityQuery) return;
    setIsCityLoading(true);
    setEditCityGeoJson(null);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(editCityQuery)}&format=geojson&polygon_geojson=1&limit=1`);
      const data = await res.json();
      if (data && data.features && data.features.length > 0) {
        setEditCityGeoJson(data.features[0]);
      } else {
        alert("Cidade ou limites não encontrados no mapa aberto.");
      }
    } catch (e) {
      console.error(e);
      alert("Erro ao buscar a cidade.");
    }
    setIsCityLoading(false);
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

  const MapClicker = () => {
    useMapEvents({
      click(e) {
        if (!editingConfig) return;

        if (editTab === "circle") {
          setEditLat(e.latlng.lat.toFixed(5));
          setEditLng(e.latlng.lng.toFixed(5));
        } else if (editTab === "polygon") {
          setEditPolygon(prev => [...prev, [e.latlng.lat, e.latlng.lng]]);
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
        isFullscreen ? "w-full md:w-96 bg-slate-800 border-slate-700" : "w-full md:w-[350px] bg-white border-slate-200"
      )}>
        <div className={cn("p-4 border-b", isFullscreen ? "border-slate-700 bg-slate-800/50" : "border-slate-100 bg-slate-50/50")}>
          <h2 className={cn("text-lg font-bold flex items-center gap-2", isFullscreen ? "text-slate-100" : "text-slate-800")}>
            <MapIcon className="w-5 h-5 text-blue-500" />
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
          {filteredVendors.map((v, i) => {
             const isSelected = selectedVendorId === v.id;
             const isEditing = editingConfig === v.id;

             return (
              <div key={v.id} className="flex flex-col gap-1">
                <div 
                  onClick={() => setSelectedVendorId(isSelected ? null : v.id)}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border",
                    isSelected 
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
                    
                    {!isFullscreen && v.id !== "unassigned" && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isEditing) {
                            setEditingConfig(null);
                          } else {
                            const conf = vendorConfig[v.id];
                            setEditTab(conf?.type || "circle");
                            setEditLat((conf?.lat || -25.467).toString());
                            setEditLng((conf?.lng || -50.651).toString());
                            setEditRadius((conf?.radiusKm || 3).toString());
                            setEditPolygon(conf?.polygonCoords || []);
                            setEditCityQuery(conf?.cityName || "");
                            setEditCityGeoJson(conf?.geojson || null);
                            
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

                {/* Edit Panel */}
                {isEditing && !isFullscreen && (
                  <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl mt-1 space-y-4 animate-in fade-in slide-in-from-top-2">
                    
                    {/* Tabs */}
                    <div className="flex bg-slate-200/50 p-1 rounded-lg">
                      <button 
                        onClick={() => setEditTab("circle")}
                        className={cn("flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all", editTab === "circle" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500")}
                      >
                        <Crosshair className="w-3 h-3" /> Raio
                      </button>
                      <button 
                        onClick={() => setEditTab("polygon")}
                        className={cn("flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all", editTab === "polygon" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500")}
                      >
                        <Hexagon className="w-3 h-3" /> Polígono
                      </button>
                      <button 
                        onClick={() => setEditTab("city")}
                        className={cn("flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all", editTab === "city" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500")}
                      >
                        <Building2 className="w-3 h-3" /> IBGE
                      </button>
                    </div>

                    {/* Form: Circle */}
                    {editTab === "circle" && (
                      <div className="space-y-3">
                        <p className="text-[10px] text-slate-500 leading-tight">
                          Clique no mapa para alterar o <b>Ponto Central</b> da atuação.
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Lat</label>
                            <Input value={editLat} onChange={e => setEditLat(e.target.value)} className="h-8 text-xs rounded-lg bg-white border-slate-200" />
                          </div>
                          <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Lng</label>
                            <Input value={editLng} onChange={e => setEditLng(e.target.value)} className="h-8 text-xs rounded-lg bg-white border-slate-200" />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Raio (em Km)</label>
                          <Input type="number" step="0.5" value={editRadius} onChange={e => setEditRadius(e.target.value)} className="h-8 text-xs rounded-lg bg-white border-slate-200" />
                        </div>
                      </div>
                    )}

                    {/* Form: Polygon */}
                    {editTab === "polygon" && (
                      <div className="space-y-3">
                        <p className="text-[10px] text-slate-500 leading-tight">
                          Clique no mapa em sequência para desenhar os vértices (bordas) da região do vendedor.
                        </p>
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span>{editPolygon.length} vértices demarcados</span>
                          {editPolygon.length > 0 && (
                            <button onClick={() => setEditPolygon([])} className="text-rose-500 hover:text-rose-600 flex items-center gap-1 font-bold text-[10px] uppercase">
                              <Trash2 className="w-3 h-3" /> Limpar
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Form: City */}
                    {editTab === "city" && (
                      <div className="space-y-3">
                        <p className="text-[10px] text-slate-500 leading-tight">
                          Digite a cidade para buscar as divisas geográficas oficias do IBGE pelo OSM.
                        </p>
                        <div>
                          <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Nome da Cidade / Estado</label>
                          <div className="flex gap-2">
                            <Input 
                              value={editCityQuery} 
                              onChange={e => setEditCityQuery(e.target.value)} 
                              placeholder="Ex: Curitiba, PR"
                              className="h-8 text-xs rounded-lg bg-white border-slate-200" 
                            />
                            <Button 
                              size="sm" 
                              onClick={handleCitySearch}
                              disabled={isCityLoading}
                              className="h-8 bg-slate-800 hover:bg-slate-900"
                            >
                              {isCityLoading ? "..." : "Buscar"}
                            </Button>
                          </div>
                        </div>
                        {editCityGeoJson && (
                          <Badge className="bg-emerald-100 text-emerald-700 border-none font-bold">
                            ✔ Geometria do IBGE carregada!
                          </Badge>
                        )}
                      </div>
                    )}

                    <Button size="sm" className="w-full h-8 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs shadow-sm font-bold" onClick={() => saveConfig(v.id)}>
                      <Save className="w-3.5 h-3.5 mr-2" />
                      Salvar Território
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
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
              ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            }
          />

          <MapClicker />

          {/* Render Active Editing Previews */}
          {editingConfig && editTab === "circle" && editLat && editLng && editRadius && (
             <Circle 
                center={[parseFloat(editLat) || 0, parseFloat(editLng) || 0]}
                radius={(parseFloat(editRadius) || 0) * 1000}
                pathOptions={{ color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.3, weight: 2 }}
              />
          )}

          {editingConfig && editTab === "polygon" && editPolygon.length > 0 && (
            <Polygon 
              positions={editPolygon} 
              pathOptions={{ color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.3, weight: 2 }} 
            />
          )}

          {editingConfig && editTab === "city" && editCityGeoJson && (
            <GeoJSON 
              key={`preview-city`}
              data={editCityGeoJson}
              style={{ color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.3, weight: 2 }}
            />
          )}


          {/* Render Saved Territories */}
          {vendors.map(v => {
            if (v.id === "unassigned") return null;
            
            const conf = vendorConfig[v.id];
            if (!conf) return null;

            const isSelected = selectedVendorId === v.id;
            const isFaded = selectedVendorId !== null && !isSelected;
            if (isFaded) return null;

            const baseStyle = {
              color: v.color,
              fillColor: v.color,
              fillOpacity: isSelected ? 0.25 : 0.1,
              weight: isSelected ? 3 : 1,
              dashArray: isSelected ? undefined : "5, 5"
            };

            if (conf.type === "circle" && conf.lat && conf.lng && conf.radiusKm) {
              return (
                <Circle 
                  key={`circle-${v.id}`}
                  center={[conf.lat, conf.lng]}
                  radius={conf.radiusKm * 1000}
                  pathOptions={baseStyle}
                >
                  <Tooltip sticky className="font-bold bg-slate-900 text-white border-none">{v.name}</Tooltip>
                </Circle>
              );
            }

            if (conf.type === "polygon" && conf.polygonCoords && conf.polygonCoords.length >= 3) {
              return (
                <Polygon
                  key={`poly-${v.id}`}
                  positions={conf.polygonCoords}
                  pathOptions={baseStyle}
                >
                  <Tooltip sticky className="font-bold bg-slate-900 text-white border-none">{v.name}</Tooltip>
                </Polygon>
              );
            }

            if (conf.type === "city" && conf.geojson) {
              return (
                <GeoJSON
                  key={`city-${v.id}`}
                  data={conf.geojson}
                  style={baseStyle}
                >
                  <Tooltip sticky className="font-bold bg-slate-900 text-white border-none">{v.name} ({conf.cityName})</Tooltip>
                </GeoJSON>
              );
            }

            return null;
          })}

          {/* Markers */}
          {markers.map(m => {
            const isFaded = selectedVendorId !== null && selectedVendorId !== m.vendorId;
            if (isFaded) return null; 

            return (
              <Marker 
                key={m.id} 
                position={m.coords}
                icon={createCustomIcon(m.color, selectedVendorId === m.vendorId)}
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

        {/* Editing Hints overlay */}
        {editingConfig && !isFullscreen && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[400] bg-blue-600 text-white px-5 py-2.5 rounded-full shadow-lg text-xs font-bold animate-pulse pointer-events-none flex items-center gap-2">
            {editTab === "circle" && <><Crosshair className="w-4 h-4"/> Modo de Edição de Raio: Clique no mapa para mover o centro</>}
            {editTab === "polygon" && <><Hexagon className="w-4 h-4"/> Modo de Polígono: Clique em sequência para formar os vértices</>}
            {editTab === "city" && <><Building2 className="w-4 h-4"/> Modo de Cidade: Pesquise a cidade no painel e salve</>}
          </div>
        )}
      </div>
    </div>
  );
}
