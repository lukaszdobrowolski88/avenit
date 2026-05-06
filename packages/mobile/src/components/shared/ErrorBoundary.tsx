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
            backgroundColor: '#ffffff',
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
              fontFamily: 'Inter_700Bold',
            }}
          >
            Coś poszło nie tak
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: '#78716c',
              marginBottom: 20,
              fontFamily: 'Inter_500Medium',
            }}
          >
            Spróbuj ponownie. Jeśli problem powraca, daj nam znać.
          </Text>
          <ScrollView
            style={{
              maxHeight: 200,
              borderRadius: 14,
              backgroundColor: '#fafaf9',
              borderWidth: 1,
              borderColor: '#eef0f3',
              padding: 12,
              marginBottom: 20,
            }}
          >
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#57534e' }}>
              {this.state.error.name}: {this.state.error.message}
            </Text>
          </ScrollView>
          <Pressable
            onPress={this.reset}
            style={{
              backgroundColor: '#ec4899',
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#ffffff', fontSize: 15, fontFamily: 'Inter_700Bold' }}>
              Spróbuj ponownie
            </Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}
