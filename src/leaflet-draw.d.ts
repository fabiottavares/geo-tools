import 'leaflet'

declare module 'leaflet' {
  namespace GeometryUtil {
    function geodesicArea(latLngs: LatLng[]): number
  }
}