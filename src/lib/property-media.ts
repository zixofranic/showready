import type { CSSProperties } from "react";

export interface PropertyPhoto {
  url: string;
  is_staged?: boolean;
  staged_url?: string;
}

/** Pick the best property image URL: staged_url > is_staged > first photo > null */
export function getBestPhoto(photos?: PropertyPhoto[] | null): string | null {
  if (!photos || photos.length === 0) return null;

  // Priority 1: photo with a staged_url
  const withStagedUrl = photos.find((p) => p.staged_url);
  if (withStagedUrl) return withStagedUrl.staged_url!;

  // Priority 2: first photo marked as staged
  const staged = photos.find((p) => p.is_staged);
  if (staged) return staged.url;

  // Priority 3: first photo
  return photos[0].url;
}

/** Build a CSS background style — photo or gradient fallback */
export function getBackgroundStyle(
  photoUrl: string | null,
  primaryColor: string,
): CSSProperties {
  if (photoUrl) {
    return {
      backgroundImage: `url(${photoUrl})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  // Gradient fallback using primaryColor
  return {
    background: `linear-gradient(135deg, ${primaryColor}, ${darken(primaryColor, 0.25)})`,
  };
}

/** Darken a hex color by a factor (0-1) */
function darken(hex: string, factor: number): string {
  const c = hex.replace("#", "");
  const r = Math.max(0, Math.round(parseInt(c.slice(0, 2), 16) * (1 - factor)));
  const g = Math.max(0, Math.round(parseInt(c.slice(2, 4), 16) * (1 - factor)));
  const b = Math.max(0, Math.round(parseInt(c.slice(4, 6), 16) * (1 - factor)));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}
