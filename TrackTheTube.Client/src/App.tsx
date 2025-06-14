import { AmbientLight, PointLight, LightingEffect } from '@deck.gl/core';
import type { MapViewState } from '@deck.gl/core';
import type { MapTheme } from './types/MapTheme';
import TubeMap from './components/TubeMap';

// Source data CSV
const DATA_URL = {
	BUILDINGS: 'https://raw.githubusercontent.com/visgl/deck.gl-data/master/examples/trips/buildings.json',
	TRIPS: 'https://raw.githubusercontent.com/visgl/deck.gl-data/master/examples/trips/trips-v7.json',
};

const ambientLight = new AmbientLight({
	color: [255, 255, 255],
	intensity: 1.0,
});

const pointLight = new PointLight({
	color: [255, 255, 255],
	intensity: 2.0,
	position: [-74.05, 40.7, 8000],
});

const lightingEffect = new LightingEffect({ ambientLight, pointLight });

const DEFAULT_THEME: MapTheme = {
	buildingColor: [74, 80, 87],
	trailColor0: [253, 128, 93],
	trailColor1: [23, 184, 190],
	material: {
		ambient: 0.1,
		diffuse: 0.6,
		shininess: 32,
		specularColor: [60, 64, 70],
	},
	effects: [lightingEffect],
};

const INITIAL_VIEW_STATE: MapViewState = {
	longitude: -74,
	latitude: 40.72,
	zoom: 13,
	pitch: 45,
	bearing: 0,
};

export default function App() {
	return (
		<div
			style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', border: '2px solid orange' }}
		>
			<TubeMap
				theme={DEFAULT_THEME}
				buildings={DATA_URL.BUILDINGS}
				trips={DATA_URL.TRIPS}
				trailLength={180}
				initialViewState={INITIAL_VIEW_STATE}
			/>
		</div>
	);
}
