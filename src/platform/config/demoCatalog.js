const ROOT="https://images.unsplash.com/";
const photo=(id)=>ROOT+id+"?auto=format&fit=crop&w=800&q=80";
const DEMOS={
 "editorial-fashion":[["Colección esencial","photo-1539109136881-3be0616acf4b"],["Estilo de temporada","photo-1525507119028-ed4c629a60a3"],["Detalles de autor","photo-1483985988355-763728e1935b"]],
 "market-fresh":[["Selección fresca","photo-1542838132-92c53300491e"],["Sabores de temporada","photo-1606787366850-de6330128bfc"],["Cesta gourmet","photo-1604908176997-431019ba0b9f"]],
 "beauty-luxe":[["Cuidado esencial","photo-1596462502278-27bfdc403348"],["Ritual diario","photo-1620916566398-39f1143ab7be"],["Bienestar natural","photo-1608248543803-ba4f8c70ae0b"]],
 "tech-grid":[["Tecnología para crear","photo-1498049794561-7780e7231661"],["Diseño inteligente","photo-1517336714731-489689fd1ca8"],["Audio y experiencia","photo-1505740420928-5e560c06d30e"]],
 "interior-catalog":[["Espacios con calma","photo-1600210492486-724fe5c67fb0"],["Diseño para vivir","photo-1555041469-a586c61ea9bc"],["Piezas atemporales","photo-1600566753190-17f0baa2a6c3"]],
 "playful-pets":[["Compañeros felices","photo-1583511655857-d19b40a7a54e"],["Su mejor momento","photo-1517849845537-4d257902454a"],["Amigos de casa","photo-1544568100-847a948585b9"]],
 "service-booking":[["El espacio de trabajo","photo-1497366811353-6870744d04b2"],["Nuestro estudio","photo-1497366754035-f200968a6e72"],["Experiencias profesionales","photo-1600607687939-ce8a6c25118c"]],
 "premium-organic":[["Naturaleza seleccionada","photo-1416879595882-3373a0480b5b"],["Verde atemporal","photo-1485955900006-10f4d324d411"],["Pequeños mundos","photo-1459156212016-c812468e2115"]]
};
export function demoCatalogForTemplate(template){return (DEMOS[template]||DEMOS["editorial-fashion"]).map(([name,id])=>({name,image:photo(id)}))}
