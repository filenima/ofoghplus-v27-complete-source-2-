"use client";

// ─── v20: نقشهٔ تعاملی کلیک-و-انتخاب موقعیت مغازه ───
// جایگزین ورود دستی lat/lng: مالک روی نقشه کلیک می‌کند یا جستجو می‌کند؛
// مارکر قابل درگ است و مختصات لحظه‌ای برمی‌گردد.
// leaflet فقط سمت کلاینت و تنها هنگام mount لود می‌شود (بدون بابت SSR).
//
// Task 4 — دو قابلیت تازه:
//  • دکمهٔ «موقعیت فعلی من» (Geolocation API)
//  • تشخیص بارگذاری‌نشدن کاشی‌های نقشه (مثلاً تحریم/فیلترینگ OSM در ایران)
//    و نمایش راهنمای جایگزین (جستجو/کلیک/ورود دستی مختصات)

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Search, Loader2, Crosshair, LocateFixed, WifiOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface MapPickerProps {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  height?: string; // پیش‌فرض 320px
  zoom?: number; // پیش‌فرض 15
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

// tile قابل تعویض — اگر OSM در منطقه کند بود، در deploy قابل تغییر است
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTR = "&copy; OpenStreetMap";

function makePinIcon(L: typeof import("leaflet")) {
  // آیکون SVG داخلی — بدون وابستگی به تصویر خارجی
  return L.divIcon({
    className: "ofogh-map-pin",
    html: `<div style="filter: drop-shadow(0 2px 4px rgba(0,0,0,.35));">
      <svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg">
        <path d="M17 1C9.8 1 4 6.8 4 14c0 9.4 11.1 24.5 11.6 25.1a1.8 1.8 0 0 0 2.8 0C18.9 38.5 30 23.4 30 14c0-7.2-5.8-13-13-13z" fill="#0f766e" stroke="#fff" stroke-width="2"/>
        <circle cx="17" cy="14" r="5" fill="#fff"/>
      </svg>
    </div>`,
    iconSize: [34, 44],
    iconAnchor: [17, 42],
  });
}

export function MapPicker({ lat, lng, onChange, height = "320px", zoom = 15 }: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerRef = useRef<import("leaflet").Marker | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const readyRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  // Task 4 — آیا کاشی‌های نقشه بارگذاری نشدند؟ (OSM در برخی شبکه‌های ایران فیلتر است)
  const [tilesFailed, setTilesFailed] = useState(false);
  const tileErrRef = useRef(0);
  const tileOkRef = useRef(0);
  // آخرین مختصات معتبر برای sync بین پراپ و نقشه
  const lastSyncRef = useRef<string>("");

  // ── init map (یک‌بار) ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;
      const initial: [number, number] =
        typeof lat === "number" && typeof lng === "number" && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
          ? [lat, lng]
          : [35.6892, 51.389]; // پیش‌فرض تهران
      const map = L.map(containerRef.current, {
        center: initial,
        zoom: typeof lat === "number" && typeof lng === "number" ? zoom : 11,
        scrollWheelZoom: true,
        attributionControl: true,
      });
      const tiles = L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(map);
      // Task 4 — تشخیص قطعی کاشی‌ها: چند خطای پیوسته بدون هیچ موفقیت = نقشه فیلتر است
      tiles.on("tileerror", () => {
        tileErrRef.current += 1;
        if (tileErrRef.current >= 6 && tileOkRef.current === 0) setTilesFailed(true);
      });
      tiles.on("tileload", () => {
        tileOkRef.current += 1;
      });
      const marker = L.marker(initial, { icon: makePinIcon(L), draggable: true }).addTo(map);
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        onChange?.(+p.lat.toFixed(6), +p.lng.toFixed(6));
      });
      map.on("click", (e: import("leaflet").LeafletMouseEvent) => {
        marker.setLatLng(e.latlng);
        onChange?.(+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6));
      });
      mapRef.current = map;
      markerRef.current = marker;
      lastSyncRef.current = `${initial[0]},${initial[1]}`;
      readyRef.current = true;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── sync از پراپ (مثلاً بعد از جستجو یا مقدار اولیه دیررس) ──
  useEffect(() => {
    if (!readyRef.current || !mapRef.current || !markerRef.current) return;
    if (typeof lat !== "number" || typeof lng !== "number") return;
    const key = `${lat},${lng}`;
    if (key === lastSyncRef.current) return;
    lastSyncRef.current = key;
    markerRef.current.setLatLng([lat, lng]);
    mapRef.current.setView([lat, lng], Math.max(mapRef.current.getZoom(), zoom));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  // جستجوی آدرس (Nominatim) — اختیاری و debounced دستی با دکمه
  const doSearch = useCallback(async () => {
    const q = searchQ.trim();
    if (!q || searching) return;
    setSearching(true);
    setSearchErr(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=fa&q=${encodeURIComponent(q)}`,
        { headers: { Accept: "application/json" } }
      );
      if (!res.ok) throw new Error("search failed");
      const rows = (await res.json()) as NominatimResult[];
      if (!rows.length) {
        setSearchErr("نتیجه‌ای یافت نشد — عبارت دیگری امتحان کنید یا روی نقشه کلیک کنید.");
        return;
      }
      const la = +rows[0].lat;
      const ln = +rows[0].lon;
      lastSyncRef.current = `${la},${ln}`;
      markerRef.current?.setLatLng([la, ln]);
      mapRef.current?.setView([la, ln], 16);
      onChange?.(+la.toFixed(6), +ln.toFixed(6));
    } catch {
      setSearchErr("جستجو در دسترس نیست — مستقیم روی نقشه کلیک کنید.");
    } finally {
      setSearching(false);
    }
  }, [searchQ, searching, onChange]);

  // بازگشت به موقعیت فعلی مالک
  const recenter = useCallback(() => {
    if (typeof lat === "number" && typeof lng === "number" && mapRef.current) {
      mapRef.current.setView([lat, lng], Math.max(mapRef.current.getZoom(), zoom));
    }
  }, [lat, lng, zoom]);

  // ── Task 4 — موقعیت فعلی من (Geolocation) ──
  const locateMe = useCallback(() => {
    if (locating) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setSearchErr("مرورگر شما موقعیت‌یابی را پشتیبانی نمی‌کند — با جستجو یا کلیک روی نقشه ادامه دهید.");
      return;
    }
    setLocating(true);
    setSearchErr(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const la = +pos.coords.latitude.toFixed(6);
        const ln = +pos.coords.longitude.toFixed(6);
        lastSyncRef.current = `${la},${ln}`;
        markerRef.current?.setLatLng([la, ln]);
        mapRef.current?.setView([la, ln], Math.max(mapRef.current?.getZoom() ?? zoom, 16));
        onChange?.(la, ln);
        setLocating(false);
      },
      () => {
        setLocating(false);
        setSearchErr("دسترسی به موقعیت فعلی ممکن نشد — اجازهٔ موقعیت‌یابی مرورگر را بررسی کنید یا با جستجو/کلیک ادامه دهید.");
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 }
    );
  }, [locating, onChange, zoom]);

  return (
    <div className="space-y-2" dir="rtl">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                doSearch();
              }
            }}
            placeholder="جستجوی آدرس فروشگاه (مثلاً: خیابان ولیعصر تهران)"
            className="pr-8 text-sm"
            aria-label="جستجوی آدرس روی نقشه"
          />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={doSearch} disabled={searching || !searchQ.trim()}>
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          <span className="hidden sm:inline">جستجو</span>
        </Button>
        {/* Task 4 — موقعیت فعلی من */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={locateMe}
          disabled={locating}
          title="باز کردن نقشه روی موقعیت فعلی شما (GPS/Wi-Fi)"
        >
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
          <span className="hidden sm:inline">موقعیت فعلی من</span>
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={recenter} title="بازگشت به مختصات انتخابی">
          <Crosshair className="h-4 w-4" />
        </Button>
      </div>

      <div
        ref={containerRef}
        style={{ height }}
        className="w-full overflow-hidden rounded-xl border border-border bg-muted"
        role="application"
        aria-label="نقشهٔ انتخاب موقعیت — کلیک کنید تا مارکر جابه‌جا شود"
      />

      {/* Task 4 — کاشی‌های نقشه بارگذاری نشد (احتمالاً فیلترینگ OSM) */}
      {tilesFailed ? (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs leading-6 text-amber-800">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            تصاویر نقشه در شبکهٔ شما بارگذاری نشد (سرویس نقشهٔ OSM در برخی شبکه‌ها محدود است). نگران نباشید —{" "}
            <strong>انتخاب موقعیت همچنان کار می‌کند</strong>: با دکمهٔ «موقعیت فعلی من»، جستجوی آدرس یا وارد کردن مختصات در فیلدهای زیر،
            موقعیت مغازه را ثبت کنید؛ نقشه برای مشتریان شما در شبکه‌های باز نمایش داده می‌شود.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5 text-teal-700" />
          {typeof lat === "number" && typeof lng === "number"
            ? `عرض: ${lat} — طول: ${lng}`
            : "روی نقشه کلیک کنید یا مارکر را جابه‌جا کنید تا موقعیت مغازه ثبت شود"}
        </span>
        <span className="opacity-70">کلیک روی نقشه یا درگ مارکر = انتخاب موقعیت</span>
      </div>
      {searchErr ? <p className="text-xs text-destructive">{searchErr}</p> : null}
      {!ready ? (
        <p className="text-xs text-muted-foreground">در حال بارگذاری نقشه…</p>
      ) : null}
    </div>
  );
}

export default MapPicker;
