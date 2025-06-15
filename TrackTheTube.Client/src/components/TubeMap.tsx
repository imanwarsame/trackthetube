import { useState, useEffect } from 'react';
import { Map } from 'react-map-gl/maplibre';
import { DeckGL } from '@deck.gl/react';
import { TripsLayer } from '@deck.gl/geo-layers';
import { GeoJsonLayer } from '@deck.gl/layers';
import { animate } from 'popmotion';
import type { MapViewState } from '@deck.gl/core';
import type { Trip } from '../types/Trip';
import type { MapTheme } from '../types/MapTheme';
import type { Feature, Geometry } from 'geojson';
import type { TubeLineData } from '../types/Tube';

export default function TubeMap({
	trips,
	trailLength = 180,
	initialViewState,
	mapStyle = 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json',
	theme,
	loopLength = 1800,
	animationSpeed = 10,
	tubeLineData,
	showTubeLines = true,
}: {
	theme: MapTheme;
	trips?: string | Trip[];
	trailLength?: number;
	loopLength?: number;
	animationSpeed?: number;
	initialViewState?: MapViewState;
	mapStyle?: string;
	tubeLineData?: TubeLineData;
	showTubeLines?: boolean;
}) {
	const [time, setTime] = useState(0);
	const [tubeLines, setTubeLines] = useState<TubeLineData | null>(null);

	useEffect(() => {
		const animation = animate({
			from: 0,
			to: loopLength,
			duration: (loopLength * 60) / animationSpeed,
			repeat: Infinity,
			onUpdate: setTime,
		});
		return () => animation.stop();
	}, [loopLength, animationSpeed]);

	// Load tube line data
	useEffect(() => {
		if (tubeLineData) {
			setTubeLines(tubeLineData);
		} else {
			// Fetch from GitHub if no data provided
			fetch('https://raw.githubusercontent.com/oobrien/vis/master/tubecreature/data/tfl_lines.json')
				.then((response) => response.json())
				.then((data: TubeLineData) => setTubeLines(data))
				.catch((error) => console.error('Failed to load tube line data:', error));
		}
	}, [tubeLineData]);

	// Define line colors for different tube lines
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const getLineColor = (feature: Feature<Geometry, any>): [number, number, number, number] => {
		const lineName = feature.properties?.lines?.[0]?.name || '';

		// TfL official colors (approximate RGB values)
		const lineColors: Record<string, [number, number, number, number]> = {
			'London Overground': [255, 136, 0, 100], // Orange
			Central: [220, 36, 31, 100], // Red
			Piccadilly: [0, 25, 168, 100], // Dark Blue
			Northern: [0, 0, 0, 100], // Black
			Metropolitan: [155, 0, 88, 100], // Magenta
			District: [0, 125, 50, 100], // Green
			Circle: [255, 206, 0, 100], // Yellow
			'Hammersmith & City': [244, 169, 190, 100], // Pink
			Bakerloo: [137, 78, 36, 100], // Brown
			Jubilee: [161, 165, 167, 100], // Grey
			Victoria: [0, 152, 216, 100], // Light Blue
			'Waterloo & City': [147, 206, 186, 100], // Turquoise
			'Elizabeth line': [147, 100, 204, 100], // Purple
			DLR: [0, 175, 173, 100], // Teal
		};

		return lineColors[lineName] || [255, 255, 255, 10]; // Default white
	};

	const layers = [
		// Tube lines layer (rendered first, behind trips)
		...(showTubeLines && tubeLines
			? [
					new GeoJsonLayer({
						id: 'tube-lines',
						data: tubeLines,
						pickable: true,
						stroked: true,
						filled: false,
						lineWidthMinPixels: 8,
						lineWidthMaxPixels: 10,
						getLineColor: getLineColor,
						getLineWidth: 2,
						updateTriggers: {
							getLineColor: [tubeLines],
						},
						// Add some visual polish
						parameters: {
							depthTest: false,
						},
					}),
			  ]
			: []),

		// Animated trips layer (rendered on top)
		new TripsLayer<Trip>({
			id: 'trips',
			data: trips,
			getPath: (d) => d.path,
			getTimestamps: (d) => d.timestamps,
			getColor: (d) => (d.vendor === 0 ? theme.trailColor0 : theme.trailColor1),
			opacity: 0.3,
			widthMinPixels: 2,
			capRounded: true,
			trailLength,
			currentTime: time,
		}),
	];

	return (
		<DeckGL
			layers={layers}
			effects={theme.effects}
			initialViewState={initialViewState}
			controller={true}
			width={window.innerWidth}
			height={window.innerHeight}
			style={{
				position: 'fixed',
				width: '100vw',
				height: '100vh',
				overflow: 'hidden',
			}}
			// Add tooltip for tube lines
			getTooltip={({ object }) => {
				if (object && object.properties && object.properties.lines) {
					const line = object.properties.lines[0];
					return {
						html: `
              <div style="background: rgba(0,0,0,0.8); padding: 8px; border-radius: 4px; color: white;">
                <strong>${line.name}</strong><br/>
                Opened: ${line.opened}<br/>
                Line ID: ${object.properties.id}
              </div>
            `,
						style: {
							fontSize: '12px',
							fontFamily: 'Arial, sans-serif',
						},
					};
				}
				return null;
			}}
		>
			<Map reuseMaps mapStyle={mapStyle} />
		</DeckGL>
	);
}
