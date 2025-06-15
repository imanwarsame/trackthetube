/* eslint-disable @typescript-eslint/no-explicit-any */
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
import type { TubeLineData, TubeStationData } from '../types/Tube';

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
	tubeStationData, // Add new prop for station data
	showTubeStations = true, // New prop to control visibility of stations
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
	tubeStationData?: TubeStationData; // Type for the new prop
	showTubeStations?: boolean; // Type for the new prop
}) {
	const [time, setTime] = useState(0);
	const [tubeLines, setTubeLines] = useState<TubeLineData | null>(null);
	const [tubeStations, setTubeStations] = useState<TubeStationData | null>(null); // State for tube station data

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

	// Load tube station data
	useEffect(() => {
		if (tubeStationData) {
			setTubeStations(tubeStationData);
		} else {
			// Fetch from GitHub if no data provided
			fetch('https://raw.githubusercontent.com/oobrien/vis/master/tubecreature/data/tfl_stations.json')
				.then((response) => response.json())
				.then((data: TubeStationData) => setTubeStations(data))
				.catch((error) => console.error('Failed to load tube station data:', error));
		}
	}, [tubeStationData]);

	// Define line colors for different tube lines
	const getLineColor = (feature: Feature<Geometry, any>): [number, number, number, number] => {
		const lineName = feature.properties?.lines?.[0]?.name || '';

		// TfL official colors (approximate RGB values)
		const lineColours: Record<string, [number, number, number, number]> = {
			'London Overground': [255, 136, 0, 100], // Orange
			Central: [220, 36, 31, 100], // Red
			Piccadilly: [0, 25, 168, 100], // Dark Blue
			Northern: [0, 0, 0, 255], // Black
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

		// Increased alpha to 255 for better visibility for line colors
		return lineColours[lineName] || [255, 255, 255, 10]; // Default white
	};

	// Helper function to get line color as an RGB string for text
	const getRgbColourStringForText = (lineName: string): string => {
		// Special case for Northern Line text on a dark background
		if (lineName === 'Northern') {
			return 'rgb(255, 255, 255)'; // White text for Northern Line
		}

		const colour = getLineColor({ properties: { lines: [{ name: lineName }] } } as Feature<Geometry, any>);

		// Use the RGB values directly, ignoring alpha for text color
		return `rgb(${colour[0]}, ${colour[1]}, ${colour[2]})`;
	};

	const layers = [
		// Tube lines border layer (rendered first, behind main lines, trips and stations)
		...(showTubeLines && tubeLines
			? [
					new GeoJsonLayer({
						id: 'tube-lines-border',
						data: tubeLines,
						pickable: false, // Not pickable, as it's just a visual border
						stroked: true,
						filled: false,
						lineWidthMinPixels: 10, // Slightly thicker for the border
						lineWidthMaxPixels: 12,
						getLineColor: (feature: Feature<Geometry, any>) => {
							const lineName = feature.properties?.lines?.[0]?.name || '';
							// Only apply white border to Northern Line
							return lineName === 'Northern' ? [255, 255, 255, 255] : [0, 0, 0, 0]; // Transparent for other lines
						},
						getLineWidth: 2, // Deck.gl scales this, adjust min/max pixels
						parameters: {
							depthTest: false,
						},
					}),
					new GeoJsonLayer({
						id: 'tube-lines-main',
						data: tubeLines,
						pickable: true, // This is the layer that will be pickable for tooltips
						stroked: true,
						filled: false,
						lineWidthMinPixels: 8, // Slightly thinner for the main line color
						lineWidthMaxPixels: 10,
						getLineColor: getLineColor, // Use the original getLineColor for the main color
						getLineWidth: 2, // Deck.gl scales this, adjust min/max pixels
						updateTriggers: {
							getLineColor: [tubeLines],
						},
						parameters: {
							depthTest: false,
						},
					}),
			  ]
			: []),

		// Tube stations layer (rendered above lines, but below trips)
		...(showTubeStations && tubeStations
			? [
					new GeoJsonLayer({
						id: 'tube-stations',
						data: tubeStations,
						pickable: true,
						stroked: true,
						filled: true,
						pointRadiusMinPixels: 4, // Minimum size of the station circles
						pointRadiusMaxPixels: 8, // Maximum size of the station circles
						getFillColor: [255, 255, 255, 120],
						getLineColor: [255, 255, 255, 200],
						getLineWidth: 1,
						lineWidthMinPixels: 1,
						parameters: {
							depthTest: false,
						},
						getPointRadius: 100, // Adjust this value to scale station circles
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
			// Add tooltip for tube lines and stations
			getTooltip={({ object }) => {
				if (object && object.properties) {
					// Tooltip for Tube Lines (now specifically targets 'tube-lines-main' layer)
					// The 'object.layer.id' check is important to distinguish between the two line layers
					if (
						object.layer &&
						object.layer.id === 'tube-lines-main' &&
						object.properties.lines &&
						object.geometry.type !== 'Point'
					) {
						const line = object.properties.lines[0];
						return {
							html: `
              <div style="background: rgba(0,0,0,0.8); padding: 8px; border-radius: 4px; color: white;">
                <strong>${line.name}</strong><br/>
                Opened: ${line.opened || 'N/A'}<br/>
                Line ID: ${object.properties.id}
              </div>
            `,
							style: {
								fontSize: '12px',
								fontFamily: 'Arial, sans-serif',
							},
						};
					}
					// Tooltip for Tube Stations
					if (object.properties.name && object.geometry.type === 'Point') {
						const stationName = object.properties.name;
						const stationLines = object.properties.lines;

						// Generate HTML for lines with their respective colors
						const linesHtml = stationLines
							.map(
								(line: { name: string }) => `
                            <span style="color: ${getRgbColourStringForText(line.name)};">${line.name}</span>
                        `
							)
							.join('<br/>');

						return {
							html: `
              <div style="background: rgba(0,0,0,0.8); padding: 8px; border-radius: 4px; color: white;">
                <strong>${stationName}</strong><br/>
                ${linesHtml}
              </div>
            `,
							style: {
								fontSize: '12px',
								fontFamily: 'Arial, sans-serif',
							},
						};
					}
				}
				return null;
			}}
		>
			<Map reuseMaps mapStyle={mapStyle} />
		</DeckGL>
	);
}
