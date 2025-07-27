import type { Trip } from '../types/Trip';
import type { Position } from '@deck.gl/core';
import type { TubeStationData } from '../types/Tube';
import Fuse from 'fuse.js';

export interface TfLArrival {
	naptanId: string;
	stationName: string;
	destinationNaptanId: string;
	destinationName: string;
	timeToStation: number; // in seconds
	lineId: string;
	vehicleId: string;
}

function normaliseStationName(name: string): string {
  return name
    .replace(/\s+Underground Station$/i, '')  // Remove trailing "Underground Station"
    .replace(/[’']/g, "'")                    // Normalise apostrophes
    .trim();
}

/**
 * Creates Trips from live TfL arrivals and static tube station data.
 */
export function createTripsFromLiveData(
	liveData: TfLArrival[],
	stationData: TubeStationData
): Trip[] {
	// Setup Fuse.js for fuzzy station name matching
	const fuse = new Fuse(stationData.features, {
		keys: ['properties.name'],
		threshold: 0.3,
	});

	const tripsByVehicle = new Map<string, Trip>();

	for (const arrival of liveData) {
        const originName = normaliseStationName(arrival.stationName);
        const destName = normaliseStationName(arrival.destinationName);

		const originMatch = fuse.search(originName)[0];
		const destMatch = fuse.search(destName)[0];

        // console.log(`Processing arrival for vehicle ${arrival.vehicleId} at ${arrival.stationName} towards ${arrival.destinationName}`);
        // console.log(`Origin match: ${originMatch ? originMatch.item.properties.name : 'not found'}`);
        // console.log(`Destination match: ${destMatch ? destMatch.item.properties.name : 'not found'}`);     

		if (!originMatch || !destMatch) continue;

		const originCoord = originMatch.item.geometry.coordinates;
		const destCoord = destMatch.item.geometry.coordinates;

		// Rough time estimate, assuming arrival time is halfway
		const now = 0;
		const arrivalTime = arrival.timeToStation;

		const trip: Trip = {
			vendor: 0,
			path: [originCoord, destCoord] as Position[],
			timestamps: [now, now + arrivalTime],
		};

		tripsByVehicle.set(arrival.vehicleId, trip);
	}
    
    console.log(`Created ${tripsByVehicle.size} trips from live data.`);
    

	return Array.from(tripsByVehicle.values());
}
