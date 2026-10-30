import back from '@shared-assets/icons/back.svg';
import next from '@shared-assets/icons/next.svg';
import restart from '@shared-assets/icons/restart.svg';
import play from '@shared-assets/icons/play.svg';
import grid from '@shared-assets/icons/grid.svg';
import lock from '@shared-assets/icons/lock.svg';
import menu from '@shared-assets/icons/menu.svg';
import hint from '@shared-assets/icons/hint.svg';

/** Shared UI icons (white, drawn on canvas). Add new ones to shared/assets/icons and here. */
export const ICON_URLS = { back, next, restart, play, grid, lock, menu, hint } as const;
export type IconName = keyof typeof ICON_URLS;
export type Icons = Record<IconName, HTMLImageElement>;

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.warn('[icons] failed to load', url);
      resolve(img);
    };
    img.src = url;
  });
}

export async function loadIcons(): Promise<Icons> {
  const entries = await Promise.all(
    (Object.keys(ICON_URLS) as IconName[]).map(async (k) => [k, await loadImage(ICON_URLS[k])] as const),
  );
  return Object.fromEntries(entries) as Icons;
}
