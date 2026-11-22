// Tile URL templates shared by the maps and the start-screen background (no MapLibre import here).

/** Geoportal orthophoto (GUGiK WMTS, EPSG:3857, free, no key). */
export const ORTO_TILES =
  "https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMTS/StandardResolution?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0" +
  "&LAYER=ORTOFOTOMAPA&STYLE=default&FORMAT=image/jpeg&TILEMATRIXSET=EPSG:3857&TILEMATRIX=EPSG:3857:{z}&TILEROW={y}&TILECOL={x}";
