import React, { useMemo, useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, Polygon, GeoJSON, Tooltip, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MapPin, Search, Settings, Save, Crosshair, Map as MapIcon, Hexagon, Building2, Trash2, DollarSign, TrendingUp, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/providers/TenantProvider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

// Format currency helper
function formatCurrency(value: number | string): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(num);
}

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

const vendorColors = ["#6366f1", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316", "#eab308", "#10b981", "#ef4444", "#3b82f6"];

type VendorTerritory = {
  type: "circle" | "polygon" | "city";
  lat?: number;
  lng?: number;
  radiusKm?: number;
  polygonCoords?: [number, number][];
  cityName?: string; // Legacy
  cityNames?: string[]; // Multi-select support
  geojson?: any;
};

export function OrdersTerritoryMap({ 
  cases,
  isFullscreen = false,
  caseFields,
  caseTotals
}: { 
  cases: CaseRow[];
  isFullscreen?: boolean;
  caseFields?: Map<string, any>;
  caseTotals?: Map<string, number>;
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

  // City Edit (Multi-select)
  const [editCityList, setEditCityList] = useState<string[]>([]);
  const [editCityGeoJson, setEditCityGeoJson] = useState<any>(null);
  const [isCityLoading, setIsCityLoading] = useState(false);
  const [prCities, setPrCities] = useState<string[]>([]);
  const [citySearchText, setCitySearchText] = useState("");

  useEffect(() => {
    fetch("https://servicodados.ibge.gov.br/api/v1/localidades/estados/PR/municipios")
      .then(res => res.json())
      .then(data => {
        const sorted = data.map((d: any) => d.nome).sort();
        setPrCities(sorted);
      })
      .catch(err => console.error("Falha ao buscar cidades do PR", err));
  }, []);

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
      newConf.cityNames = editCityList;
      newConf.geojson = editCityGeoJson;
    }

    const newConfig = { ...vendorConfig, [vId]: newConf };
    setVendorConfig(newConfig);
    localStorage.setItem(storageKey, JSON.stringify(newConfig));
    setEditingConfig(null);
  };

  const handleCitySearch = async () => {
    if (editCityList.length === 0) {
      setEditCityGeoJson(null);
      return;
    }
    
    setIsCityLoading(true);
    setEditCityGeoJson(null);
    try {
      const features = [];
      for (const city of editCityList) {
        const fullQuery = `${city}, PR`;
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(fullQuery)}&format=geojson&polygon_geojson=1&limit=1`);
        const data = await res.json();
        if (data && data.features && data.features.length > 0) {
          features.push(data.features[0]);
        }
      }
      
      if (features.length > 0) {
        setEditCityGeoJson({ type: "FeatureCollection", features });
      } else {
        alert("Nenhuma geometria encontrada para as cidades.");
      }
    } catch (e) {
      console.error(e);
      alert("Erro ao buscar cidades.");
    }
    setIsCityLoading(false);
  };

  const { vendors, markers } = useMemo(() => {
    const vMap = new Map<string, { id: string, name: string, count: number, color: string, totalVendido: number, totalFaturado: number, avatar: string | null }>();
    let colorIdx = 0;

    const mappedMarkers = cases.map(c => {
      const vId = c.assigned_vendor_id || c.assigned_user_id || "unassigned";
      const vName = c.assigned_vendor?.display_name || c.users_profile?.display_name || c.users_profile?.email || "Sem Responsável";
      const vAvatar = c.assigned_vendor?.avatar_url || c.users_profile?.avatar_url || null;
      
      if (!vMap.has(vId)) {
        vMap.set(vId, {
          id: vId,
          name: vName,
          count: 0,
          color: vId === "unassigned" ? "#94a3b8" : vendorColors[colorIdx % vendorColors.length],
          totalVendido: 0,
          totalFaturado: 0,
          avatar: vAvatar
        });
        if (vId !== "unassigned") colorIdx++;
      }
      
      const v = vMap.get(vId)!;
      v.count++;

      // Finance Calculations
      const f = caseFields?.get(c.id) || c.meta_json || {};
      const caseTotal = caseTotals?.get(c.id) || Number(f.expected_revenue) || 0;
      const billStatus = (f.billing_status || "Pendente").toLowerCase();
      const partialVal = Number(f.partial_paid_value || 0);

      v.totalVendido += caseTotal;
      if (billStatus.includes("pago") || billStatus.includes("faturado")) {
        v.totalFaturado += caseTotal;
      } else if (billStatus.includes("parcial")) {
        v.totalFaturado += partialVal;
      }

      // Filter out markers without real coordinates (removes fake points)
      const metaLat = c.meta_json?.lat || c.meta_json?.latitude;
      const metaLng = c.meta_json?.lng || c.meta_json?.longitude;
      
      let coords: [number, number] | null = null;
      if (metaLat && metaLng) {
        coords = [parseFloat(metaLat), parseFloat(metaLng)];
      }

      return {
        id: c.id,
        title: c.title || "Sem título",
        status: c.status || "Pendente",
        vendorId: vId,
        coords,
        color: v.color
      };
    }).filter(m => m.coords !== null); // Hide empty/mock coordinates

    const sortedVendors = Array.from(vMap.values()).sort((a, b) => b.count - a.count);

    return { vendors: sortedVendors, markers: mappedMarkers };
  }, [cases, caseFields, caseTotals]);

  const filteredVendors = vendors.filter(v => v.name.toLowerCase().includes(searchQ.toLowerCase()));

  // Rankings
  const topVendido = [...vendors].filter(v => v.id !== "unassigned").sort((a, b) => b.totalVendido - a.totalVendido).slice(0, 5);
  const topFaturado = [...vendors].filter(v => v.id !== "unassigned").sort((a, b) => b.totalFaturado - a.totalFaturado).slice(0, 5);

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

  const renderTerritoryPopup = (v: typeof vendors[0], conf: VendorTerritory) => {
    let sharedVendors = [v];
    
    // Check if there are other vendors with the EXACT SAME IBGE city configuration
    if (conf.type === "city" && conf.cityNames && conf.cityNames.length > 0) {
      const confCitiesString = [...conf.cityNames].sort().join(",");
      const others = vendors.filter(other => {
        if (other.id === v.id) return false;
        const otherConf = vendorConfig[other.id];
        if (otherConf && otherConf.type === "city") {
           const otherCities = otherConf.cityNames || (otherConf.cityName ? [otherConf.cityName] : []);
           return [...otherCities].sort().join(",") === confCitiesString;
        }
        return false;
      });
      sharedVendors = [...sharedVendors, ...others];
    }

    const title = conf.type === "city" 
      ? `Território: ${(conf.cityNames || [conf.cityName || ""]).join(", ")}` 
      : "Território Demarcado";

    return (
      <Popup className="rounded-2xl shadow-xl border-none">
        <div className="p-2 min-w-[200px] flex flex-col gap-3">
          <div className="text-[10px] uppercase font-black text-slate-400 tracking-widest border-b pb-1">
            {title}
          </div>
          
          <div className="flex flex-col gap-3">
            {sharedVendors.map(sv => (
              <div key={sv.id} className="flex flex-col gap-1.5 p-2 bg-slate-50 rounded-xl">
                <div className="flex items-center gap-2">
                  {sv.avatar ? (
                    <img src={sv.avatar} alt={sv.name} className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <div className="w-6 h-6 rounded-full text-white text-[10px] font-bold flex items-center justify-center" style={{ backgroundColor: sv.color }}>
                      {sv.name.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="font-bold text-xs text-slate-800 line-clamp-1">{sv.name}</div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-slate-500 uppercase">Vendido</span>
                    <span className="text-xs font-black text-emerald-600">{formatCurrency(sv.totalVendido)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-slate-500 uppercase">Faturado</span>
                    <span className="text-xs font-black text-blue-600">{formatCurrency(sv.totalFaturado)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Popup>
    );
  };

  return (
    <div className={cn("flex flex-col md:flex-row w-full gap-4", isFullscreen ? "h-full bg-slate-900 rounded-none p-0" : "h-[calc(100vh-220px)] bg-slate-50 p-2 rounded-[24px]")}>
      
      {/* Sidebar Left */}
      <div className={cn(
        "flex flex-col rounded-[20px] shadow-sm border overflow-hidden",
        isFullscreen ? "w-full md:w-80 bg-slate-800 border-slate-700" : "w-full md:w-[350px] bg-white border-slate-200"
      )}>
        <div className={cn("p-4 border-b", isFullscreen ? "border-slate-700 bg-slate-800/50" : "border-slate-100 bg-slate-50/50")}>
          <h2 className={cn("text-lg font-bold flex items-center gap-2", isFullscreen ? "text-slate-100" : "text-slate-800")}>
            <MapIcon className="w-5 h-5 text-blue-500" />
            Configurações
          </h2>
          <p className={cn("text-xs mt-1", isFullscreen ? "text-slate-400" : "text-slate-500")}>Gerir alcance e raios</p>
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
                    {v.avatar ? (
                       <img src={v.avatar} alt="" className="w-8 h-8 rounded-full object-cover border-2 shadow-sm" style={{ borderColor: v.color }} />
                    ) : (
                       <div className="w-8 h-8 rounded-full shadow-sm text-white text-[10px] font-bold flex items-center justify-center border-2" style={{ backgroundColor: v.color, borderColor: v.color }}>
                         {v.name.substring(0, 2).toUpperCase()}
                       </div>
                    )}
                    
                    <div>
                      <div className={cn("text-sm font-semibold line-clamp-1", isFullscreen ? "text-slate-100" : "text-slate-800")}>{v.name}</div>
                      <div className={cn("text-[10px] font-bold mt-0.5", isFullscreen ? "text-slate-400" : "text-slate-500")}>
                         Vend: <span className="text-emerald-500">{formatCurrency(v.totalVendido)}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className={cn("font-bold text-[10px]", isFullscreen ? "bg-slate-900 text-slate-300" : "bg-slate-100 text-slate-700")}>
                      {v.count} ped.
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
                            
                            // Initialize with multi-city support
                            const initialCities = conf?.cityNames || (conf?.cityName ? [conf.cityName] : []);
                            setEditCityList(initialCities);
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

                    {/* Forms */}
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

                    {editTab === "city" && (
                      <div className="space-y-3">
                        <p className="text-[10px] text-slate-500 leading-tight">
                          Selecione um ou mais municípios para baixar as divisas oficias do IBGE.
                        </p>
                        <div>
                          <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Municípios do Paraná (PR)</label>
                          <div className="flex gap-2 mt-1">
                            
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="outline" className="flex-1 h-8 text-xs bg-white border-slate-200 justify-between">
                                  <span className="truncate">
                                    {editCityList.length > 0 
                                      ? `${editCityList.length} cidade(s) selecionada(s)` 
                                      : "Selecionar cidades..."}
                                  </span>
                                  <ChevronDown className="h-3 w-3 opacity-50 ml-2 flex-shrink-0" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[300px] p-2 rounded-xl" align="start">
                                <Input 
                                  placeholder="Buscar cidade..." 
                                  value={citySearchText} 
                                  onChange={(e) => setCitySearchText(e.target.value)} 
                                  className="h-8 text-xs mb-2 bg-slate-50 border-slate-200" 
                                />
                                <div className="max-h-[200px] overflow-y-auto space-y-1.5 pr-2">
                                  {prCities.filter(c => c.toLowerCase().includes(citySearchText.toLowerCase())).map(c => (
                                    <div key={c} className="flex items-center space-x-2">
                                      <Checkbox 
                                        id={`city-${c}`} 
                                        checked={editCityList.includes(c)}
                                        onCheckedChange={(checked) => {
                                          if (checked) setEditCityList(prev => [...prev, c]);
                                          else setEditCityList(prev => prev.filter(x => x !== c));
                                        }}
                                      />
                                      <label htmlFor={`city-${c}`} className="text-xs text-slate-700 cursor-pointer select-none">
                                        {c}
                                      </label>
                                    </div>
                                  ))}
                                  {prCities.filter(c => c.toLowerCase().includes(citySearchText.toLowerCase())).length === 0 && (
                                    <div className="text-xs text-slate-500 text-center py-2">Nenhuma cidade encontrada.</div>
                                  )}
                                </div>
                              </PopoverContent>
                            </Popover>

                            <Button 
                              size="sm" 
                              onClick={handleCitySearch}
                              disabled={isCityLoading || editCityList.length === 0}
                              className="h-8 bg-slate-800 hover:bg-slate-900 px-3"
                            >
                              {isCityLoading ? "..." : "Carregar Mapa"}
                            </Button>
                          </div>
                        </div>
                        {editCityGeoJson && (
                          <Badge className="bg-emerald-100 text-emerald-700 border-none font-bold">
                            ✔ Geometria carregada com sucesso!
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
              key={`preview-city-${editCityList.join(",")}`}
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
                  {renderTerritoryPopup(v, conf)}
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
                  {renderTerritoryPopup(v, conf)}
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
                  {renderTerritoryPopup(v, conf)}
                </GeoJSON>
              );
            }

            return null;
          })}

          {/* Markers: Only precise ones */}
          {markers.map(m => {
            if (!m.coords) return null; // Ensure no undefined coords leak into UI
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

      {/* Sidebar Right: Top 5 Finances (Hidden on Mobile) */}
      <div className={cn(
        "hidden lg:flex flex-col rounded-[20px] shadow-sm border overflow-hidden",
        isFullscreen ? "w-72 bg-slate-800 border-slate-700" : "w-72 bg-white border-slate-200"
      )}>
        <div className={cn("p-4 border-b", isFullscreen ? "border-slate-700 bg-slate-800/50" : "border-slate-100 bg-slate-50/50")}>
          <h2 className={cn("text-base font-bold flex items-center gap-2", isFullscreen ? "text-slate-100" : "text-slate-800")}>
            <DollarSign className="w-4 h-4 text-emerald-500" />
            Top 5 Vendedores
          </h2>
          <p className={cn("text-[11px] mt-1", isFullscreen ? "text-slate-400" : "text-slate-500")}>Ranking por faturamento (R$)</p>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-5 no-scrollbar">
          
          {/* Top Vendido */}
          <div>
            <h3 className={cn("text-xs font-black uppercase tracking-widest mb-3 flex items-center gap-1", isFullscreen ? "text-slate-400" : "text-slate-400")}>
              <TrendingUp className="w-3 h-3 text-emerald-500" /> Mais Vendidos
            </h3>
            <div className="space-y-3">
              {topVendido.map((v, i) => {
                const maxVol = topVendido[0]?.totalVendido || 1;
                const pct = (v.totalVendido / maxVol) * 100;
                return (
                  <div key={v.id} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={cn("text-[10px] font-bold w-3", isFullscreen ? "text-slate-500" : "text-slate-400")}>{i + 1}</span>
                        <span className={cn("text-xs font-bold line-clamp-1 max-w-[100px]", isFullscreen ? "text-slate-200" : "text-slate-700")}>{v.name}</span>
                      </div>
                      <span className={cn("text-xs font-black text-emerald-500")}>{formatCurrency(v.totalVendido)}</span>
                    </div>
                    <div className={cn("h-1.5 w-full rounded-full overflow-hidden", isFullscreen ? "bg-slate-700" : "bg-slate-100")}>
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })}
              {topVendido.length === 0 && <div className="text-xs text-slate-500 text-center py-4">Nenhuma venda encontrada</div>}
            </div>
          </div>

          <div className={cn("h-px w-full", isFullscreen ? "bg-slate-700" : "bg-slate-100")} />

          {/* Top Faturado */}
          <div>
            <h3 className={cn("text-xs font-black uppercase tracking-widest mb-3 flex items-center gap-1", isFullscreen ? "text-slate-400" : "text-slate-400")}>
               Mais Faturados
            </h3>
            <div className="space-y-3">
              {topFaturado.map((v, i) => {
                const maxVol = topFaturado[0]?.totalFaturado || 1;
                const pct = (v.totalFaturado / maxVol) * 100;
                return (
                  <div key={v.id} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={cn("text-[10px] font-bold w-3", isFullscreen ? "text-slate-500" : "text-slate-400")}>{i + 1}</span>
                        <span className={cn("text-xs font-bold line-clamp-1 max-w-[100px]", isFullscreen ? "text-slate-200" : "text-slate-700")}>{v.name}</span>
                      </div>
                      <span className={cn("text-xs font-black text-blue-500")}>{formatCurrency(v.totalFaturado)}</span>
                    </div>
                    <div className={cn("h-1.5 w-full rounded-full overflow-hidden", isFullscreen ? "bg-slate-700" : "bg-slate-100")}>
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })}
              {topFaturado.length === 0 && <div className="text-xs text-slate-500 text-center py-4">Nenhum faturamento</div>}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
