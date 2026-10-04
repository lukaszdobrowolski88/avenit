import { Component, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
      return (
        <View
          style={{
            flex: 1,
            backgroundColor: '#F6F4EE',
            paddingHorizontal: 24,
            paddingVertical: 48,
          }}
        >
          <Text
            style={{
              fontSize: 22,
              color: '#be123c',
              marginBottom: 8,
              letterSpacing: -0.4,
              fontFamily: 'Manrope_700Bold',
            }}
          >
            Coś poszło nie tak
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: '#6B6557',
              marginBottom: 20,
              fontFamily: 'Manrope_500Medium',
            }}
          >
            Spróbuj ponownie. Jeśli problem powraca, daj nam znać.
          </Text>
          <ScrollView
            style={{
              maxHeight: 200,
              borderRadius: 14,
              backgroundColor: '#F1EEE6',
              borderWidth: 1,
              borderColor: '#E6E1D5',
              padding: 12,
              marginBottom: 20,
            }}
          >
            <Text style={{ fontFamily: 'Manrope_400Regular', fontSize: 12, color: '#4A463E' }}>
              {this.state.error.name}: {this.state.error.message}
            </Text>
          </ScrollView>
          <Pressable
            onPress={this.reset}
            style={{
              backgroundColor: '#2A2312',
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#ffffff', fontSize: 15, fontFamily: 'Manrope_700Bold' }}>
              Spróbuj ponownie
            </Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}
