// 16 host cities + stadiums for FIFA WC 2026
export type Stadium = {
  id: string
  city: string
  country: 'USA' | 'MEX' | 'CAN'
  name: string
  capacity: number
  matches: number
  lat: number
  lng: number
}

export const stadiums: Stadium[] = [
  { id: 'atl', city: 'Atlanta', country: 'USA', name: 'Mercedes-Benz Stadium', capacity: 71000, matches: 8, lat: 33.7553, lng: -84.4006 },
  { id: 'bos', city: 'Boston', country: 'USA', name: 'Gillette Stadium', capacity: 65878, matches: 7, lat: 42.0909, lng: -71.2643 },
  { id: 'dal', city: 'Dallas', country: 'USA', name: 'AT&T Stadium', capacity: 80000, matches: 9, lat: 32.7473, lng: -97.0945 },
  { id: 'gdl', city: 'Guadalajara', country: 'MEX', name: 'Estadio Akron', capacity: 48071, matches: 4, lat: 20.6815, lng: -103.4626 },
  { id: 'hou', city: 'Houston', country: 'USA', name: 'NRG Stadium', capacity: 72220, matches: 7, lat: 29.6847, lng: -95.4107 },
  { id: 'kan', city: 'Kansas City', country: 'USA', name: 'Arrowhead Stadium', capacity: 76416, matches: 6, lat: 39.0489, lng: -94.4839 },
  { id: 'lax', city: 'Los Angeles', country: 'USA', name: 'SoFi Stadium', capacity: 70240, matches: 8, lat: 33.9535, lng: -118.3392 },
  { id: 'mex', city: 'Mexico City', country: 'MEX', name: 'Estadio Azteca', capacity: 87000, matches: 5, lat: 19.3027, lng: -99.1505 },
  { id: 'mia', city: 'Miami', country: 'USA', name: 'Hard Rock Stadium', capacity: 65326, matches: 7, lat: 25.9580, lng: -80.2389 },
  { id: 'mty', city: 'Monterrey', country: 'MEX', name: 'Estadio BBVA', capacity: 53500, matches: 4, lat: 25.6692, lng: -100.2444 },
  { id: 'nyc', city: 'New York / NJ', country: 'USA', name: 'MetLife Stadium', capacity: 82500, matches: 8, lat: 40.8128, lng: -74.0742 },
  { id: 'phi', city: 'Philadelphia', country: 'USA', name: 'Lincoln Financial Field', capacity: 67594, matches: 6, lat: 39.9008, lng: -75.1675 },
  { id: 'sfo', city: 'San Francisco Bay', country: 'USA', name: "Levi's Stadium", capacity: 68500, matches: 6, lat: 37.4031, lng: -121.9697 },
  { id: 'sea', city: 'Seattle', country: 'USA', name: 'Lumen Field', capacity: 68740, matches: 6, lat: 47.5952, lng: -122.3316 },
  { id: 'tor', city: 'Toronto', country: 'CAN', name: 'BMO Field', capacity: 45000, matches: 6, lat: 43.6332, lng: -79.4185 },
  { id: 'van', city: 'Vancouver', country: 'CAN', name: 'BC Place', capacity: 54500, matches: 7, lat: 49.2767, lng: -123.1119 },
]
