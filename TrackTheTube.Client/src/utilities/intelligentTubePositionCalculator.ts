import type { Position } from '@deck.gl/core';
import type { TubeStationData, TubeLineData } from '../types/Tube';
import type { TFLArrival } from '../types/TFLArrival';
import { TubePositionCalculator, type TubePosition } from './tubePositionCalculator';

interface StationSequence {
  lineId: string;
  stations: string[];
  coordinates: Position[];
}

interface ProcessedArrival {
  arrival: TFLArrival;
  currentStationIndex: number;
  nextStationIndex: number;
  isValid: boolean;
  confidence: number;
}

export class IntelligentTubePositionCalculator extends TubePositionCalculator {
  private stationSequences: Map<string, StationSequence> = new Map();
  private lastApiTimestamps: Map<string, number> = new Map();
  private staleDataThreshold = 60000; // 60 seconds

  constructor(stationData: TubeStationData, lineData?: TubeLineData) {
    super(stationData, lineData);
    this.buildStationSequences(stationData, lineData);
  }

  private buildStationSequences(stationData: TubeStationData, lineData?: TubeLineData): void {
    if (!lineData) return;

    // Build sequences for each line by following the line geometry
    const lineGroups = new Map<string, any[]>();
    
    lineData.features.forEach(feature => {
      if (feature.properties?.lines?.[0]?.name) {
        const lineName = feature.properties.lines[0].name.toLowerCase();
        if (!lineGroups.has(lineName)) {
          lineGroups.set(lineName, []);
        }
        lineGroups.get(lineName)!.push(feature);
      }
    });

    for (const [lineId, features] of lineGroups) {
      this.buildLineSequence(lineId, features, stationData);
    }
  }

  private buildLineSequence(lineId: string, features: any[], stationData: TubeStationData): void {
    // Find stations that belong to this line
    const lineStations = stationData.features.filter(station => 
      station.properties.lines.some((line: any) => 
        line.name.toLowerCase() === lineId
      )
    );

    if (lineStations.length === 0) return;

    // Sort stations along the line using the geometry
    const sortedStations = this.sortStationsAlongLine(lineStations, features);
    
    const sequence: StationSequence = {
      lineId,
      stations: sortedStations.map(s => s.properties.name),
      coordinates: sortedStations.map(s => s.geometry.coordinates as Position)
    };

    this.stationSequences.set(lineId, sequence);
    console.log(`Built sequence for ${lineId}: ${sequence.stations.length} stations`);
  }

  private sortStationsAlongLine(stations: any[], lineFeatures: any[]): any[] {
    if (lineFeatures.length === 0) return stations;

    // Get the main line feature (longest one)
    const mainLine = lineFeatures.reduce((longest, current) => 
      current.geometry.coordinates.length > longest.geometry.coordinates.length ? current : longest
    );

    const lineCoords = mainLine.geometry.coordinates as Position[];
    
    // Calculate each station's position along the line
    const stationsWithDistance = stations.map(station => {
      const stationPos = station.geometry.coordinates as Position;
      
      // Find closest point on line and its index
      let minDistance = Infinity;
      let closestIndex = 0;
      
      lineCoords.forEach((coord, index) => {
        const distance = this.calculateDistance(stationPos, coord);
        if (distance < minDistance) {
          minDistance = distance;
          closestIndex = index;
        }
      });
      
      return {
        station,
        distanceAlongLine: closestIndex,
        distanceFromLine: minDistance
      };
    });

    // Sort by position along the line
    stationsWithDistance.sort((a, b) => a.distanceAlongLine - b.distanceAlongLine);
    
    return stationsWithDistance.map(item => item.station);
  }

  private calculateDistance(pos1: Position, pos2: Position): number {
    const dx = pos1[0] - pos2[0];
    const dy = pos1[1] - pos2[1];
    return Math.sqrt(dx * dx + dy * dy);
  }

  private normalizeStationName(name: string): string {
    return name
      .replace(/\s+Underground Station$/i, '')
      .replace(/\s+Station$/i, '')
      .replace(/['']/g, "'")
      .replace(/&/g, 'and')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private findStationInSequence(stationName: string, lineId: string): number {
    const sequence = this.stationSequences.get(lineId);
    if (!sequence) return -1;

    const normalizedTarget = this.normalizeStationName(stationName);
    
    // Try exact match first
    for (let i = 0; i < sequence.stations.length; i++) {
      if (this.normalizeStationName(sequence.stations[i]) === normalizedTarget) {
        return i;
      }
    }

    // Try partial match
    for (let i = 0; i < sequence.stations.length; i++) {
      const normalizedStation = this.normalizeStationName(sequence.stations[i]);
      if (normalizedStation.includes(normalizedTarget) || normalizedTarget.includes(normalizedStation)) {
        return i;
      }
    }

    return -1;
  }

  private parseLocationToStations(currentLocation: string, stationName: string, _lineId: string): {
    currentStation: string | null;
    nextStation: string | null;
    confidence: number;
  } {
    const location = currentLocation.toLowerCase();
    
    // Enhanced parsing for various TfL formats
    if (location.includes('at ')) {
      const match = location.match(/at (.+)$/);
      return {
        currentStation: match ? match[1] : null,
        nextStation: null,
        confidence: 0.9
      };
    }

    if (location.includes('between ') && location.includes(' and ')) {
      const match = location.match(/between (.+?) and (.+?)$/);
      if (match) {
        return {
          currentStation: match[1],
          nextStation: match[2],
          confidence: 0.95
        };
      }
    }

    if (location.includes('approaching ') || location.includes('near ')) {
      const match = location.match(/(?:approaching|near) (.+)$/);
      return {
        currentStation: null,
        nextStation: match ? match[1] : null,
        confidence: 0.8
      };
    }

    if (location.includes('leaving ') || location.includes('departing ')) {
      const match = location.match(/(?:leaving|departing) (.+)$/);
      return {
        currentStation: match ? match[1] : null,
        nextStation: null,
        confidence: 0.7
      };
    }

    if (location.includes('heading to ')) {
      // This is often the final destination, not the next station
      return {
        currentStation: null,
        nextStation: null,
        confidence: 0.3
      };
    }

    // Fallback: use the station from the arrival data
    return {
      currentStation: null,
      nextStation: stationName,
      confidence: 0.5
    };
  }

  private processArrival(arrival: TFLArrival): ProcessedArrival {
    const locationInfo = this.parseLocationToStations(
      arrival.currentLocation, 
      arrival.stationName, 
      arrival.lineId
    );

    const sequence = this.stationSequences.get(arrival.lineId);
    if (!sequence) {
      return {
        arrival,
        currentStationIndex: -1,
        nextStationIndex: -1,
        isValid: false,
        confidence: 0
      };
    }

    let currentStationIndex = -1;
    let nextStationIndex = -1;

    // Find current station in sequence
    if (locationInfo.currentStation) {
      currentStationIndex = this.findStationInSequence(locationInfo.currentStation, arrival.lineId);
    }

    // Find next station in sequence
    if (locationInfo.nextStation) {
      const foundIndex = this.findStationInSequence(locationInfo.nextStation, arrival.lineId);
      
      // Validate that next station is actually adjacent/close to current
      if (currentStationIndex >= 0) {
        const distance = Math.abs(foundIndex - currentStationIndex);
        if (distance <= 3) { // Allow up to 3 stations gap (some lines have branches)
          nextStationIndex = foundIndex;
        }
      } else {
        nextStationIndex = foundIndex;
      }
    }

    // If we have current but no next, infer next station
    if (currentStationIndex >= 0 && nextStationIndex < 0) {
      // Use arrival direction to determine if going forward or backward on line
      if (arrival.direction === 'inbound' && currentStationIndex < sequence.stations.length - 1) {
        nextStationIndex = currentStationIndex + 1;
      } else if (arrival.direction === 'outbound' && currentStationIndex > 0) {
        nextStationIndex = currentStationIndex - 1;
      }
    }

    // Validate time to station is reasonable (be more lenient)
    const isReasonableTime = arrival.timeToStation <= 1800; // Max 30 minutes to next station

    const isValid = (currentStationIndex >= 0 || nextStationIndex >= 0 || locationInfo.confidence > 0.3) && 
                   isReasonableTime;

    return {
      arrival,
      currentStationIndex,
      nextStationIndex,
      isValid,
      confidence: locationInfo.confidence
    };
  }

  private filterStaleData(arrivals: TFLArrival[]): TFLArrival[] {
    const currentTime = Date.now();
    
    return arrivals.filter(arrival => {
      const arrivalTime = new Date(arrival.timestamp).getTime();
      const lastTimestamp = this.lastApiTimestamps.get(arrival.vehicleId) || 0;
      
      // Filter out data that's older than our threshold or older than previously seen data
      if (currentTime - arrivalTime > this.staleDataThreshold || arrivalTime < lastTimestamp) {
        return false;
      }
      
      this.lastApiTimestamps.set(arrival.vehicleId, arrivalTime);
      return true;
    });
  }

  calculatePositions(arrivals: TFLArrival[]): TubePosition[] {
    // Filter out stale data first
    const freshArrivals = this.filterStaleData(arrivals);
    
    // Process each arrival to validate and enhance it
    const processedArrivals = freshArrivals
      .map(arrival => this.processArrival(arrival))
      .filter(processed => processed.isValid)
      .sort((a, b) => b.confidence - a.confidence); // Sort by confidence

    const positions: TubePosition[] = [];
    const processedVehicles = new Set<string>();

    for (const processed of processedArrivals) {
      if (processedVehicles.has(processed.arrival.vehicleId)) {
        continue;
      }
      processedVehicles.add(processed.arrival.vehicleId);

      let position = this.calculateIntelligentPosition(processed);
      
      // Fallback to basic positioning if intelligent method fails
      if (!position) {
        position = this.calculateBasicPosition(processed.arrival);
      }
      
      if (position) {
        positions.push(position);
      }
    }

    // If we got very few positions, try the fallback approach for all arrivals
    if (positions.length < 5) {
      console.log(`Only ${positions.length} intelligent positions found, adding basic positions...`);
      
      for (const arrival of freshArrivals) {
        if (!processedVehicles.has(arrival.vehicleId)) {
          const basicPosition = this.calculateBasicPosition(arrival);
          if (basicPosition) {
            positions.push(basicPosition);
            processedVehicles.add(arrival.vehicleId);
          }
        }
      }
    }

    console.log(`Calculated ${positions.length} train positions (${processedArrivals.length} intelligent + ${positions.length - processedArrivals.length} basic)`);
    return positions;
  }

  private calculateBasicPosition(arrival: TFLArrival): TubePosition | null {
    // Simple fallback: just use the station position
    const stationPos = this.findStationCoordinates(arrival.stationName);
    
    if (!stationPos) return null;

    return {
      vehicleId: arrival.vehicleId,
      lineId: arrival.lineId,
      position: stationPos,
      direction: arrival.direction,
      nextStation: arrival.stationName,
      timeToNext: arrival.timeToStation,
      currentLocation: arrival.currentLocation
    };
  }

  private calculateIntelligentPosition(processed: ProcessedArrival): TubePosition | null {
    const { arrival, currentStationIndex, nextStationIndex } = processed;
    const sequence = this.stationSequences.get(arrival.lineId);
    
    if (!sequence) return null;

    let calculatedPosition: Position | null = null;

    if (currentStationIndex >= 0 && nextStationIndex >= 0) {
      // Train is between two known stations
      const currentPos = sequence.coordinates[currentStationIndex];
      const nextPos = sequence.coordinates[nextStationIndex];
      
      // Calculate progress based on time (assume 2-3 minute journey between adjacent stations)
      const estimatedJourneyTime = 120; // 2 minutes for adjacent stations
      const progress = Math.max(0, Math.min(0.9, 
        (estimatedJourneyTime - arrival.timeToStation) / estimatedJourneyTime
      ));

      calculatedPosition = this.interpolateAlongLine(
        currentPos, nextPos, progress, arrival.lineId
      );
    } else if (nextStationIndex >= 0) {
      // We only know the next station - place train approaching it
      const nextPos = sequence.coordinates[nextStationIndex];
      
      // Find previous station to interpolate from
      const prevIndex = arrival.direction === 'inbound' ? 
        Math.max(0, nextStationIndex - 1) : 
        Math.min(sequence.coordinates.length - 1, nextStationIndex + 1);
      
      const prevPos = sequence.coordinates[prevIndex];
      const progress = Math.max(0.7, Math.min(0.95, 
        1 - (arrival.timeToStation / 180) // Approaching within 3 minutes
      ));

      calculatedPosition = this.interpolateAlongLine(
        prevPos, nextPos, progress, arrival.lineId
      );
    } else if (currentStationIndex >= 0) {
      // Train is at a known station
      calculatedPosition = sequence.coordinates[currentStationIndex];
    }

    if (!calculatedPosition) return null;

    return {
      vehicleId: arrival.vehicleId,
      lineId: arrival.lineId,
      position: calculatedPosition,
      direction: arrival.direction,
      nextStation: nextStationIndex >= 0 ? sequence.stations[nextStationIndex] : arrival.stationName,
      timeToNext: arrival.timeToStation,
      currentLocation: arrival.currentLocation
    };
  }
}