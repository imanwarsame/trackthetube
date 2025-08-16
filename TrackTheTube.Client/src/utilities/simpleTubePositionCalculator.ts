import type { Position } from '@deck.gl/core';
import type { TFLArrival } from '../types/TFLArrival';
import { TubePositionCalculator, type TubePosition } from './tubePositionCalculator';

export class SimpleTubePositionCalculator extends TubePositionCalculator {

  private parseLocationInfo(currentLocation: string): {
    type: 'at' | 'between' | 'approaching' | 'leaving';
    station1?: string;
    station2?: string;
  } {
    const location = currentLocation.toLowerCase();

    if (location.includes('at ') || location.includes('at platform')) {
      const match = location.match(/at (?:platform )?(.+?)(?:\s|$)/);
      return {
        type: 'at',
        station1: match ? match[1] : undefined
      };
    }

    if (location.includes('between ') && location.includes(' and ')) {
      const match = location.match(/between (.+?) and (.+?)$/);
      if (match) {
        return {
          type: 'between',
          station1: match[1].trim(),
          station2: match[2].trim()
        };
      }
    }

    if (location.includes('approaching ') || location.includes('near ')) {
      const match = location.match(/(?:approaching|near) (.+?)(?:\s|$)/);
      return {
        type: 'approaching',
        station1: match ? match[1].trim() : undefined
      };
    }

    if (location.includes('leaving ') || location.includes('departing ')) {
      const match = location.match(/(?:leaving|departing) (.+?)(?:\s|$)/);
      return {
        type: 'leaving',
        station1: match ? match[1].trim() : undefined
      };
    }

    return { type: 'at' };
  }

  calculatePositions(arrivals: TFLArrival[]): TubePosition[] {
    const positions: TubePosition[] = [];
    const processedVehicles = new Set<string>();

    // Filter reasonable arrivals
    const validArrivals = arrivals.filter(arrival => 
      arrival.timeToStation > 0 && 
      arrival.timeToStation < 1800 && // Less than 30 minutes
      arrival.vehicleId && 
      arrival.lineId
    );

    for (const arrival of validArrivals) {
      // Skip if we've already processed this vehicle
      if (processedVehicles.has(arrival.vehicleId)) {
        continue;
      }
      processedVehicles.add(arrival.vehicleId);

      const position = this.calculateSinglePosition(arrival);
      if (position) {
        positions.push(position);
      }
    }

    console.log(`Simple calculator: ${positions.length} positions from ${validArrivals.length} arrivals`);
    return positions;
  }

  private calculateSinglePosition(arrival: TFLArrival): TubePosition | null {
    const locationInfo = this.parseLocationInfo(arrival.currentLocation);
    let calculatedPosition: Position | null = null;

    switch (locationInfo.type) {
      case 'at':
        // Train is at a station
        if (locationInfo.station1) {
          calculatedPosition = this.findStationCoordinates(locationInfo.station1);
        }
        if (!calculatedPosition) {
          calculatedPosition = this.findStationCoordinates(arrival.stationName);
        }
        break;

      case 'between':
        // Train is between two stations - this is the key fix
        if (locationInfo.station1 && locationInfo.station2) {
          const pos1 = this.findStationCoordinates(locationInfo.station1);
          const pos2 = this.findStationCoordinates(locationInfo.station2);
          
          if (pos1 && pos2) {
            // Simple progress calculation based on time remaining
            // Assume 2-3 minutes between adjacent stations
            const estimatedJourneyTime = 150; // seconds
            const progress = Math.max(0, Math.min(0.9, 
              (estimatedJourneyTime - arrival.timeToStation) / estimatedJourneyTime
            ));
            
            // Use line-aware interpolation if available, otherwise simple interpolation
            calculatedPosition = this.interpolateAlongLine(pos1, pos2, progress, arrival.lineId);
          }
        }
        break;

      case 'approaching':
        // Train is approaching a station
        if (locationInfo.station1) {
          const stationPos = this.findStationCoordinates(locationInfo.station1);
          if (stationPos) {
            // Place slightly before the station
            const offset = Math.min(0.001, arrival.timeToStation / 120000);
            calculatedPosition = [
              stationPos[0] - offset,
              stationPos[1] - offset
            ];
          }
        }
        break;

      case 'leaving':
        // Train is leaving a station
        if (locationInfo.station1) {
          const stationPos = this.findStationCoordinates(locationInfo.station1);
          if (stationPos) {
            // Place slightly after the station
            calculatedPosition = [
              stationPos[0] + 0.0005,
              stationPos[1] + 0.0005
            ];
          }
        }
        break;

      default:
        // Fallback: use the arrival station
        calculatedPosition = this.findStationCoordinates(arrival.stationName);
        break;
    }

    if (!calculatedPosition) {
      return null;
    }

    return {
      vehicleId: arrival.vehicleId,
      lineId: arrival.lineId,
      position: calculatedPosition,
      direction: arrival.direction,
      nextStation: arrival.stationName,
      timeToNext: arrival.timeToStation,
      currentLocation: arrival.currentLocation
    };
  }
}