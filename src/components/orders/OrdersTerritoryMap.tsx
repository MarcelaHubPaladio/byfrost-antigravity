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
import { isPointInFeature } from "./TerritoryMath";

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

type VendorTerritory = {
  type: "circle" | "polygon" | "city";
  lat?: number;
  lng?: number;
  radiusKm?: number;
  polygonCoords?: [number, number][];
  cityName?: string;
  cityNames?: string[];
  geojson?: any;
  hideFromRanking?: boolean;
  autoPlayIntervalSecs?: number;
};

type MappedMarker = {
  id: string;
  title: string;
  status: string;
  vendorId: string;
  coords: [number, number] | null;
  color: string;
  caseTotal: number;
  caseFaturado: number;
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
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [selectedCityName, setSelectedCityName] = useState<string | null>(null);
  const [autoPlayIndex, setAutoPlayIndex] = useState(0);
  
  const storageKey = `territory_config_${activeTenantId}`;
  const [vendorConfig, setVendorConfig] = useState<Record<string, VendorTerritory>>({});
  const [editingConfig, setEditingConfig] = useState<string | null>(null);
  const [editTab, setEditTab] = useState<"circle" | "polygon" | "city">("circle");
  const [editHideRanking, setEditHideRanking] = useState(false);
  const [editLat, setEditLat] = useState("");
  const [editLng, setEditLng] = useState("");
  const [editRadius, setEditRadius] = useState("");
  const [editPolygon, setEditPolygon] = useState<[number, number][]>([]);
  const [editCityList, setEditCityList] = useState<string[]>([]);
  const [editCityGeoJson, setEditCityGeoJson] = useState<any>(null);
  const [isCityLoading, setIsCityLoading] = useState(false);
  const [prCities, setPrCities] = useState<string[]>([]);
  const [citySearchText, setCitySearchText] = useState("");
  const [autoPlayIntervalSecs, setAutoPlayIntervalSecs] = useState(5);

  useEffect(() => {
    fetch("https://servicodados.ibge.gov.br/api/v1/localidades/estados/PR/municipios")
      .then(res => res.json())
      .then(data => setPrCities(data.map((d: any) => d.nome).sort()))
      .catch(err => console.error("Falha ao buscar cidades do PR", err));
  }, []);

  useEffect(() => {
    if (activeTenantId) {
      const saved = localStorage.getItem(storageKey);
      if (saved) setVendorConfig(JSON.parse(saved));
    }
  }, [activeTenantId, storageKey]);

  const saveConfig = (vId: string) => {
    const newConf: VendorTerritory = { 
      type: editTab, 
      hideFromRanking: editHideRanking,
      autoPlayIntervalSecs 
    };

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
    setIsCityLoading(true);
    try {
      const features = [];
      for (const city of editCityList) {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city + ", Paraná, Brazil")}&format=geojson&polygon_geojson=1&limit=1&polygon_threshold=0.005`);
        const data = await res.json();
        if (data?.features?.length > 0) features.push(data.features[0]);
      }
      setEditCityGeoJson({ type: "FeatureCollection", features });
    } catch (e) { alert("Erro ao buscar cidades."); }
    setIsCityLoading(false);
  };

  const { vendors, markers } = useMemo(() => {
    const vMap = new Map<string, any>();
    let colorIdx = 0;
    const vendorColors = ["#6366f1", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316", "#eab308", "#10b981", "#ef4444", "#3b82f6"];

    const mappedMarkers: MappedMarker[] = cases.map(c => {
      const vId = c.assigned_vendor_id || "unassigned";
      if (!vMap.has(vId)) {
        vMap.set(vId, { id: vId, name: c.assigned_vendor?.display_name || "Sem Responsável", count: 0, color: vId === "unassigned" ? "#94a3b8" : vendorColors[colorIdx++ % vendorColors.length], totalVendido: 0, totalFaturado: 0 });
      }
      const v = vMap.get(vId);
      v.count++;
      const f = caseFields?.get(c.id) || c.meta_json || {};
      const caseTotal = caseTotals?.get(c.id) || Number(f.expected_revenue) || 0;
      const billStatus = (f.billing_status || "Pendente").toLowerCase();
      const billVal = billStatus.includes("pago") || billStatus.includes("faturado") ? caseTotal : (billStatus.includes("parcial") ? Number(f.partial_paid_value || 0) : 0);
      
      v.totalVendido += caseTotal;
      v.totalFaturado += billVal;

      return {
        id: c.id,
        title: c.title || "Sem título",
        status: c.status || "Pendente",
        vendorId: vId,
        coords: (c.meta_json?.lat || c.meta_json?.latitude) ? [parseFloat(c.meta_json.lat || c.meta_json.latitude), parseFloat(c.meta_json.lng || c.meta_json.longitude)] : null,
        color: v.color,
        caseTotal,
        caseFaturado: billVal
      };
    });

    return { vendors: Array.from(vMap.values()), markers: mappedMarkers };
  }, [cases, caseFields, caseTotals]);

  const activeGeoFeatures = useMemo(() => {
    const features: { city: string, feature: any, vendors: any[], totalVendido: number, totalFaturado: number, count: number }[] = [];
    const map = new Map();
    vendors.forEach(v => {
      const conf = vendorConfig[v.id];
      if(!conf || conf.hideFromRanking) return;
      if(conf.type === "city" && conf.geojson?.features) {
         conf.geojson.features.forEach((f: any) => {
            const cName = f.properties?.name || "Desconhecida";
            if(!map.has(cName)) {
               map.set(cName, { city: cName, feature: f, vendors: [], totalVendido: 0, totalFaturado: 0, count: 0 });
               features.push(map.get(cName));
            }
            if (!map.get(cName).vendors.find((x:any)=>x.id===v.id)) map.get(cName).vendors.push(v);
         });
      }
    });

    features.forEach(cityData => {
       markers.forEach(m => {
          if (m.coords && isPointInFeature(m.coords[1], m.coords[0], cityData.feature)) {
             cityData.count++;
             cityData.totalVendido += m.caseTotal;
             cityData.totalFaturado += m.caseFaturado;
          }
       });
    });
    return features.sort((a,b) => b.totalFaturado - a.totalFaturado);
  }, [vendors, vendorConfig, markers]);
  const filteredVendors = vendors.filter(v => v.name.toLowerCase().includes(searchQ.toLowerCase()));

  // Rankings
  const rankingCandidates = vendors.filter(v => v.id !== "unassigned" && !vendorConfig[v.id]?.hideFromRanking && vendorConfig[v.id]);
  const topFaturado = [...rankingCandidates].sort((a, b) => b.totalFaturado - a.totalFaturado).slice(0, 5);
  const topCount = [...rankingCandidates].sort((a, b) => b.count - a.count).slice(0, 3);

  useEffect(() => {
    if (!isFullscreen || activeGeoFeatures.length === 0) return;
    if (!selectedCityName) setSelectedCityName(activeGeoFeatures[0].city);
    const interval = setInterval(() => {
      setAutoPlayIndex(prev => {
        const next = (prev + 1) % activeGeoFeatures.length;
        setSelectedCityName(activeGeoFeatures[next].city);
        if (mapInstance && activeGeoFeatures[next].feature?.bbox) {
          const b = activeGeoFeatures[next].feature.bbox;
          mapInstance.fitBounds([[b[1], b[0]], [b[3], b[2]]]);
        }
        return next;
      });
    }, (autoPlayIntervalSecs || 5) * 1000);
    return () => clearInterval(interval);
  }, [isFullscreen, activeGeoFeatures, autoPlayIntervalSecs, mapInstance]);

  const renderTerritoryPopup = (v: any, conf: any) => (
    <Popup className="rounded-xl overflow-hidden shadow-lg border-0">
      <div className="p-3 bg-white min-w-[220px]">
        <div className="flex items-center gap-3 border-b pb-2 mb-2">
          {v.avatar ? (
            <img src={v.avatar} className="w-10 h-10 rounded-full object-cover shadow-sm border" style={{ borderColor: v.color }} />
          ) : (
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-sm border" style={{ backgroundColor: v.color, borderColor: v.color }}>
              {v.name.substring(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <h4 className="font-bold text-sm text-slate-800 line-clamp-1" title={v.name}>{v.name}</h4>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: v.color }}></span>
              <span className="text-[10px] text-slate-500 font-medium tracking-wide uppercase">Área de Atuação</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
            <div className="text-[10px] text-slate-500 font-medium mb-0.5 flex items-center gap-1">Pedidos</div>
            <div className="font-bold text-sm text-slate-800">{v.count} un.</div>
          </div>
          <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
            <div className="text-[10px] text-slate-500 font-medium mb-0.5 flex items-center gap-1">Faturado</div>
            <div className="font-bold text-sm text-emerald-600 line-clamp-1" title={formatCurrency(v.totalFaturado)}>{formatCurrency(v.totalFaturado)}</div>
          </div>
        </div>

        {conf.type === "circle" && (
          <div className="text-[11px] text-slate-600 bg-slate-100/50 p-2 rounded flex items-center gap-1.5 justify-center">
            Raio de <span className="font-bold">{conf.radiusKm}km</span>
          </div>
        )}
        {conf.type === "polygon" && conf.cityNames && conf.cityNames.length > 0 && (
          <div className="text-[11px] text-slate-600 bg-slate-100/50 p-2 rounded max-h-[80px] overflow-y-auto no-scrollbar">
            <div className="font-medium text-slate-800 mb-1 flex items-center gap-1">Cidades Atendidas:</div>
            <div className="flex flex-wrap gap-1">
              {conf.cityNames.map((city: string) => (
                <span key={city} className="bg-white border px-1.5 py-0.5 rounded text-[10px] leading-tight text-slate-700 shadow-sm">{city}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Popup>
  );

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
      {/* Sidebar Left */}
      {!isFullscreen && (
      <div className={cn(
        "flex flex-col rounded-[20px] shadow-sm border overflow-hidden",
        "w-full md:w-[350px] bg-white border-slate-200"
      )}>
        <div className={cn("p-4 border-b", isFullscreen ? "border-slate-700 bg-slate-800/50" : "border-slate-100 bg-slate-50/50")}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className={cn("text-lg font-bold flex items-center gap-2", isFullscreen ? "text-slate-100" : "text-slate-800")}>
                <MapIcon className="w-5 h-5 text-blue-500" />
                Configurações
              </h2>
              <p className={cn("text-xs mt-1", isFullscreen ? "text-slate-400" : "text-slate-500")}>Gerir alcance e raios</p>
            </div>
            {!isFullscreen && (
              <button 
                onClick={() => {
                  if (confirm("Isso apagará a memória do mapa e os polígonos travados. Deseja limpar os territórios de todos os vendedores?")) {
                    localStorage.removeItem(storageKey);
                    setVendorConfig({});
                    setSelectedVendorId(null);
                    setEditingConfig(null);
                  }
                }}
                className="p-1.5 text-rose-500 hover:bg-rose-100 rounded-lg transition-colors border border-transparent hover:border-rose-200"
                title="Limpar memórias e territórios"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
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
                            setEditHideRanking(conf?.hideFromRanking || false);
                            
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
                                  {prCities
                                    .filter(c => c.toLowerCase().includes(citySearchText.toLowerCase()))
                                    .sort((a, b) => {
                                      const aSel = editCityList.includes(a);
                                      const bSel = editCityList.includes(b);
                                      if (aSel && !bSel) return -1;
                                      if (!aSel && bSel) return 1;
                                      return a.localeCompare(b);
                                    })
                                    .map(c => (
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
                    
                    <div className="flex items-center space-x-2 pt-2 border-t border-blue-200">
                      <Checkbox 
                        id={`hideRanking-${v.id}`} 
                        checked={editHideRanking}
                        onCheckedChange={(checked) => setEditHideRanking(!!checked)}
                      />
                      <label htmlFor={`hideRanking-${v.id}`} className="text-[10px] uppercase font-bold text-slate-600 cursor-pointer select-none">
                        Ocultar este vendedor dos Rankings Oficiais
                      </label>
                    </div>

                    <Button size="sm" className="w-full h-8 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs shadow-sm font-bold mt-2" onClick={() => saveConfig(v.id)}>
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
      )}



      <div className={cn(
        "relative overflow-hidden rounded-[20px] shadow-sm border",
        isFullscreen ? "absolute inset-0 z-0 border-none rounded-none" : "flex-1 border-slate-200 bg-slate-200"
      )}>
        <MapContainer 
          center={[-25.467, -50.651]} 
          zoom={13} 
          style={{ height: "100%", width: "100%", background: isFullscreen ? "#0f172a" : "#e2e8f0" }}
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

            const baseStyle = {
              color: v.color,
              fillColor: v.color,
              fillOpacity: isSelected || selectedVendorId === null ? 0.25 : 0.05,
              weight: isSelected ? 3 : 1,
              dashArray: isSelected ? undefined : "5, 5"
            };

            if (conf.type === "circle" && conf.lat && conf.lng && conf.radiusKm) {
              return (
                <Circle 
                  key={`circle-${v.id}-${isSelected ? 'on' : 'off'}`}
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
                  key={`poly-${v.id}-${isSelected ? 'on' : 'off'}`}
                  positions={conf.polygonCoords}
                  pathOptions={baseStyle}
                >
                  {renderTerritoryPopup(v, conf)}
                </Polygon>
              );
            }

            // Quando em FullScreen, ignoramos as outras features do JSON e focamos apenas na acesa
            if (conf.type === "city" && conf.geojson) {
              if (isFullscreen) {
                 return (
                    <GeoJSON
                      key={`city-fs-${v.id}-${conf.geojson.features.length}`}
                      data={conf.geojson}
                      style={(feature) => {
                         const isActiveCity = feature?.properties?.name === selectedCityName;
                         return {
                           color: v.color,
                           fillColor: v.color,
                           fillOpacity: isActiveCity ? 0.35 : 0.0, // Acende so a ativia
                           weight: isActiveCity ? 4 : 0, // Borda so na ativa
                         }
                      }}
                    >
                      <Tooltip permanent direction="center" className="bg-transparent border-none text-white text-3xl font-black drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] opacity-100 shadow-none">
                         {selectedCityName}
                      </Tooltip>
                    </GeoJSON>
                 );
              }

              return (
                <GeoJSON
                  key={`city-${v.id}-${isSelected ? 'on' : 'off'}-${Math.random()}`}
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

        {/* Placar Eletrônico Rotativo para Dashboard (Por CIDADE) */}
        {isFullscreen && selectedCityName && (
           <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[400] bg-slate-900/95 border border-slate-700/80 p-5 rounded-[32px] shadow-2xl backdrop-blur-xl flex items-center gap-6 animate-in slide-in-from-bottom-10 fade-in duration-500">
             {/* conteúdo: Cidade, Total R$, Faturamento, Vendedores */}
             {(() => {
               const cityObj = activeGeoFeatures.find(x => x.city === selectedCityName);
               if(!cityObj) return null;
               
               const mainVendor = cityObj.vendors[0] || vendors[0];

               return (
                 <>
                   <div className="flex -space-x-4 pl-2 pr-4 border-r border-slate-700">
                     {cityObj.vendors.slice(0, 3).map((v, i) => (
                       v.avatar ? (
                         <img key={v.id} src={v.avatar} title={v.name} className="w-16 h-16 md:w-20 md:h-20 rounded-full object-cover border-[3px] shadow-[0_0_20px_rgba(0,0,0,0.5)] z-10" style={{ borderColor: v.color, zIndex: 30 - i }} />
                       ) : (
                         <div key={v.id} title={v.name} className="w-16 h-16 md:w-20 md:h-20 rounded-full shadow-[0_0_20px_rgba(0,0,0,0.5)] text-white text-xl md:text-2xl font-black flex items-center justify-center border-[3px] z-10" style={{ backgroundColor: v.color, borderColor: v.color, zIndex: 30 - i }}>
                           {v.name.substring(0, 2).toUpperCase()}
                         </div>
                       )
                     ))}
                   </div>
                   <div className="flex flex-col pr-8 border-r border-slate-700">
                     <span className="text-slate-400 font-bold text-[9px] md:text-[10px] tracking-widest uppercase mb-1 flex items-center gap-1"><Building2 className="w-3 h-3 text-emerald-400"/> Território em Foco</span>
                     <span className="text-white font-black text-2xl md:text-3xl max-w-[300px] truncate leading-tight">{cityObj.city}</span>
                     <span className="text-slate-400 text-[10px] md:text-xs font-semibold mt-1">Cálculo em Tempo Real</span>
                   </div>
                   <div className="flex flex-col px-4">
                     <span className="text-emerald-500 font-bold text-[9px] md:text-[10px] tracking-widest uppercase mb-1">Movimentado Local</span>
                     <span className="text-emerald-400 font-black text-2xl md:text-3xl leading-tight">{formatCurrency(cityObj.totalVendido)}</span>
                     <span className="text-slate-500 text-[10px] md:text-xs font-semibold mt-1">{cityObj.count} pedidos captados na área</span>
                   </div>
                   <div className="flex flex-col pl-4">
                     <span className="text-blue-500 font-bold text-[9px] md:text-[10px] tracking-widest uppercase mb-1">Faturamento Regional</span>
                     <span className="text-blue-400 font-black text-2xl md:text-3xl leading-tight">{formatCurrency(cityObj.totalFaturado)}</span>
                     <span className="text-slate-500 text-[10px] md:text-xs font-semibold mt-1">Valores Aprovados e Pagos</span>
                   </div>
                 </>
               )
             })()}
           </div>
        )}
      </div>

      {/* Sidebar Right: Rankings Otimizados */}
      <div className={cn(
        "hidden lg:flex flex-col rounded-[20px] shadow-sm overflow-hidden",
        isFullscreen ? "absolute right-6 top-6 bottom-6 w-[180px] bg-slate-900/80 backdrop-blur-xl border border-slate-700/80 z-[400]" : "w-72 bg-white border border-slate-200"
      )}>
        <div className={cn("p-4 border-b", isFullscreen ? "border-slate-700 bg-slate-800/50" : "border-slate-100 bg-slate-50/50")}>
          <h2 className={cn("text-base font-bold flex items-center gap-2", isFullscreen ? "text-slate-100" : "text-slate-800")}>
            <DollarSign className="w-4 h-4 text-emerald-500" />
            Top 5 Vendedores
          </h2>
          <p className={cn("text-[11px] mt-1", isFullscreen ? "text-slate-400" : "text-slate-500")}>Ranking por faturamento (R$)</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar">
          
          {/* Top Faturado */}
          <div>
            <h3 className={cn("text-[10px] font-black uppercase tracking-widest mb-4 flex items-center gap-1.5", isFullscreen ? "text-slate-500" : "text-slate-400")}>
               Mais Faturados
            </h3>
            <div className="space-y-3.5">
              {topFaturado.map((v, i) => {
                const maxVol = topFaturado[0]?.totalFaturado || 1;
                const pct = (v.totalFaturado / maxVol) * 100;
                return (
                  <div key={v.id} className={cn("flex flex-col gap-2 p-2.5 rounded-xl transition-colors", isFullscreen ? "bg-slate-800/50 hover:bg-slate-800" : "bg-slate-50 hover:bg-slate-100")}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className={cn("text-xs font-black w-4 flex justify-center", i === 0 ? "text-blue-500" : isFullscreen ? "text-slate-600" : "text-slate-400")}>{i + 1}º</span>
                        {v.avatar ? (
                          <img src={v.avatar} className="w-7 h-7 rounded-full object-cover shadow-sm border" style={{borderColor: v.color}} />
                        ) : (
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white shadow-sm border" style={{backgroundColor: v.color, borderColor: v.color}}>
                            {v.name.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <span className={cn("text-[10px] font-bold line-clamp-1", isFullscreen ? "text-slate-200 max-w-[50px]" : "text-slate-700 max-w-[100px]")}>{v.name}</span>
                      </div>
                      <span className={cn("text-[10px] font-black text-blue-500")}>{formatCurrency(v.totalFaturado)}</span>
                    </div>
                    <div className={cn("h-1 w-full rounded-full overflow-hidden", isFullscreen ? "bg-slate-700" : "bg-slate-200")}>
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })}
              {topFaturado.length === 0 && <div className="text-[10px] text-slate-500 text-center py-4">Nenhum faturamento</div>}
            </div>
          </div>

          <div className={cn("h-px w-full", isFullscreen ? "bg-slate-800" : "bg-slate-100")} />

          {/* Top Volume (Count) */}
          <div>
            <h3 className={cn("text-[10px] font-black uppercase tracking-widest mb-4 flex items-center gap-1.5", isFullscreen ? "text-slate-500" : "text-slate-400")}>
              <TrendingUp className="w-3.5 h-3.5 text-purple-500" /> Mais Pedidos
            </h3>
            <div className="space-y-3.5">
              {topCount.map((v, i) => {
                const maxVol = topCount[0]?.count || 1;
                const pct = (v.count / maxVol) * 100;
                return (
                  <div key={v.id} className={cn("flex flex-col gap-2 p-2.5 rounded-xl transition-colors", isFullscreen ? "bg-slate-800/50 hover:bg-slate-800" : "bg-slate-50 hover:bg-slate-100")}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className={cn("text-xs font-black w-4 flex justify-center", i === 0 ? "text-purple-500" : isFullscreen ? "text-slate-600" : "text-slate-400")}>{i + 1}º</span>
                        
                        {v.avatar ? (
                          <img src={v.avatar} className="w-7 h-7 rounded-full object-cover shadow-sm border" style={{borderColor: v.color}} />
                        ) : (
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white shadow-sm border" style={{backgroundColor: v.color, borderColor: v.color}}>
                            {v.name.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <span className={cn("text-[10px] font-bold line-clamp-1", isFullscreen ? "text-slate-200 max-w-[50px]" : "text-slate-700 max-w-[100px]")}>{v.name}</span>
                      </div>
                      <span className={cn("text-xs font-black text-purple-500")}>{v.count} un.</span>
                    </div>
                    <div className={cn("h-1 w-full rounded-full overflow-hidden", isFullscreen ? "bg-slate-700" : "bg-slate-200")}>
                      <div className="h-full bg-purple-500 rounded-full" style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })}
              {topCount.length === 0 && <div className="text-[10px] text-slate-500 text-center py-4">Nenhum pedido no período</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
