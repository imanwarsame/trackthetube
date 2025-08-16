import type { Position } from '@deck.gl/core';
import type { TubeStationData, TubeLineData } from '../types/Tube';
import type { TFLArrival } from '../types/TFLArrival';
import { SimpleTubePositionCalculator } from './simpleTubePositionCalculator';
import type { TubePosition } from './tubePositionCalculator';

export interface AnimatedTubePosition extends TubePosition {
  velocity: Position; // Movement per second
  lastUpdateTime: number;
  targetPosition: Position;
  arrivalTime: number; // When the train should reach the target station
}

export class AnimatedTubePositionCalculator {
  private baseCalculator: SimpleTubePositionCalculator;
  private animatedPositions: Map<string, AnimatedTubePosition> = new Map();
  private lastApiUpdate: number = 0;

  constructor(stationData: TubeStationData, lineData?: TubeLineData) {
    this.baseCalculator = new SimpleTubePositionCalculator(stationData, lineData);
  }

  private calculateVelocity(
    currentPos: Position,
    targetPos: Position,
    timeToTarget: number
  ): Position {
    if (timeToTarget <= 0) {
      return [0, 0];
    }

    const deltaX = targetPos[0] - currentPos[0];
    const deltaY = targetPos[1] - currentPos[1];
    
    // Velocity in degrees per second
    return [deltaX / timeToTarget, deltaY / timeToTarget];
  }

  private interpolatePositionWithMomentum(
    startPos: Position,
    targetPos: Position,
    velocity: Position,
    elapsedTime: number,
    totalTime: number
  ): Position {
    // Use smooth easing to prevent abrupt changes
    const progress = Math.min(1, elapsedTime / totalTime);
    const smoothProgress = this.easeInOutCubic(progress);
    
    // Blend between momentum-based movement and target-based interpolation
    const momentumPos: Position = [
      startPos[0] + velocity[0] * elapsedTime,
      startPos[1] + velocity[1] * elapsedTime
    ];
    
    const directPos: Position = [
      startPos[0] + (targetPos[0] - startPos[0]) * smoothProgress,
      startPos[1] + (targetPos[1] - startPos[1]) * smoothProgress
    ];
    
    // Blend based on how much time has passed (more momentum early, more direct late)
    const momentumWeight = Math.max(0, 1 - progress * 2);
    const directWeight = 1 - momentumWeight;
    
    return [
      momentumPos[0] * momentumWeight + directPos[0] * directWeight,
      momentumPos[1] * momentumWeight + directPos[1] * directWeight
    ];
  }

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  updateFromApiData(arrivals: TFLArrival[]): void {
    const currentTime = Date.now();
    this.lastApiUpdate = currentTime;
    
    // Get fresh positions from the base calculator
    const basePositions = this.baseCalculator.calculatePositions(arrivals);
    
    for (const basePos of basePositions) {
      const existing = this.animatedPositions.get(basePos.vehicleId);
      
      if (existing) {
        // Update existing train with smooth transition
        const newTargetPos = this.findStationCoordinates(basePos.nextStation);
        const velocity = this.calculateVelocity(
          basePos.position, 
          newTargetPos || basePos.position, 
          basePos.timeToNext
        );
        
        // Smooth transition from current animated position to new base position
        const updatedPosition: AnimatedTubePosition = {
          ...basePos,
          velocity,
          lastUpdateTime: currentTime,
          targetPosition: newTargetPos || basePos.position,
          arrivalTime: currentTime + basePos.timeToNext * 1000,
          position: existing.position // Keep current animated position for smooth transition
        };
        
        this.animatedPositions.set(basePos.vehicleId, updatedPosition);
      } else {
        // New train - initialize with current position
        const targetPos = this.findStationCoordinates(basePos.nextStation);
        const velocity = this.calculateVelocity(
          basePos.position,
          targetPos || basePos.position,
          basePos.timeToNext
        );
        
        const newPosition: AnimatedTubePosition = {
          ...basePos,
          velocity,
          lastUpdateTime: currentTime,
          targetPosition: targetPos || basePos.position,
          arrivalTime: currentTime + basePos.timeToNext * 1000
        };
        
        this.animatedPositions.set(basePos.vehicleId, newPosition);
      }
    }
    
    // Remove trains that are no longer in the API data
    const currentVehicleIds = new Set(basePositions.map(p => p.vehicleId));
    for (const [vehicleId] of this.animatedPositions) {
      if (!currentVehicleIds.has(vehicleId)) {
        this.animatedPositions.delete(vehicleId);
      }
    }
  }

  getCurrentAnimatedPositions(): TubePosition[] {
    const currentTime = Date.now();
    const positions: TubePosition[] = [];
    
    for (const [vehicleId, animatedPos] of this.animatedPositions) {
      const elapsedSinceUpdate = (currentTime - animatedPos.lastUpdateTime) / 1000; // seconds
      const totalTimeToTarget = animatedPos.timeToNext;
      
      // Calculate current animated position
      let currentPosition = animatedPos.position;
      
      if (elapsedSinceUpdate > 0 && totalTimeToTarget > 0) {
        currentPosition = this.interpolatePositionWithMomentum(
          animatedPos.position,
          animatedPos.targetPosition,
          animatedPos.velocity,
          elapsedSinceUpdate,
          totalTimeToTarget
        );
      }
      
      // Update remaining time
      const remainingTime = Math.max(0, animatedPos.timeToNext - elapsedSinceUpdate);
      
      positions.push({
        vehicleId,
        lineId: animatedPos.lineId,
        position: currentPosition,
        direction: animatedPos.direction,
        nextStation: animatedPos.nextStation,
        timeToNext: remainingTime,
        currentLocation: animatedPos.currentLocation
      });
    }
    
    return positions;
  }

  private findStationCoordinates(stationName: string): Position | null {
    return this.baseCalculator.findStationCoordinates(stationName);
  }


  getTimeSinceLastUpdate(): number {
    return this.lastApiUpdate > 0 ? (Date.now() - this.lastApiUpdate) / 1000 : 0;
  }
}