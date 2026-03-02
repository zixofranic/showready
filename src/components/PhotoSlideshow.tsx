"use client";

import { useState, useEffect, useRef } from "react";

interface PhotoSlideshowProps {
  photos: string[];
  interval?: number;
  className?: string;
}

export function PhotoSlideshow({
  photos,
  interval = 5000,
  className = "",
}: PhotoSlideshowProps) {
  const [current, setCurrent] = useState(0);
  const [loaded, setLoaded] = useState<Set<number>>(new Set([0]));
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Preload next image
  useEffect(() => {
    if (photos.length <= 1) return;
    const next = (current + 1) % photos.length;
    if (!loaded.has(next)) {
      const img = new Image();
      img.src = photos[next];
      img.onload = () => setLoaded((prev) => new Set(prev).add(next));
    }
  }, [current, photos, loaded]);

  // Auto-advance
  useEffect(() => {
    if (photos.length <= 1) return;
    timerRef.current = setInterval(() => {
      setCurrent((prev) => (prev + 1) % photos.length);
    }, interval);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [photos.length, interval]);

  if (photos.length === 0) return null;

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {photos.map((url, i) => (
        <img
          key={url}
          src={url}
          alt=""
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out ${
            i === current ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
    </div>
  );
}
