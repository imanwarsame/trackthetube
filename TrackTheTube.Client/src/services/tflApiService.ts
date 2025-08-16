import type { TFLArrival } from '../types/TFLArrival';

export class TfLApiService {
  private static readonly BASE_URL = 'https://api.tfl.gov.uk';
  
  static async getArrivalsForLine(lineId: string): Promise<TFLArrival[]> {
    try {
      const response = await fetch(`${this.BASE_URL}/Line/${lineId}/Arrivals`);
      
      if (!response.ok) {
        throw new Error(`TfL API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      return data as TFLArrival[];
    } catch (error) {
      console.error(`Failed to fetch arrivals for line ${lineId}:`, error);
      return [];
    }
  }

  static async getArrivalsForVehicle(vehicleId: string): Promise<TFLArrival[]> {
    try {
      const response = await fetch(`${this.BASE_URL}/Vehicle/${vehicleId}/Arrivals`);
      
      if (!response.ok) {
        throw new Error(`TfL API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      return data as TFLArrival[];
    } catch (error) {
      console.error(`Failed to fetch arrivals for vehicle ${vehicleId}:`, error);
      return [];
    }
  }
  
  static async getArrivalsForMultipleLines(lineIds: string[]): Promise<TFLArrival[]> {
    try {
      const lineParam = lineIds.join(',');
      const response = await fetch(`${this.BASE_URL}/Line/${lineParam}/Arrivals`);
      
      if (!response.ok) {
        throw new Error(`TfL API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      return data as TFLArrival[];
    } catch (error) {
      console.error(`Failed to fetch arrivals for lines ${lineIds.join(', ')}:`, error);
      return [];
    }
  }
  
  static async getAllTubeArrivals(): Promise<TFLArrival[]> {
    const tubeLines = [
      'bakerloo',
      'central', 
      'circle',
      'district',
      'hammersmith-city',
      'jubilee',
      'metropolitan',
      'northern',
      'piccadilly',
      'victoria',
      'waterloo-city'
    ];
    
    return this.getArrivalsForMultipleLines(tubeLines);
  }

  static async getDetailedArrivalsForLines(lineIds: string[]): Promise<TFLArrival[]> {
    try {
      // First, get all arrivals to find vehicle IDs
      const lineArrivals = await this.getArrivalsForMultipleLines(lineIds);
      
      // Extract unique vehicle IDs
      const vehicleIds = Array.from(new Set(lineArrivals.map(arrival => arrival.vehicleId)));
      
      console.log(`Found ${vehicleIds.length} unique vehicles, fetching detailed data...`);
      
      // Limit to reasonable number to avoid API rate limits
      const limitedVehicleIds = vehicleIds.slice(0, 50);
      
      // Fetch detailed data for each vehicle in parallel (with some batching)
      const batchSize = 10;
      const allDetailedArrivals: TFLArrival[] = [];
      
      for (let i = 0; i < limitedVehicleIds.length; i += batchSize) {
        const batch = limitedVehicleIds.slice(i, i + batchSize);
        const batchPromises = batch.map(vehicleId => this.getArrivalsForVehicle(vehicleId));
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach(result => {
          if (result.status === 'fulfilled') {
            allDetailedArrivals.push(...result.value);
          }
        });
        
        // Small delay between batches to be nice to the API
        if (i + batchSize < limitedVehicleIds.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      console.log(`Retrieved detailed data for ${allDetailedArrivals.length} arrivals`);
      return allDetailedArrivals;
      
    } catch (error) {
      console.error('Failed to fetch detailed arrivals:', error);
      // Fallback to regular line endpoint
      return this.getArrivalsForMultipleLines(lineIds);
    }
  }
}