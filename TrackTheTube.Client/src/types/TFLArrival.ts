export interface TFLArrival {
  naptanId: string;
  stationName: string;
  destinationNaptanId: string;
  destinationName: string;
  timeToStation: number; //In seconds
  lineId: string;
  vehicleId: string;
}