import type { TubeStationData } from '../types/Tube';

export interface StationLookup {
  [stationName: string]: { lat: number; lon: number };
}

export async function buildStationLookup(): Promise<StationLookup> {
  const lookup: StationLookup = {};

  try {
    const response = await fetch('https://raw.githubusercontent.com/oobrien/vis/master/tubecreature/data/tfl_stations.json');
    const data: TubeStationData = await response.json();

    data.features.forEach(feature => {
      const name = feature.properties.name.trim().toLowerCase();
      const [lon, lat] = feature.geometry.coordinates;
      lookup[name] = { lat, lon };
    });
  } catch (error) {
    console.error('Failed to load tube station data:', error);
  }

  return lookup;
}
