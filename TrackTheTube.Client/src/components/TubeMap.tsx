import { useState, useEffect, useRef } from 'react';
import { Map } from 'react-map-gl/maplibre';
import { DeckGL } from '@deck.gl/react';
import { TripsLayer } from '@deck.gl/geo-layers';
import { animate } from 'popmotion';
import type { MapViewState } from '@deck.gl/core';
import type { MapRef } from 'react-map-gl/maplibre';
import type { Trip } from '../types/Trip';
import type { MapTheme } from '../types/MapTheme';

export default function TubeMap({
	trips,
	trailLength = 180,
	initialViewState,
	mapStyle = `https://api.maptiler.com/maps/streets-v2/style.json?key=${import.meta.env.VITE_MAPTILER_API_KEY}`, // Use streets style like the working example
	theme,
	loopLength = 1800, // unit corresponds to the timestamp in source data
	animationSpeed = 10,
}: {
	theme: MapTheme;
	trips?: string | Trip[];
	trailLength?: number;
	loopLength?: number;
	animationSpeed?: number;
	initialViewState?: MapViewState;
	mapStyle?: string;
}) {
	const [time, setTime] = useState(0);
	const mapRef = useRef<MapRef>(null);

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

	// Add 3D buildings layer when map loads - matching the working MapTiler SDK example
	useEffect(() => {
		const map = mapRef.current?.getMap();
		if (!map) return;

		const addBuildingsLayer = () => {
			console.log('Map loaded, checking for 3D buildings...');

			// Check if the layer already exists
			if (map.getLayer('3d-buildings')) {
				console.log('Buildings layer already exists');
				return;
			}

			try {
				// Find label layer to insert buildings beneath (exactly like the working example)
				const layers = map.getStyle().layers;
				let labelLayerId;
				for (let i = 0; i < layers.length; i++) {
					if (layers[i].type === 'symbol' && layers[i].layout?.['text-field']) {
						labelLayerId = layers[i].id;
						break;
					}
				}

				console.log('Label layer ID:', labelLayerId);
				console.log('Available sources:', Object.keys(map.getStyle().sources || {}));

				// Check if openmaptiles source exists (it should in the streets style)
				const hasOpenMapTiles = map.getSource('openmaptiles');
				console.log('Has openmaptiles source:', !!hasOpenMapTiles);

				if (!hasOpenMapTiles) {
					console.error(
						'openmaptiles source not found in style. Available sources:',
						Object.keys(map.getStyle().sources || {})
					);
					return;
				}

				// Add the 3D buildings layer (exactly matching the working MapTiler SDK example)
				const buildingLayer = {
					id: '3d-buildings',
					source: 'openmaptiles',
					'source-layer': 'building',
					filter: ['==', 'extrude', 'true'], // This is the key filter from the working example!
					type: 'fill-extrusion' as const,
					minzoom: 15,
					paint: {
						'fill-extrusion-color': '#aaa',
						// Use an 'interpolate' expression to add a smooth transition effect to the
						// buildings as the user zooms in (exactly like the working example)
						'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.05, ['get', 'height']],
						'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.05, ['get', 'min_height']],
						'fill-extrusion-opacity': 0.6,
					},
				};

				// Add layer, placing it before label layers
				if (labelLayerId) {
					map.addLayer(buildingLayer, labelLayerId);
					console.log('Added buildings layer before labels');
				} else {
					map.addLayer(buildingLayer);
					console.log('Added buildings layer at top');
				}

				console.log('3D buildings layer added successfully');
				console.log('Current zoom:', map.getZoom());
				console.log('Current pitch:', map.getPitch());
			} catch (error) {
				console.error('Error adding buildings layer:', error);
			}
		};

		// Wait for map to be fully loaded
		map.on('load', addBuildingsLayer);

		// Cleanup
		return () => {
			map.off('load', addBuildingsLayer);
		};
	}, [mapStyle]);

	const layers = [
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
		>
			<Map
				ref={mapRef}
				reuseMaps
				mapStyle={mapStyle}
				// Enable antialiasing like the working example
				canvasContextAttributes={{ antialias: true }}
			/>
		</DeckGL>
	);
}
