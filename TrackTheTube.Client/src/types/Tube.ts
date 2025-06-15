export interface TubeLineProperties {
    id: string;
    lines: Array<{
        name: string;
        opened: number;
        start_sid: string;
        end_sid: string;
        otend_sid?: string;
    }>;
}

export interface TubeLineFeature {
    type: 'Feature';
    properties: TubeLineProperties;
    geometry: {
        type: 'LineString';
        coordinates: Array<[number, number]>;
    };
}

export interface TubeLineData {
    type: 'FeatureCollection';
    name: string;
    features: TubeLineFeature[];
}