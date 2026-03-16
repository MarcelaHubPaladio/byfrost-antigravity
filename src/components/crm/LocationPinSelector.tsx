import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import { divIcon } from "leaflet";
import { Button } from "@/components/ui/button";
import { MapPin, LocateFixed } from "lucide-react";

type LatLng = { lat: number; lng: number };

// react-leaflet v5 typings workaround
const RLMapContainer = MapContainer as any;
const RLTileLayer = TileLayer as any;
const RLMarker = Marker as any;

function ClampCenter({ center, zoom }: { center: LatLng; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng] as any, zoom ?? map.getZoom(), { animate: true } as any);
  }, [center.lat, center.lng, zoom, map]);
  return null;
}

function ClickToPick({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onPick({ lat: (e as any).latlng.lat, lng: (e as any).latlng.lng });
    },
  } as any);
  return null;
}

const pinIcon = divIcon({
  className: "",
  html: `
    <div style="
      width: 34px;
      height: 34px;
      border-radius: 9999px;
      background: rgba(var(--byfrost-accent-rgb, 59, 130, 246), 0.12);
      border: 2px solid rgba(var(--byfrost-accent-rgb, 59, 130, 246), 0.65);
      box-shadow: 0 8px 18px rgba(2,6,23,0.18);
      display:flex;
      align-items:center;
      justify-content:center;
      transform: translate(-50%, -50%);
    ">
      <div style="
        width: 10px;
        height: 10px;
        border-radius: 9999px;
        background: rgba(var(--byfrost-accent-rgb, 59, 130, 246), 0.95);
      "></div>
    </div>
  `,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

export function LocationPinSelector({
  value,
  onChange,
  className,
}: {
  value: LatLng | null;
  onChange: (next: LatLng) => void;
  className?: string;
}) {
  const [zoom, setZoom] = useState(15);

  const canUseGeolocation = typeof navigator !== "undefined" && "geolocation" in navigator;

  // Default to -25.4284, -49.2733 (Curitiba) if no value
  const center = useMemo(() => value || { lat: -25.4284, lng: -49.2733 }, [value?.lat, value?.lng]);

  const recenterToMe = async () => {
    if (!canUseGeolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        onChange(next);
        setZoom(17);
      },
      () => null,
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 8_000 }
    );
  };

  // Auto-locate on first mount if no value
  useEffect(() => {
    if (!value && canUseGeolocation) {
        recenterToMe();
    }
  }, []);

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800">
          <MapPin className="h-4 w-4 text-slate-500" />
          Mova o pin ou clique no mapa
        </div>
        <div className="flex items-center gap-2">
          {canUseGeolocation && (
            <Button 
                type="button" 
                variant="outline" 
                onClick={recenterToMe} 
                className="h-8 rounded-xl px-2 text-[11px] border-slate-200"
            >
              <LocateFixed className="mr-1.5 h-3.5 w-3.5" />
              GPS
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <RLMapContainer center={[center.lat, center.lng]} zoom={zoom} scrollWheelZoom className="h-[240px] w-full">
          <RLTileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <ClampCenter center={center} zoom={zoom} />
          <ClickToPick onPick={(p) => onChange(p)} />

          <RLMarker
            position={[center.lat, center.lng]}
            icon={pinIcon}
            draggable
            eventHandlers={{
              dragend: (e: any) => {
                const m = e.target as any;
                const ll = m.getLatLng?.();
                if (!ll) return;
                onChange({ lat: ll.lat, lng: ll.lng });
              },
            }}
          />
        </RLMapContainer>
      </div>

      <div className="mt-2 flex justify-between rounded-xl bg-slate-50 px-3 py-1.5 text-[10px] text-slate-500 font-mono">
        <span>{center.lat?.toFixed?.(6) || "0.000000"}</span>
        <span>{center.lng?.toFixed?.(6) || "0.000000"}</span>
      </div>
    </div>
  );
}
