import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BACKEND_URL } from '@/src/services/api';

interface Prediction {
  place_id: string;
  description: string;
  structured_formatting?: {
    main_text?: string;
    secondary_text?: string;
  };
  main_text?: string;
  secondary_text?: string;
}

const AUTOCOMPLETE_DEBOUNCE_MS = 400;
const AUTOCOMPLETE_MIN_CHARS = 3;
const PREDICTION_CACHE_MAX = 48;

function newPlacesSessionToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

const normalizePrediction = (p: any, index: number): Prediction => {
  const mainText = p?.structured_formatting?.main_text || p?.main_text || '';
  const secondaryText = p?.structured_formatting?.secondary_text || p?.secondary_text || '';
  const description =
    typeof p?.description === 'string' && p.description.trim().length > 0
      ? p.description
      : [mainText, secondaryText].filter(Boolean).join(', ');
  const placeId =
    (typeof p?.place_id === 'string' && p.place_id) ||
    (typeof p?.placeId === 'string' && p.placeId) ||
    `prediction-${index}-${description || 'unknown'}`;
  return {
    ...p,
    place_id: placeId,
    description: description || 'Selected location',
    structured_formatting: {
      main_text: mainText || description || 'Location',
      secondary_text: secondaryText || '',
    },
    main_text: mainText || description || 'Location',
    secondary_text: secondaryText || '',
  };
};

export interface LocationAutocompleteSelection {
  description: string;
  placeId: string;
  sessionToken?: string;
}

interface LocationAutocompleteProps {
  value: string;
  onChangeText: (text: string) => void;
  onPlaceSelected: (place: LocationAutocompleteSelection) => void;
  placeholder?: string;
  /** @deprecated Unused — autocomplete uses BACKEND_URL /api/places. Kept for call-site compatibility. */
  apiKey?: string;
  countryCode?: string;
  /** Bias suggestions toward rider GPS / pickup (Places API `location` + `radius`). Max radius 50km. */
  biasLat?: number;
  biasLng?: number;
  biasRadiusM?: number;
  style?: any;
  inputStyle?: any;
  placeholderTextColor?: string;
}

export default function LocationAutocomplete({
  value,
  onChangeText,
  onPlaceSelected,
  placeholder = 'Enter location',
  apiKey: _apiKey,
  countryCode = 'ng',
  biasLat,
  biasLng,
  biasRadiusM = 45000,
  style,
  inputStyle,
  placeholderTextColor = '#A0A0A0',
}: LocationAutocompleteProps) {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const activeRequestIdRef = useRef(0);
  const sessionTokenRef = useRef<string | null>(null);
  const predictionCacheRef = useRef<Map<string, Prediction[]>>(new Map());

  const buildCacheKey = useCallback(
    (input: string) => {
      const bias =
        typeof biasLat === 'number' &&
        typeof biasLng === 'number' &&
        Number.isFinite(biasLat) &&
        Number.isFinite(biasLng)
          ? `${biasLat.toFixed(4)},${biasLng.toFixed(4)}:${Math.min(Math.max(5000, Math.round(biasRadiusM ?? 45000)), 50000)}`
          : 'no-bias';
      return `${countryCode}|${bias}|${input.trim().toLowerCase()}`;
    },
    [biasLat, biasLng, biasRadiusM, countryCode],
  );

  const ensureSessionToken = useCallback(() => {
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = newPlacesSessionToken();
    }
    return sessionTokenRef.current;
  }, []);

  const discardSessionToken = useCallback(() => {
    sessionTokenRef.current = null;
  }, []);

  const readCachedPredictions = useCallback(
    (input: string): Prediction[] | null => {
      const cached = predictionCacheRef.current.get(buildCacheKey(input));
      return cached && cached.length > 0 ? cached : null;
    },
    [buildCacheKey],
  );

  const storeCachedPredictions = useCallback(
    (input: string, items: Prediction[]) => {
      const key = buildCacheKey(input);
      const cache = predictionCacheRef.current;
      if (cache.has(key)) cache.delete(key);
      cache.set(key, items);
      while (cache.size > PREDICTION_CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest == null) break;
        cache.delete(oldest);
      }
    },
    [buildCacheKey],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchPredictions = useCallback(
    async (input: string) => {
      const requestId = activeRequestIdRef.current + 1;
      activeRequestIdRef.current = requestId;
      setIsLoading(true);
      try {
        const session = ensureSessionToken();
        let url = `${BACKEND_URL}/api/places/autocomplete?input=${encodeURIComponent(
          input,
        )}&components=country:${countryCode}&sessiontoken=${encodeURIComponent(session)}`;
        if (
          typeof biasLat === 'number' &&
          typeof biasLng === 'number' &&
          Number.isFinite(biasLat) &&
          Number.isFinite(biasLng)
        ) {
          const r = Math.min(Math.max(5000, Math.round(biasRadiusM ?? 45000)), 50000);
          url += `&location_bias=${encodeURIComponent(`${biasLat},${biasLng}`)}&radius=${r}`;
        }

        const response = await fetch(url);
        let data: any = {};
        try {
          data = await response.json();
        } catch {
          data = {};
        }
        if (!mountedRef.current || requestId !== activeRequestIdRef.current) return;

        if (!response.ok) {
          setPredictions([]);
          setShowSuggestions(false);
          return;
        }

        if (data.status === 'OK') {
          const normalized = (data.predictions || []).map((p: any, index: number) =>
            normalizePrediction(p, index),
          );
          storeCachedPredictions(input, normalized);
          setPredictions(normalized);
          setShowSuggestions(normalized.length > 0);
        } else if (data.status === 'ZERO_RESULTS') {
          storeCachedPredictions(input, []);
          setPredictions([]);
          setShowSuggestions(false);
        } else {
          console.error('Google Places API error:', data.status, data.error_message);
          setPredictions([]);
          setShowSuggestions(false);
        }
      } catch (error) {
        console.error('Error fetching predictions:', error);
        if (!mountedRef.current || requestId !== activeRequestIdRef.current) return;
        setPredictions([]);
        setShowSuggestions(false);
      } finally {
        if (mountedRef.current && requestId === activeRequestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [
      biasLat,
      biasLng,
      biasRadiusM,
      countryCode,
      ensureSessionToken,
      storeCachedPredictions,
    ],
  );

  useEffect(() => {
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    const trimmed = value.trim();
    if (trimmed.length < AUTOCOMPLETE_MIN_CHARS) {
      setPredictions([]);
      setShowSuggestions(false);
      setIsLoading(false);
      return () => {
        if (debounceTimeout.current) {
          clearTimeout(debounceTimeout.current);
        }
      };
    }

    const cached = readCachedPredictions(trimmed);
    if (cached) {
      setPredictions(cached);
      setShowSuggestions(cached.length > 0);
      setIsLoading(false);
      return () => {
        if (debounceTimeout.current) {
          clearTimeout(debounceTimeout.current);
        }
      };
    }

    debounceTimeout.current = setTimeout(() => {
      void fetchPredictions(trimmed);
    }, AUTOCOMPLETE_DEBOUNCE_MS);

    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, [value, fetchPredictions, readCachedPredictions]);

  const handleSelectPlace = (prediction: Prediction) => {
    try {
      const safeDescription =
        prediction.description ||
        prediction.main_text ||
        prediction.structured_formatting?.main_text ||
        'Selected location';
      const sessionToken = sessionTokenRef.current ?? undefined;
      onChangeText(safeDescription);
      onPlaceSelected({
        description: safeDescription,
        placeId: prediction.place_id || '',
        sessionToken,
      });
      discardSessionToken();
      setPredictions([]);
      setShowSuggestions(false);
      Keyboard.dismiss();
    } catch {
      setPredictions([]);
      setShowSuggestions(false);
    }
  };

  const renderPrediction = ({ item }: { item: Prediction }) => {
    if (!item) return null;
    return (
      <TouchableOpacity
        style={styles.predictionItem}
        onPress={() => handleSelectPlace(item)}
      >
        <Ionicons name="location-outline" size={20} color="#22E180" style={styles.locationIcon} />
        <View style={styles.predictionText}>
          <Text style={styles.mainText}>{item.structured_formatting?.main_text || item.main_text || item.description}</Text>
          <Text style={styles.secondaryText}>{item.structured_formatting?.secondary_text || item.secondary_text || ''}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, style]}>
      <View style={styles.inputContainer}>
        <TextInput
          style={[styles.input, inputStyle]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={placeholderTextColor}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => {
            ensureSessionToken();
            const trimmed = value.trim();
            if (trimmed.length >= AUTOCOMPLETE_MIN_CHARS) {
              const cached = readCachedPredictions(trimmed);
              if (cached && cached.length > 0) {
                setPredictions(cached);
                setShowSuggestions(true);
                return;
              }
            }
            if (predictions.length > 0) {
              setShowSuggestions(true);
            }
          }}
        />
        {isLoading && (
          <ActivityIndicator
            size="small"
            color="#22E180"
            style={styles.loader}
          />
        )}
      </View>

      {showSuggestions && predictions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          <FlatList
            data={predictions.slice(0, 20)}
            keyExtractor={(item, index) => item.place_id || `prediction-${index}`}
            renderItem={renderPrediction}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            bounces={false}
            nestedScrollEnabled
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 1,
  },
  inputContainer: {
    position: 'relative',
  },
  input: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#3A3A3A',
  },
  loader: {
    position: 'absolute',
    right: 16,
    top: 16,
  },
  suggestionsContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginTop: 8,
    maxHeight: 250,
    borderWidth: 4,
    borderColor: '#00D46A',
    zIndex: 999999,
    elevation: 99,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.7,
    shadowRadius: 40,
  },
  list: {
    flex: 1,
  },
  predictionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 2,
    borderBottomColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  locationIcon: {
    marginRight: 12,
  },
  predictionText: {
    flex: 1,
  },
  mainText: {
    fontSize: 16,
    color: '#000000',
    fontWeight: '800',
    marginBottom: 4,
  },
  secondaryText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '700',
  },
});
