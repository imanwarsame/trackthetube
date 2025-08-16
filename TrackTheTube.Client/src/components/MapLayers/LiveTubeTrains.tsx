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
  
  const layer = new ScatterplotLayer<TubePosition>({
    id: 'live-tube-trains',
    data: tubePositions,
    pickable: true,
    opacity: 0.9,
    stroked: true,
    filled: true,
    radiusScale: 1,
    radiusMinPixels,
    radiusMaxPixels,
    lineWidthMinPixels: 2,
    getPosition: (d: TubePosition) => d.position,
    getRadius: 100,
    getFillColor: getColor,
    getLineColor: [255, 255, 255, 255], // White border
    getLineWidth: 1,
    updateTriggers: {
      getPosition: tubePositions,
      getFillColor: tubePositions,
    },
  });

  return layer;
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