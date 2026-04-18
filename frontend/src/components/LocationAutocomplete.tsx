import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
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

interface LocationAutocompleteProps {
  value: string;
  onChangeText: (text: string) => void;
  onPlaceSelected: (place: { description: string; placeId: string }) => void;
  placeholder?: string;
  /** @deprecated Unused — autocomplete uses BACKEND_URL /api/places. Kept for call-site compatibility. */
  apiKey?: string;
  countryCode?: string;
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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Debounce search
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    if (value.length >= 2) {
      debounceTimeout.current = setTimeout(() => {
        fetchPredictions(value);
      }, 300);
    } else {
      setPredictions([]);
      setShowSuggestions(false);
    }

    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, [value]);

  const fetchPredictions = async (input: string) => {
    const requestId = activeRequestIdRef.current + 1;
    activeRequestIdRef.current = requestId;
    setIsLoading(true);
    try {
      // Use backend proxy to avoid CORS issues
      const url = `${BACKEND_URL}/api/places/autocomplete?input=${encodeURIComponent(
        input
      )}&components=country:${countryCode}`;

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
          normalizePrediction(p, index)
        );
        setPredictions(normalized);
        setShowSuggestions(true);
      } else if (data.status === 'ZERO_RESULTS') {
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
  };

  const handleSelectPlace = (prediction: Prediction) => {
    try {
      const safeDescription =
        prediction.description ||
        prediction.main_text ||
        prediction.structured_formatting?.main_text ||
        'Selected location';
      onChangeText(safeDescription);
      onPlaceSelected({
        description: safeDescription,
        placeId: prediction.place_id || '',
      });
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
          <ScrollView
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            style={styles.list}
            bounces={false}
          >
            {predictions.slice(0, 20).map((item, index) => (
              <View key={item.place_id || `prediction-${index}`}>
                {renderPrediction({ item })}
              </View>
            ))}
          </ScrollView>
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
