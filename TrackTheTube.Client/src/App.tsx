import { AmbientLight, PointLight, LightingEffect } from '@deck.gl/core';
import type { MapViewState } from '@deck.gl/core';
import type { MapTheme } from './types/MapTheme';
import TubeMap from './components/TubeMap';
import { useState, useEffect } from 'react';
import type { Trip } from './types/Trip';
import { createTripsFromLiveData } from './utilities/createTripsFromLiveData';
import type { TubeStationData, TubeLineData } from './types/Tube';
import { buildStationLookup } from './utilities/buildStationLookup';
import { TfLApiService } from './services/tflApiService';
import { AnimatedTubePositionCalculator } from './utilities/animatedTubePositionCalculator';
import type { TubePosition } from './utilities/tubePositionCalculator';

// // Source data CSV
// const DATA_URL = {
// 	TRIPS: 'https://raw.githubusercontent.com/visgl/deck.gl-data/master/examples/trips/trips-v7.json',
// };

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
	longitude: -0.1278,
	latitude: 51.5074,
	zoom: 13,
	pitch: 45,
	bearing: 0,
};

export default function App() {
	const [trips, setTrips] = useState<Trip[]>([]);
	const [tubePositions, setTubePositions] = useState<TubePosition[]>([]);
	const [stationData, setStationData] = useState<TubeStationData | null>(null);
	const [lineData, setLineData] = useState<TubeLineData | null>(null);
	const [animatedCalculator, setAnimatedCalculator] = useState<AnimatedTubePositionCalculator | null>(null);

	useEffect(() => {
		// Load station and line data once at startup
		async function loadMapData() {
			try {
				const [stationDataResponse, lineDataResponse] = await Promise.all([
					fetch('https://raw.githubusercontent.com/oobrien/vis/master/tubecreature/data/tfl_stations.json'),
					fetch('https://raw.githubusercontent.com/oobrien/vis/master/tubecreature/data/tfl_lines.json')
				]);
				
				const stationData: TubeStationData = await stationDataResponse.json();
				const lineData: TubeLineData = await lineDataResponse.json();
				
				setStationData(stationData);
				setLineData(lineData);
				
				// Create animated calculator
				const calculator = new AnimatedTubePositionCalculator(stationData, lineData);
				setAnimatedCalculator(calculator);
				
				const stationLookup = await buildStationLookup();
				console.log(`Station lookup built:`, stationLookup);
			} catch (error) {
				console.error('Failed to load map data:', error);
			}
		}
		
		loadMapData();
	}, []);

	// Fetch live data every 30 seconds
	useEffect(() => {
		if (!animatedCalculator) return;

		async function fetchLiveData() {
			try {
				// Fetch data for multiple lines to show more trains
				const liveArrivals = await TfLApiService.getArrivalsForMultipleLines([
					'victoria', 'central', 'northern', 'piccadilly', 'jubilee'
				]);

				// Update the animated calculator with fresh API data
				animatedCalculator!.updateFromApiData(liveArrivals);

				// Also create trips for the animation layer (optional)
				const trips = createTripsFromLiveData(liveArrivals, stationData!, lineData!);
				setTrips(trips);

				console.log(`Updated API data for ${liveArrivals.length} arrivals`);
			} catch (error) {
				console.error('Failed to fetch live data:', error);
			}
		}

		fetchLiveData(); // Initial fetch
		const interval = setInterval(fetchLiveData, 30000); // update every 30s

		return () => clearInterval(interval);
	}, [animatedCalculator, stationData, lineData]);

	// Update animated positions every frame
	useEffect(() => {
		if (!animatedCalculator) return;

		let animationFrame: number;

		function updateAnimatedPositions() {
			const currentPositions = animatedCalculator!.getCurrentAnimatedPositions();
			setTubePositions(currentPositions);
			
			animationFrame = requestAnimationFrame(updateAnimatedPositions);
		}

		updateAnimatedPositions();

		return () => {
			if (animationFrame) {
				cancelAnimationFrame(animationFrame);
			}
		};
	}, [animatedCalculator]);

	return (
		<div
			style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', border: '2px solid orange' }}
		>
			<TubeMap 
				theme={DEFAULT_THEME} 
				trips={trips} 
				tubePositions={tubePositions}
				trailLength={180} 
				initialViewState={INITIAL_VIEW_STATE} 
			/>
		</div>
	);
}
