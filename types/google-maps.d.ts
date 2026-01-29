declare global {
  interface Window {
    google: typeof google;
    initGooglePlaces: () => void;
  }
}

declare namespace google {
  namespace maps {
    class Map {
      constructor(mapDiv: Element, opts?: MapOptions);
      setCenter(latlng: LatLng | LatLngLiteral): void;
      setZoom(zoom: number): void;
      fitBounds(bounds: LatLngBounds, padding?: number | Padding): void;
      addListener(eventName: string, handler: (event?: MapMouseEvent) => void): void;
    }

    interface MapOptions {
      center?: LatLng | LatLngLiteral;
      zoom?: number;
      mapTypeControl?: boolean;
      streetViewControl?: boolean;
      fullscreenControl?: boolean;
      zoomControl?: boolean;
      gestureHandling?: string;
    }

    interface MapMouseEvent {
      latLng?: LatLng;
    }

    interface LatLngLiteral {
      lat: number;
      lng: number;
    }

    class LatLng {
      constructor(lat: number, lng: number);
      lat(): number;
      lng(): number;
    }

    class LatLngBounds {
      constructor();
      extend(point: LatLng | LatLngLiteral): LatLngBounds;
    }

    interface Padding {
      top: number;
      right: number;
      bottom: number;
      left: number;
    }

    class Marker {
      constructor(opts?: MarkerOptions);
      setPosition(latlng: LatLng | LatLngLiteral): void;
      getPosition(): LatLng | undefined;
      addListener(eventName: string, handler: () => void): void;
    }

    interface MarkerOptions {
      position?: LatLng | LatLngLiteral;
      map?: Map;
      draggable?: boolean;
      title?: string;
      icon?: string | Icon;
    }

    interface Icon {
      url: string;
      scaledSize?: Size;
    }

    class Size {
      constructor(width: number, height: number);
    }

    class Geocoder {
      constructor();
      geocode(request: GeocoderRequest, callback: (results: GeocoderResult[] | null, status: GeocoderStatus) => void): void;
    }

    interface GeocoderRequest {
      location?: LatLng | LatLngLiteral;
      address?: string;
    }

    interface GeocoderResult {
      formatted_address: string;
      address_components: GeocoderAddressComponent[];
      geometry: GeocoderGeometry;
    }

    interface GeocoderGeometry {
      location: LatLng;
    }

    enum GeocoderStatus {
      OK = 'OK',
      ZERO_RESULTS = 'ZERO_RESULTS',
      OVER_QUERY_LIMIT = 'OVER_QUERY_LIMIT',
      REQUEST_DENIED = 'REQUEST_DENIED',
      INVALID_REQUEST = 'INVALID_REQUEST',
      UNKNOWN_ERROR = 'UNKNOWN_ERROR'
    }

    namespace places {
      class Autocomplete {
        constructor(inputField: HTMLInputElement, opts?: AutocompleteOptions);
        addListener(eventName: string, handler: () => void): void;
        getPlace(): PlaceResult;
      }

      interface AutocompleteOptions {
        types?: string[];
        componentRestrictions?: ComponentRestrictions;
        fields?: string[];
      }

      interface ComponentRestrictions {
        country?: string | string[];
      }

      interface PlaceResult {
        formatted_address?: string;
        address_components?: GeocoderAddressComponent[];
        geometry?: PlaceGeometry;
        place_id?: string;
      }

      interface PlaceGeometry {
        location?: LatLng;
      }
    }

    interface GeocoderAddressComponent {
      long_name: string;
      short_name: string;
      types: string[];
    }

    namespace event {
      function clearInstanceListeners(instance: any): void;
    }
  }
}

export {};