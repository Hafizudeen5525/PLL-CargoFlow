
// A simple coordinate system mapping common logistics hubs to 0-100% X/Y positions on a Miller-like projection
// 0,0 is top-left. 100,100 is bottom-right.

export interface GeoPoint {
    x: number;
    y: number;
    region: string;
}

const PORT_LOCATIONS: Record<string, GeoPoint> = {
    // North America
    'us gulf': { x: 25, y: 40, region: 'North America' },
    'houston': { x: 25, y: 40, region: 'North America' },
    'sabine': { x: 26, y: 40, region: 'North America' },
    'cameron': { x: 25, y: 40, region: 'North America' },
    'corpus christi': { x: 24, y: 41, region: 'North America' },
    'cove point': { x: 29, y: 37, region: 'North America' },
    'new york': { x: 30, y: 36, region: 'North America' },
    'boston': { x: 31, y: 35, region: 'North America' },
    'canada': { x: 20, y: 25, region: 'North America' },
    
    // Europe (North Sea)
    'north sea': { x: 49, y: 28, region: 'Europe' },
    'uk': { x: 48, y: 28, region: 'Europe' },
    'nbp': { x: 48, y: 28, region: 'Europe' },
    'rotterdam': { x: 50, y: 29, region: 'Europe' },
    'ttf': { x: 50, y: 29, region: 'Europe' },
    'zeebrugge': { x: 49, y: 29, region: 'Europe' },
    'dunkirk': { x: 49, y: 30, region: 'Europe' },
    'spain': { x: 47, y: 35, region: 'Europe' },
    'barcelona': { x: 48, y: 35, region: 'Europe' },
    'france': { x: 48, y: 32, region: 'Europe' },
    
    // Middle East
    'qatar': { x: 62, y: 42, region: 'Middle East' },
    'ras laffan': { x: 62, y: 42, region: 'Middle East' },
    'oman': { x: 63, y: 44, region: 'Middle East' },
    'dubai': { x: 63, y: 43, region: 'Middle East' },
    'jebel ali': { x: 63, y: 43, region: 'Middle East' },
    'kuwait': { x: 61, y: 41, region: 'Middle East' },
    
    // Asia
    'japan': { x: 88, y: 38, region: 'Asia' },
    'tokyo': { x: 89, y: 38, region: 'Asia' },
    'jkm': { x: 85, y: 38, region: 'Asia' },
    'korea': { x: 84, y: 38, region: 'Asia' },
    'incheon': { x: 84, y: 38, region: 'Asia' },
    'china': { x: 80, y: 40, region: 'Asia' },
    'shanghai': { x: 82, y: 42, region: 'Asia' },
    'beijing': { x: 80, y: 38, region: 'Asia' },
    'taiwan': { x: 82, y: 45, region: 'Asia' },
    'india': { x: 68, y: 45, region: 'Asia' },
    'dahej': { x: 67, y: 44, region: 'Asia' },
    'singapore': { x: 78, y: 55, region: 'Asia' },
    'malaysia': { x: 78, y: 54, region: 'Asia' },
    
    // Oceania
    'australia': { x: 90, y: 70, region: 'Oceania' },
    'gladstone': { x: 92, y: 72, region: 'Oceania' },
    'curtis': { x: 92, y: 72, region: 'Oceania' },
    'darwin': { x: 85, y: 65, region: 'Oceania' },
    
    // South America
    'brazil': { x: 35, y: 70, region: 'South America' },
    'argentina': { x: 32, y: 80, region: 'South America' },
    'chile': { x: 28, y: 78, region: 'South America' },
    
    // Africa
    'nigeria': { x: 50, y: 50, region: 'Africa' },
    'egypt': { x: 55, y: 40, region: 'Africa' },
    'algeria': { x: 48, y: 38, region: 'Africa' },
    'angola': { x: 52, y: 65, region: 'Africa' }
};

const DEFAULT_COORD = { x: 50, y: 50, region: 'Unknown' };

export function getCoordinates(locationName: string): GeoPoint {
    if (!locationName) return DEFAULT_COORD;
    
    const lower = locationName.toLowerCase();
    
    // Direct match
    if (PORT_LOCATIONS[lower]) return PORT_LOCATIONS[lower];
    
    // Partial match (e.g. "US Gulf Coast" matches "us gulf")
    const found = Object.keys(PORT_LOCATIONS).find(k => lower.includes(k));
    if (found) return PORT_LOCATIONS[found];
    
    // Fallback based on very rough heuristics if possible, or return default
    return DEFAULT_COORD;
}
