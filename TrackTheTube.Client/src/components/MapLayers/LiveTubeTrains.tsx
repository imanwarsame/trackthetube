import { ScatterplotLayer } from '@deck.gl/layers';
import type { TubePosition } from '../../utilities/tubePositionCalculator';

export interface LiveTubeTrainsProps {
  tubePositions: TubePosition[];
  getColor?: (position: TubePosition) => [number, number, number, number];
  radiusMinPixels?: number;
  radiusMaxPixels?: number;
}

export default function LiveTubeTrains({
  tubePositions,
  getColor = getDefaultTrainColor,
  radiusMinPixels = 4,
  radiusMaxPixels = 8
}: LiveTubeTrainsProps) {
  
  // Group by line and create separate layers to avoid z-fighting
  const lineGroups = new Map<string, TubePosition[]>();
  tubePositions.forEach(pos => {
    if (!lineGroups.has(pos.lineId)) {
      lineGroups.set(pos.lineId, []);
    }
    lineGroups.get(pos.lineId)!.push(pos);
  });
  
  const layers: ScatterplotLayer<TubePosition>[] = [];
  let layerIndex = 0;
  
  // Create a separate layer for each tube line to prevent z-fighting
  lineGroups.forEach((positions, lineId) => {
    // Process positions to spread out overlapping trains within this line
    const processedPositions = processOverlappingPositions(positions);
    
    const layer = new ScatterplotLayer<TubePosition>({
      id: `live-tube-trains-${lineId}`,
      data: processedPositions,
      pickable: true,
      opacity: 0.9,
      stroked: true,
      filled: true,
      radiusScale: 1,
      radiusMinPixels,
      radiusMaxPixels,
      lineWidthMinPixels: 2,
      getPosition: (d: TubePosition) => [d.position[0], d.position[1], layerIndex * 0.1], // Small z-offset per line
      getRadius: 100,
      getFillColor: getColor,
      getLineColor: [255, 255, 255, 255], // White border
      getLineWidth: 1,
      updateTriggers: {
        getPosition: positions,
        getFillColor: positions,
      },
    });
    
    layers.push(layer);
    layerIndex++;
  });

  return layers;
}

function processOverlappingPositions(positions: TubePosition[]): TubePosition[] {
  const processed: TubePosition[] = [];
  const positionGroups = new Map<string, TubePosition[]>();
  
  // Group positions by rounded coordinates (to catch near-overlaps)
  positions.forEach(pos => {
    const roundedKey = `${Math.round(pos.position[0] * 10000)},${Math.round(pos.position[1] * 10000)}`;
    if (!positionGroups.has(roundedKey)) {
      positionGroups.set(roundedKey, []);
    }
    positionGroups.get(roundedKey)!.push(pos);
  });
  
  // Apply small offsets to overlapping positions
  positionGroups.forEach(group => {
    if (group.length === 1) {
      // No overlap, use original position
      processed.push(group[0]);
    } else {
      // Multiple trains at same location, spread them out slightly
      group.forEach((pos, index) => {
        const angle = (index / group.length) * 2 * Math.PI;
        const offsetDistance = 0.0002; // Small offset in degrees
        const offsetX = Math.cos(angle) * offsetDistance;
        const offsetY = Math.sin(angle) * offsetDistance;
        
        processed.push({
          ...pos,
          position: [
            pos.position[0] + offsetX,
            pos.position[1] + offsetY
          ]
        });
      });
    }
  });
  
  return processed;
}

function getDefaultTrainColor(position: TubePosition): [number, number, number, number] {
  // TfL official line colors
  const lineColors: Record<string, [number, number, number, number]> = {
    'bakerloo': [137, 78, 36, 255],      // Brown
    'central': [220, 36, 31, 255],       // Red  
    'circle': [255, 206, 0, 255],        // Yellow
    'district': [0, 125, 50, 255],       // Green
    'hammersmith-city': [244, 169, 190, 255], // Pink
    'jubilee': [161, 165, 167, 255],     // Grey
    'metropolitan': [155, 0, 88, 255],   // Magenta
    'northern': [0, 0, 0, 255],          // Black
    'piccadilly': [0, 25, 168, 255],     // Dark Blue
    'victoria': [0, 152, 216, 255],      // Light Blue
    'waterloo-city': [147, 206, 186, 255], // Turquoise
  };

  return lineColors[position.lineId] || [255, 255, 255, 255]; // Default white
}