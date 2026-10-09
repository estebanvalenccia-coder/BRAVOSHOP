export const HERO_MIN_HEIGHT=300;
export const HERO_MAX_HEIGHT=900;
export function boundHeroHeight(value,fallback=440){
 const n=Number(value);
 if(!Number.isFinite(n))return fallback;
 return Math.round(Math.max(HERO_MIN_HEIGHT,Math.min(HERO_MAX_HEIGHT,n)));
}
