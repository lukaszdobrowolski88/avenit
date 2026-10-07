import { Component, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
  details: boolean;
}

// Awaria ekranu: po ludzku, w kolorach marki; szczegóły techniczne dopiero na życzenie
// (do zgłoszenia administratorowi), a nie surowy komunikat na pierwszym planie.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, details: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, details: false };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => this.setState({ error: null, details: false });

  render() {
    const { error, details } = this.state;
    if (error) {
      if (this.props.fallback) return this.props.fallback(error, this.reset);
      return (
        <View style={{ flex: 1, backgroundColor: '#F6F4EE', paddingHorizontal: 24, justifyContent: 'center' }}>
          <Text
            accessibilityRole="header"
            style={{ fontSize: 24, color: '#2A2312', marginBottom: 8, letterSpacing: -0.6, fontFamily: 'Manrope_700Bold' }}
          >
            Coś poszło nie tak
          </Text>
          <Text style={{ fontSize: 14, lineHeight: 21, color: '#6B6557', marginBottom: 24, fontFamily: 'Manrope_500Medium' }}>
            Ten ekran nie mógł się wyświetlić. Spróbuj ponownie, a jeśli błąd się powtórzy, zgłoś go administratorowi.
          </Text>
          <Pressable
            onPress={this.reset}
            accessibilityRole="button"
            style={{ backgroundColor: '#FFBE0B', borderRadius: 26, height: 52, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#2A2312', fontSize: 15, fontFamily: 'Manrope_700Bold' }}>Spróbuj ponownie</Text>
          </Pressable>
          <Pressable
            onPress={() => this.setState({ details: !details })}
            accessibilityRole="button"
            style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 }}
          >
            <Text style={{ fontSize: 13, color: '#6E685A', fontFamily: 'Manrope_600SemiBold' }}>
              {details ? 'Ukryj szczegóły techniczne' : 'Pokaż szczegóły techniczne'}
            </Text>
          </Pressable>
          {details ? (
            <ScrollView
              style={{
                maxHeight: 180,
                borderRadius: 14,
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: '#B5AD99',
                padding: 12,
              }}
            >
              <Text selectable style={{ fontFamily: 'Manrope_400Regular', fontSize: 12, color: '#4A463E' }}>
                {error.name}: {error.message}
              </Text>
            </ScrollView>
          ) : null}
        </View>
      );
    }
    return this.props.children;
  }
}
