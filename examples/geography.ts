export const graticule: GeoJSON.FeatureCollection<GeoJSON.LineString> = { type: 'FeatureCollection', features: [] };
for (let lat = -60; lat <= 60; lat += 30) graticule.features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: Array.from({ length: 73 }, (_, i) => [-180 + i * 5, lat]) } });
for (let lng = -180; lng <= 180; lng += 30) graticule.features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[lng, -85], [lng, 85]] } });
export const style = () => ({ version: 8 as const, sources: { grid: { type: 'geojson' as const, data: graticule } }, layers: [
  { id: 'background', type: 'background' as const, paint: { 'background-color': '#c4d8da' } },
  { id: 'grid', type: 'line' as const, source: 'grid', paint: { 'line-color': '#77989d', 'line-width': 1 } },
] });
