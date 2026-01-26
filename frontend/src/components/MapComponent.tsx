// Re-export the appropriate platform version
// Metro bundler will automatically select .web.tsx or .native.tsx based on platform
import { Platform } from 'react-native';

// Export placeholder types to satisfy TypeScript
export interface Location {
  latitude: number;
  longitude: number;
  address?: string;
}

export interface MapComponentProps {
  pickup?: Location;
  dropoff?: Location;
  driverLocation?: Location;
  routeCoordinates?: { latitude: number; longitude: number }[];
  showTraffic?: boolean;
  onMapReady?: () => void;
  style?: any;
}

// Re-export from platform-specific file
export { MapComponent, MapPlaceholder } from './MapComponent.web';
export default require('./MapComponent.web').default;
