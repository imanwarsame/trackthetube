import type { Trip } from '../types/Trip';
import type { Position } from '@deck.gl/core';
import type { TubeStationData, TubeLineData } from '../types/Tube';
import type { TFLArrival } from '../types/TFLArrival';
import { TubePositionCalculator } from './tubePositionCalculator';

/**
 * Creates Trips from live TfL arrivals and static tube station data.
 * Now uses realistic positioning based on currentLocation data.
 */
export function createTripsFromLiveData(
	liveData: TFLArrival[],
	stationData: TubeStationData,
	lineData?: TubeLineData
): Trip[] {
	const calculator = new TubePositionCalculator(stationData, lineData);
	const tubePositions = calculator.calculatePositions(liveData);
	
	const trips: Trip[] = [];
	
	for (const position of tubePositions) {
		// Create a very short trip representing the current position
		// The train appears as a moving dot at its calculated position
		const currentPos = position.position;
		
		// Create a minimal movement for animation purposes
		const offset = 0.0001;
		const endPos: Position = [
			currentPos[0] + offset,
			currentPos[1] + offset
		];
		
		const trip: Trip = {
			vendor: position.lineId === 'victoria' ? 0 : 1, // Different colors for different lines
			path: [currentPos, endPos],
			timestamps: [0, position.timeToNext], // Use actual time to next station
		};
		
		trips.push(trip);
	}
	
	console.log(`Created ${trips.length} realistic tube positions from live data.`);
	return trips;
}
