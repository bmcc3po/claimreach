"use client";
import { useEffect, useRef, useState, useCallback } from "react";

// Loads the Google Maps JS API once (browser key, referrer-restricted).
let mapsPromise: Promise<void> | null = null;
function loadMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).google?.maps) return Promise.resolve();
  if (mapsPromise) return mapsPromise;
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
  mapsPromise = new Promise<void>((resolve, reject) => {
    if (!key) { reject(new Error("browser maps key missing")); return; }
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("maps failed to load"));
    document.head.appendChild(s);
  });
  return mapsPromise;
}

export default function AreaPanel({
  lat, lng, name, landmarks, onLandmarks,
}: {
  lat: number;
  lng: number;
  name: string;
  landmarks: string;
  onLandmarks: (v: string) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const svRef = useRef<HTMLDivElement>(null);
  const [nearby, setNearby] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const init = useCallback(async () => {
    try {
      await loadMaps();
      const g = (window as any).google;
      const center = { lat, lng };

      // Interactive map
      const map = new g.maps.Map(mapRef.current, {
        center, zoom: 17, mapTypeControl: false, streetViewControl: true,
      });
      new g.maps.Marker({ position: center, map, title: name });

      // Street View panorama, linked so the map's pegman drives it
      const pano = new g.maps.StreetViewPanorama(svRef.current, {
        position: center, pov: { heading: 0, pitch: 0 }, zoom: 1,
        addressControl: false, linksControl: true, motionTracking: false,
      });
      map.setStreetView(pano);

      // Nearby businesses (the "was there a Denny's?" helper)
      const svc = new g.maps.places.PlacesService(map);
      svc.nearbySearch(
        { location: center, radius: 250, type: "restaurant" },
        (results: any[], status: string) => {
          if (status === g.maps.places.PlacesServiceStatus.OK && results) {
            const names = results.slice(0, 8).map((r) => r.name);
            setNearby(names);
            results.slice(0, 8).forEach((r) => {
              new g.maps.Marker({
                position: r.geometry.location, map,
                icon: { url: "https://maps.google.com/mapfiles/ms/icons/orange-dot.png" },
                title: r.name,
              });
            });
          }
        }
      );
      // Also gas stations / convenience, common trafficking-area anchors
      svc.nearbySearch(
        { location: center, radius: 250, type: "gas_station" },
        (results: any[], status: string) => {
          if (status === g.maps.places.PlacesServiceStatus.OK && results) {
            setNearby((prev) => Array.from(new Set([...prev, ...results.slice(0, 4).map((r) => r.name)])));
          }
        }
      );
    } catch (e: any) {
      setErr(e.message);
    }
  }, [lat, lng, name]);

  useEffect(() => { init(); }, [init]);

  return (
    <div className="card" style={{ background: "#fbfcfe" }}>
      <strong>Confirm the area with the claimant</strong>
      <div className="agent-note" style={{ marginTop: 8 }}>
        <span className="tag">Agent:</span>
        Pan the map and Street View. Ask what they remember nearby, "was there a Denny's? a gas
        station?" Drag the orange pegman onto the street to look around. Note what they recognize.
      </div>

      {err && (
        <div className="gate"><span className="tag">Map unavailable</span>{err}. The static photo
          above still confirms the building.</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
        <div ref={mapRef} style={{ width: "100%", height: 300, borderRadius: 8, background: "#eef1f5" }} />
        <div ref={svRef} style={{ width: "100%", height: 300, borderRadius: 8, background: "#eef1f5" }} />
      </div>

      {nearby.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>
            Nearby (prompt the claimant, don't lead): {nearby.join(", ")}
          </div>
        </div>
      )}

      <div className="field" style={{ marginTop: 10 }}>
        <label>Landmarks the claimant recognized (corroborating detail)</label>
        <textarea
          placeholder="e.g. Denny's next door, Shell station across the street, freeway on-ramp behind it"
          value={landmarks}
          onChange={(e) => onLandmarks(e.target.value)}
        />
      </div>
    </div>
  );
}
