"use client";

// ─── v20: نقشهٔ تعاملی نمایشی (فوتر فروشگاه و هرجای عمومی) ───
// برخلاف iframe ایستا: زوم واقعی، درگ، اسکرول و کلیک لینک مسیر.
// lazy: leaflet فقط هنگام نزدیک‌شدن به دیدرس (IntersectionObserver) لود می‌شود.

import { useEffect, useRef, useState } from "react";
import { MapPin, Navigation } from "lucide-react";

export interface InteractiveMapProps {
  lat: number;
  lng: number;
  title?: string; // نام فروشگاه روی مارکر/پنجره
  address?: string; // آدرس در پنجرهٔ مارکر
  height?: string; // پیش‌فرض 240px
  zoom?: number; // پیش‌فرض 15
  showRouteLink?: boolean; // دکمه «مسیریابی» به OSM
  className?: string;
}

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTR = "&copy; OpenStreetMap";

export function InteractiveMap({
  lat,
  lng,
  title,
  address,
  height = "240px",
  zoom = 15,
  showRouteLink = true,
  className,
}: InteractiveMapProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const [inView, setInView] = useState(false);
  const [ready, setReady] = useState(false);

  // لود فقط وقتی نزدیک دیدرس است (کمک بزرگی به پرفورمنس موبایل)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // ساخت نقشه بعد از ورود به دیدرس
  useEffect(() => {
    if (!inView || !containerRef.current || mapRef.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, {
        center: [lat, lng],
        zoom,
        scrollWheelZoom: true,
        attributionControl: true,
      });
      L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(map);
      const icon = L.divIcon({
        className: "ofogh-map-pin",
        html: `<div style="filter: drop-shadow(0 2px 4px rgba(0,0,0,.35));">
          <svg width="30" height="39" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg">
            <path d="M17 1C9.8 1 4 6.8 4 14c0 9.4 11.1 24.5 11.6 25.1a1.8 1.8 0 0 0 2.8 0C18.9 38.5 30 23.4 30 14c0-7.2-5.8-13-13-13z" fill="#0f766e" stroke="#fff" stroke-width="2"/>
            <circle cx="17" cy="14" r="5" fill="#fff"/>
          </svg>
        </div>`,
        iconSize: [30, 39],
        iconAnchor: [15, 37],
      });
      const popupHtml = `
        <div dir="rtl" style="text-align:right;font-family:inherit;min-width:140px">
          ${title ? `<div style="font-weight:700;font-size:13px">${title}</div>` : ""}
          ${address ? `<div style="font-size:11px;color:#555;margin-top:2px">${address}</div>` : ""}
        </div>`;
      L.marker([lat, lng], { icon }).addTo(map).bindPopup(popupHtml);
      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, lat, lng]);

  // اگر مختصات عوض شد (تنظیمات مالک)، نقشه جابه‌جا شود
  useEffect(() => {
    if (mapRef.current) mapRef.current.setView([lat, lng], zoom);
  }, [lat, lng, zoom]);

  const routeUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;

  return (
    <div ref={wrapRef} className={className}>
      <div
        ref={containerRef}
        style={{ height }}
        className="w-full overflow-hidden rounded-xl border border-border bg-muted"
        role="application"
        aria-label={title ? `نقشهٔ موقعیت ${title}` : "نقشهٔ موقعیت فروشگاه"}
      />
      {showRouteLink ? (
        <a
          href={routeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-xs text-teal-700 hover:text-teal-800 hover:underline dark:text-teal-400"
        >
          <Navigation className="h-3.5 w-3.5" />
          نمایش مسیر رسیدن به فروشگاه
          <MapPin className="h-3.5 w-3.5 opacity-60" />
        </a>
      ) : null}
      {!ready ? (
        <p className="mt-1 text-[11px] text-muted-foreground">نقشه با اسکرول بارگذاری می‌شود…</p>
      ) : null}
    </div>
  );
}

export default InteractiveMap;
