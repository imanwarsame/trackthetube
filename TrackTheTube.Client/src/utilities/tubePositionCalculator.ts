import type { Position } from '@deck.gl/core';
import type { TubeStationData, TubeLineData } from '../types/Tube';
import type { TFLArrival } from '../types/TFLArrival';
import Fuse from 'fuse.js';
import type { Feature, LineString } from 'geojson';

function normaliseStationName(name: string): string {
  return name
    .replace(/\s+Underground Station$/i, '')
    .replace(/\s+Station$/i, '')
    .replace(/['']/g, "'")
    .replace(/&/g, 'and')
    .trim();
}

export interface TubePosition {
  vehicleId: string;
  lineId: string;
  position: Position;
  direction: string;
  nextStation: string;
  timeToNext: number;
  currentLocation: string;
}

export class TubePositionCalculator {
  private stationLookup: Map<string, { coordinates: Position; name: string }> = new Map();
  private lineGeometry: Map<string, Feature<LineString>[]> = new Map();
  private fuse: Fuse<any>;

  constructor(stationData: TubeStationData, lineData?: TubeLineData) {
    this.fuse = new Fuse(stationData.features, {
      keys: ['properties.name'],
      threshold: 0.3,
    });

    // Build station lookup for fast access
    stationData.features.forEach(feature => {
      const name = normaliseStationName(feature.properties.name);
      this.stationLookup.set(name.toLowerCase(), {
        coordinates: feature.geometry.coordinates as Position,
        name: feature.properties.name
      });
    });

    // Build line geometry lookup if provided
    if (lineData) {
      lineData.features.forEach(feature => {
        if (feature.geometry.type === 'LineString' && feature.properties?.lines?.[0]?.name) {
          const lineName = feature.properties.lines[0].name.toLowerCase();
          if (!this.lineGeometry.has(lineName)) {
            this.lineGeometry.set(lineName, []);
          }
          this.lineGeometry.get(lineName)!.push(feature as Feature<LineString>);
        }
      });
    }
  }

  public findStationCoordinates(stationName: string): Position | null {
    const normalised = normaliseStationName(stationName).toLowerCase();
    const direct = this.stationLookup.get(normalised);
    
    if (direct) {
      return direct.coordinates;
    }

    // Fallback to fuzzy search
    const match = this.fuse.search(stationName)[0];
    return match ? match.item.geometry.coordinates as Position : null;
  }

  private parseCurrentLocation(currentLocation: string): {
    type: 'at' | 'between' | 'approaching' | 'leaving';
    station1?: string;
    station2?: string;
  } {
    const location = currentLocation.toLowerCase();

    if (location.startsWith('at ')) {
      return {
        type: 'at',
        station1: currentLocation.substring(3)
      };
    }

    if (location.includes('between ') && location.includes(' and ')) {
      const match = location.match(/between (.+?) and (.+?)$/);
      if (match) {
        return {
          type: 'between',
          station1: match[1],
          station2: match[2]
        };
      }
    }

    if (location.startsWith('approaching ')) {
      return {
        type: 'approaching',
        station1: currentLocation.substring(12)
      };
    }

    if (location.startsWith('leaving ')) {
      return {
        type: 'leaving',
        station1: currentLocation.substring(8)
      };
    }

    return { type: 'at', station1: currentLocation };
  }

  private distance(pos1: Position, pos2: Position): number {
    const dx = pos1[0] - pos2[0];
    const dy = pos1[1] - pos2[1];
    return Math.sqrt(dx * dx + dy * dy);
  }


  private findBestLineSegment(
    station1: Position,
    station2: Position,
    lineFeatures: Feature<LineString>[]
  ): { line: Feature<LineString>; station1Index: number; station2Index: number } | null {
    let bestResult: { line: Feature<LineString>; station1Index: number; station2Index: number; score: number } | null = null;


    for (const lineFeature of lineFeatures) {
      const coords = lineFeature.geometry.coordinates as Position[];
      
      // Find closest points on this line segment
      let station1Index = 0;
      let station2Index = 0;
      let minDist1 = Infinity;
      let minDist2 = Infinity;

      for (let i = 0; i < coords.length; i++) {
        const dist1 = this.distance(station1, coords[i]);
        const dist2 = this.distance(station2, coords[i]);
        
        if (dist1 < minDist1) {
          minDist1 = dist1;
          station1Index = i;
        }
        if (dist2 < minDist2) {
          minDist2 = dist2;
          station2Index = i;
        }
      }

      // Ensure correct order
      if (station1Index > station2Index) {
        [station1Index, station2Index] = [station2Index, station1Index];
      }

      // Calculate a score based on:
      // 1. How close the stations are to the line
      // 2. Whether the stations are in a reasonable sequence on the line
      // 3. The distance between the station indices (closer = better for direct routes)
      const maxDistance = Math.max(minDist1, minDist2);
      const indexDistance = Math.abs(station2Index - station1Index);
      const sequenceBonus = indexDistance > 0 && indexDistance < coords.length * 0.5 ? 1 : 0.5;
      
      // Lower score is better
      const score = maxDistance + (indexDistance / coords.length) * 0.1 - sequenceBonus;

      if (!bestResult || score < bestResult.score) {
        bestResult = {
          line: lineFeature,
          station1Index,
          station2Index,
          score
        };
      }
    }

    return bestResult ? { 
      line: bestResult.line, 
      station1Index: bestResult.station1Index, 
      station2Index: bestResult.station2Index 
    } : null;
  }

  protected interpolateAlongLine(
    station1: Position,
    station2: Position,
    progress: number,
    lineId: string
  ): Position {
    const clampedProgress = Math.max(0, Math.min(1, progress));
    
    // Get line geometry for this tube line
    const lineFeatures = this.lineGeometry.get(lineId.toLowerCase());
    
    if (!lineFeatures || lineFeatures.length === 0) {
      // Fallback to simple interpolation if no line geometry available
      return [
        station1[0] + (station2[0] - station1[0]) * clampedProgress,
        station1[1] + (station2[1] - station2[1]) * clampedProgress
      ];
    }

    // Use improved line segment selection
    const bestSegment = this.findBestLineSegment(station1, station2, lineFeatures);
    
    if (!bestSegment) {
      // Fallback to simple interpolation
      return [
        station1[0] + (station2[0] - station1[0]) * clampedProgress,
        station1[1] + (station2[1] - station2[1]) * clampedProgress
      ];
    }

    const lineCoords = bestSegment.line.geometry.coordinates as Position[];
    const { station1Index, station2Index } = bestSegment;

    // Interpolate along the line between the two station indices
    const segmentLength = station2Index - station1Index;
    if (segmentLength === 0) {
      return lineCoords[station1Index];
    }

    const targetIndex = station1Index + Math.floor(segmentLength * clampedProgress);
    const remainder = (segmentLength * clampedProgress) % 1;

    if (targetIndex >= lineCoords.length - 1 || targetIndex >= station2Index) {
      return lineCoords[Math.min(station2Index, lineCoords.length - 1)];
    }

    // Interpolate between the two nearest points on the line
    const point1 = lineCoords[targetIndex];
    const point2 = lineCoords[Math.min(targetIndex + 1, lineCoords.length - 1)];

    return [
      point1[0] + (point2[0] - point1[0]) * remainder,
      point1[1] + (point2[1] - point1[1]) * remainder
    ];
  }


  private calculatePositionBetweenStations(
    station1Name: string,
    station2Name: string,
    timeToNext: number,
    _direction: string,
    lineId: string
  ): Position | null {
    const pos1 = this.findStationCoordinates(station1Name);
    const pos2 = this.findStationCoordinates(station2Name);

    if (!pos1 || !pos2) {
      return null;
    }

    // Estimate total journey time between stations (rough average: 2-3 minutes)
    const estimatedJourneyTime = 150; // seconds
    const remainingTime = Math.max(0, timeToNext);
    
    // Calculate progress (0 = at station1, 1 = at station2)
    let progress = Math.max(0, (estimatedJourneyTime - remainingTime) / estimatedJourneyTime);
    
    // Ensure we don't go beyond the destination
    progress = Math.min(0.9, progress); // Cap at 90% to avoid reaching the station too early

    // Use line-aware interpolation if we have line geometry data
    return this.interpolateAlongLine(pos1, pos2, progress, lineId);
  }

  calculatePositions(arrivals: TFLArrival[]): TubePosition[] {
    const positions: TubePosition[] = [];
    const processedVehicles = new Set<string>();

    for (const arrival of arrivals) {
      // Skip if we've already processed this vehicle
      if (processedVehicles.has(arrival.vehicleId)) {
        continue;
      }
      processedVehicles.add(arrival.vehicleId);

      const locationInfo = this.parseCurrentLocation(arrival.currentLocation);
      let calculatedPosition: Position | null = null;

      switch (locationInfo.type) {
        case 'at':
          if (locationInfo.station1) {
            calculatedPosition = this.findStationCoordinates(locationInfo.station1);
          }
          break;

        case 'between':
          if (locationInfo.station1 && locationInfo.station2) {
            calculatedPosition = this.calculatePositionBetweenStations(
              locationInfo.station1,
              locationInfo.station2,
              arrival.timeToStation,
              arrival.direction,
              arrival.lineId
            );
          }
          break;

        case 'approaching':
          if (locationInfo.station1) {
            // Train is approaching the station, position it very close
            const stationPos = this.findStationCoordinates(locationInfo.station1);
            if (stationPos) {
              // Place train slightly before the station based on time remaining
              const offset = Math.min(0.001, arrival.timeToStation / 60000); // Small offset
              calculatedPosition = [
                stationPos[0] - offset,
                stationPos[1] - offset
              ];
            }
          }
          break;

        case 'leaving':
          if (locationInfo.station1) {
            // Train is leaving the station, position it slightly after
            const stationPos = this.findStationCoordinates(locationInfo.station1);
            if (stationPos) {
              const offset = 0.0005; // Small offset after station
              calculatedPosition = [
                stationPos[0] + offset,
                stationPos[1] + offset
              ];
            }
          }
          break;
      }

      // Fallback: if we couldn't calculate position from currentLocation,
      // use the station the train is arriving at
      if (!calculatedPosition) {
        calculatedPosition = this.findStationCoordinates(arrival.stationName);
      }

      if (calculatedPosition) {
        positions.push({
          vehicleId: arrival.vehicleId,
          lineId: arrival.lineId,
          position: calculatedPosition,
          direction: arrival.direction,
          nextStation: arrival.stationName,
          timeToNext: arrival.timeToStation,
          currentLocation: arrival.currentLocation
        });
      }
    }

    return positions;
  }
}