/**
 * NASA GIBS (Global Imagery Browse Services) raster layers used as map
 * overlays. Free, no key. Tiles are plain WMTS PNGs, so Leaflet can use them
 * directly. Colours come from NASA's own colour maps and cannot be recoloured,
 * so each layer ships with NASA's legend.
 *
 * Layer names, matrix sets and legends were read from GIBS's WMTS
 * GetCapabilities, and each layer was probed for recent, non-blank tiles.
 * NOTE: GIBS returns a valid but blank tile for a date with no data, so
 * "the request succeeded" does not mean "there is data" — `lagDays` is the
 * measured freshness, and the date picker lets a user step back further.
 */
export interface GibsLayer {
  id: string
  label: string
  /** What the layer helps you see. */
  purpose: string
  layer: string
  matrixSet: string
  /** Deepest zoom GIBS has real tiles for; Leaflet upscales beyond it. */
  maxNativeZoom: number
  /** Typical days behind today that data is available. */
  lagDays: number
  /** Time-invariant hazard maps (NASA SEDAC) have no date in their tile URL. */
  static?: boolean
  group: 'live' | 'prone'
  legend: string
  source: string
}

export const GIBS_LAYERS: GibsLayer[] = [
  {
    group: 'live',
    id: 'lst-day',
    label: 'Land temperature, day',
    purpose: 'Hot zones: how hot the ground surface got in the daytime pass.',
    layer: 'MODIS_Terra_Land_Surface_Temp_Day',
    matrixSet: 'GoogleMapsCompatible_Level7',
    maxNativeZoom: 7,
    lagDays: 2,
    legend: 'MODIS_Land_Surface_Temp_H.svg',
    source: 'NASA MODIS Terra',
  },
  {
    group: 'live',
    id: 'lst-night',
    label: 'Land temperature, night',
    purpose: 'Cold zones: how cold the ground surface got overnight.',
    layer: 'MODIS_Terra_Land_Surface_Temp_Night',
    matrixSet: 'GoogleMapsCompatible_Level7',
    maxNativeZoom: 7,
    lagDays: 2,
    legend: 'MODIS_Land_Surface_Temp_H.svg',
    source: 'NASA MODIS Terra',
  },
  {
    group: 'live',
    id: 'rain',
    label: 'Rainfall rate',
    purpose: 'Flood-prone zones: where heavy rain has been falling.',
    layer: 'IMERG_Precipitation_Rate',
    matrixSet: 'GoogleMapsCompatible_Level6',
    maxNativeZoom: 6,
    lagDays: 5,
    legend: 'GPM_Precipitation_Rate_H.svg',
    source: 'NASA GPM IMERG',
  },
  {
    group: 'live',
    id: 'soil',
    label: 'Soil moisture',
    purpose: 'Drought stress: dry soil (root zone) is an early sign of drought and crop stress.',
    layer: 'SMAP_L4_Analyzed_Root_Zone_Soil_Moisture',
    matrixSet: 'GoogleMapsCompatible_Level6',
    maxNativeZoom: 6,
    lagDays: 5,
    legend: 'SMAP_Analyzed_Soil_Moisture_H.svg',
    source: 'NASA SMAP',
  },
  ...(
    [
      ['drought', 'Drought-prone zones', 'Where drought has historically been most frequent (1980-2000).', 'NDH_Drought_Hazard_Frequency_Distribution_1980-2000'],
      ['flood', 'Flood-prone zones', 'Where flooding has historically been most frequent (1985-2003).', 'NDH_Flood_Hazard_Frequency_Distribution_1985-2003'],
      ['cyclone', 'Cyclone-prone zones', 'Where tropical cyclones have historically been most frequent (1980-2000).', 'NDH_Cyclone_Hazard_Frequency_Distribution_1980-2000'],
      ['landslide', 'Landslide-prone zones', 'Where landslide hazard is highest (2000 estimate).', 'NDH_Landslide_Hazard_Distribution_2000'],
    ] as const
  ).map(
    ([id, label, purpose, layer]): GibsLayer => ({
      id, label, purpose, layer,
      group: 'prone', static: true, lagDays: 0,
      matrixSet: 'GoogleMapsCompatible_Level7',
      maxNativeZoom: 7,
      legend: `${layer}_H.svg`,
      source: 'NASA SEDAC Natural Disaster Hotspots',
    }),
  ),
]

export const gibsTileUrl = (l: GibsLayer, date: string) =>
  l.static
    ? `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${l.layer}/default/${l.matrixSet}/{z}/{y}/{x}.png`
    : `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${l.layer}/default/${date}/${l.matrixSet}/{z}/{y}/{x}.png`

export const gibsLegendUrl = (l: GibsLayer) => `https://gibs.earthdata.nasa.gov/legends/${l.legend}`

export const isoDaysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
