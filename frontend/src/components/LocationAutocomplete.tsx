import React, { useState, useEffect, useRef } from 'react';
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

interface Prediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

interface LocationAutocompleteProps {
  value: string;
  onChangeText: (text: string) => void;
  onPlaceSelected: (place: { description: string; placeId: string }) => void;
  placeholder?: string;
  apiKey: string;
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
  apiKey,
  countryCode = 'ng',
  style,
  inputStyle,
  placeholderTextColor = '#A0A0A0',
}: LocationAutocompleteProps) {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

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
    if (!apiKey) {
      console.error('Google Maps API key is required');
      return;
    }

    setIsLoading(true);
    try {
      // Use backend proxy to avoid CORS issues
      const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const url = `${backendUrl}/api/places/autocomplete?input=${encodeURIComponent(
        input
      )}&country=${countryCode}&language=en`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK') {
        setPredictions(data.predictions || []);
        setShowSuggestions(true);
      } else if (data.status === 'ZERO_RESULTS') {
        setPredictions([]);
        setShowSuggestions(false);
      } else {
        console.error('Google Places API error:', data.status, data.error_message);
        setPredictions([]);
      }
    } catch (error) {
      console.error('Error fetching predictions:', error);
      setPredictions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectPlace = (prediction: Prediction) => {
    onChangeText(prediction.description);
    onPlaceSelected({
      description: prediction.description,
      placeId: prediction.place_id,
    });
    setPredictions([]);
    setShowSuggestions(false);
    Keyboard.dismiss();
  };

  const renderPrediction = ({ item }: { item: Prediction }) => (
    <TouchableOpacity
      style={styles.predictionItem}
      onPress={() => handleSelectPlace(item)}
    >
      <Ionicons name="location-outline" size={20} color="#22E180" style={styles.locationIcon} />
      <View style={styles.predictionText}>
        <Text style={styles.mainText}>{item.structured_formatting.main_text}</Text>
        <Text style={styles.secondaryText}>{item.structured_formatting.secondary_text}</Text>
      </View>
    </TouchableOpacity>
  );

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
          <FlatList
            data={predictions}
            renderItem={renderPrediction}
            keyExtractor={(item) => item.place_id}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
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
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    marginTop: 8,
    maxHeight: 250,
    borderWidth: 1,
    borderColor: '#3A3A3A',
    zIndex: 1000,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  list: {
    flex: 1,
  },
  predictionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#3A3A3A',
  },
  locationIcon: {
    marginRight: 12,
  },
  predictionText: {
    flex: 1,
  },
  mainText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '600',
    marginBottom: 2,
  },
  secondaryText: {
    fontSize: 13,
    color: '#A0A0A0',
  },
});
