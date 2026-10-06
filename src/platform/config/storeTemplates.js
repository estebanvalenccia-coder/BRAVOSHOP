export const STORE_TEMPLATES=[
{id:"premium-organic",name:"Premium",sector:"Plantas · hogar · marcas visuales",tier:"premium",description:"Editorial, cálida y muy visual. Portada fotográfica, colecciones, destacados e historia de marca.",defaults:{primary_color:"#315b42",font_style:"editorial",hero_layout:"split",card_style:"soft",header_style:"floating"}},
{id:"editorial-fashion",name:"Editorial",sector:"Moda · accesorios",tier:"standard",description:"Portada de campaña, colecciones visuales y catálogo con aire de revista.",defaults:{primary_color:"#171717",font_style:"editorial",hero_layout:"fullscreen",card_style:"minimal",header_style:"clean"}},
{id:"market-fresh",name:"Mercado",sector:"Alimentación · gourmet",tier:"standard",description:"Categorías rápidas, ofertas y compra ágil para catálogos amplios.",defaults:{primary_color:"#8d2b1f",font_style:"friendly",hero_layout:"market",card_style:"compact",header_style:"search"}},
{id:"beauty-luxe",name:"Luxe",sector:"Belleza · cosmética",tier:"standard",description:"Minimalista, elegante y centrada en producto, rituales y marca.",defaults:{primary_color:"#8e5553",font_style:"editorial",hero_layout:"split",card_style:"luxe",header_style:"clean"}},
{id:"tech-grid",name:"Tech",sector:"Tecnología · electrónica",tier:"standard",description:"Oscura, modular y preparada para especificaciones y comparativas.",defaults:{primary_color:"#4b55ff",font_style:"modern",hero_layout:"tech",card_style:"tech",header_style:"dark"}},
{id:"interior-catalog",name:"Interior",sector:"Hogar · decoración",tier:"standard",description:"Inspiración por ambientes y catálogo visual para hogar y decoración.",defaults:{primary_color:"#76583e",font_style:"editorial",hero_layout:"split",card_style:"soft",header_style:"clean"}},
{id:"playful-pets",name:"Playful",sector:"Mascotas",tier:"standard",description:"Cercana, alegre y pensada para categorías por mascota y compra recurrente.",defaults:{primary_color:"#d98722",font_style:"friendly",hero_layout:"playful",card_style:"rounded",header_style:"clean"}},
{id:"service-booking",name:"Servicios",sector:"Servicios · profesionales",tier:"standard",description:"Presenta profesionales, servicios y llamadas a reserva sin forzar un catálogo tradicional.",defaults:{primary_color:"#1766c2",font_style:"modern",hero_layout:"service",card_style:"service",header_style:"clean"}}
];
export const DEFAULT_SECTIONS=[
{id:"hero",type:"hero",label:"Portada",visible:true},
{id:"benefits",type:"benefits",label:"Ventajas",visible:true},
{id:"categories",type:"categories",label:"Categorías",visible:true},
{id:"featured",type:"products",label:"Productos destacados",visible:true},
{id:"story",type:"story",label:"Historia / editorial",visible:true},
{id:"newsletter",type:"newsletter",label:"Newsletter / cierre",visible:true}
];
export function getTemplate(id){return STORE_TEMPLATES.find(x=>x.id===id)||STORE_TEMPLATES[0]}
export function normalizeTheme(theme={}){const t=getTemplate(theme.template);return{...t.defaults,...theme,template:t.id,sections:Array.isArray(theme.sections)&&theme.sections.length?theme.sections:DEFAULT_SECTIONS}}
