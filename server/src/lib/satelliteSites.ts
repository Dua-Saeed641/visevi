/**
 * Hazard-relevant sites used for satellite monitoring and the bulk demo seed.
 * Project names are deliberately neutral ("<place> Satellite Watch"): the
 * verification layer treats a project's name as a claim about its media.
 */
export interface SatelliteSite {
  name: string
  project: string
  lat: number
  lng: number
  /** Half the side of the square snapshot, in degrees (0.5 is about 55 km). */
  half: number
  /** Max % of near-white pixels before an image counts as cloudy. Snow and salt flats are white. Default 20. */
  maxWhite?: number
}

export const SATELLITE_SITES: SatelliteSite[] = [
  { name: 'Kutch, Gujarat', project: 'Kutch Satellite Watch', lat: 23.75, lng: 70.0, half: 0.6, maxWhite: 45 },
  { name: 'Delhi NCR', project: 'Delhi NCR Satellite Watch', lat: 28.6, lng: 77.2, half: 0.4 },
  { name: 'Nagpur, Maharashtra', project: 'Nagpur Satellite Watch', lat: 21.15, lng: 79.09, half: 0.6 },
  { name: 'Chennai coast, Tamil Nadu', project: 'Chennai Satellite Watch', lat: 13.08, lng: 80.27, half: 0.5 },
  { name: 'Puri coast, Odisha', project: 'Puri Satellite Watch', lat: 19.8, lng: 85.83, half: 0.6 },
  { name: 'Mumbai coast, Maharashtra', project: 'Mumbai Satellite Watch', lat: 19.07, lng: 72.87, half: 0.4 },
  { name: 'Alappuzha, Kerala', project: 'Alappuzha Satellite Watch', lat: 9.5, lng: 76.35, half: 0.5 },
  { name: 'Majuli, Assam', project: 'Majuli Satellite Watch', lat: 26.95, lng: 94.17, half: 0.6 },
  { name: 'Chamoli, Uttarakhand', project: 'Chamoli Satellite Watch', lat: 30.4, lng: 79.3, half: 0.6, maxWhite: 60 },
  { name: 'Leh, Ladakh', project: 'Leh Satellite Watch', lat: 34.16, lng: 77.58, half: 0.6, maxWhite: 70 },
  { name: 'Wayanad, Kerala', project: 'Wayanad Satellite Watch', lat: 11.6, lng: 76.1, half: 0.4 },
  { name: 'Lake Urmia, Iran', project: 'Lake Urmia Satellite Watch', lat: 37.65, lng: 45.4, half: 0.7, maxWhite: 40 },
  { name: 'Lake Mead, USA', project: 'Lake Mead Satellite Watch', lat: 36.15, lng: -114.4, half: 0.5 },
]
