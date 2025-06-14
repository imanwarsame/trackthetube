import type { Color, Material } from '@deck.gl/core';
import { LightingEffect } from '@deck.gl/core';

export interface MapTheme {
	buildingColor: Color;
	trailColor0: Color;
	trailColor1: Color;
	material: Material;
	effects: [LightingEffect];
}