export interface TFLArrival {
  id: string;
  naptanId: string;
  stationName: string;
  destinationNaptanId: string;
  destinationName: string;
  timeToStation: number; //In seconds
  lineId: string;
  lineName: string;
  vehicleId: string;
  currentLocation: string;
  direction: string;
  towards: string;
  timestamp: string;
  expectedArrival: string;
}