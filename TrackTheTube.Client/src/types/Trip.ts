import type { Position } from '@deck.gl/core';

export interface Trip {
    vendor: number;
    path: Position[];
    timestamps: number[];
}