import { useState, useEffect } from 'react';
import { Map } from 'react-map-gl/maplibre';
import { DeckGL } from '@deck.gl/react';
import { PolygonLayer } from '@deck.gl/layers';
import { TripsLayer } from '@deck.gl/geo-layers';
import { animate } from 'popmotion';
import type { MapViewState } from '@deck.gl/core';
import type { Building } from '../types/Building';
import type { Trip } from '../types/Trip';
import type { MapTheme } from '../types/MapTheme';

export default function TubeMap({
	buildings,
	trips,
	trailLength = 180,
	initialViewState,
	mapStyle = 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json',
	theme,
	loopLength = 1800, // unit corresponds to the timestamp in source data
	animationSpeed = 10,
}: {
	theme: MapTheme;
	buildings?: string | Building[];
	trips?: string | Trip[];
	trailLength?: number;
	loopLength?: number;
	animationSpeed?: number;
	initialViewState?: MapViewState;
	mapStyle?: string;
}) {
	const [time, setTime] = useState(0);

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
		new PolygonLayer<Building>({
			id: 'buildings',
			data: buildings,
			extruded: true,
			wireframe: false,
			opacity: 0.5,
			getPolygon: (f) => f.polygon,
			getElevation: (f) => f.height,
			getFillColor: theme.buildingColor,
			material: theme.material,
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
			<Map reuseMaps mapStyle={mapStyle} />
		</DeckGL>
	);
}
