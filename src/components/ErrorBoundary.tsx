import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface State { hasError: boolean; }

export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => this.setState({ hasError: false });

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={s.container}>
        <View style={s.iconWrap}>
          <Ionicons name="warning-outline" size={48} color="#d97706" />
        </View>
        <Text style={s.title}>{'משהו השתבש'}{'\n'}{'Something went wrong'}</Text>
        <Text style={s.sub}>
          {'נסה שוב — אם הבעיה חוזרת, נסה לסגור ולפתוח מחדש את האפליקציה.'}
          {'\n\n'}
          {'Try again — if the problem persists, close and reopen the app.'}
        </Text>
        <TouchableOpacity style={s.btn} onPress={this.reset} activeOpacity={0.85}>
          <Ionicons name="refresh-outline" size={18} color="#fff" />
          <Text style={s.btnTxt}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafaf9',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    gap: 16,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1c1917',
    textAlign: 'center',
    lineHeight: 28,
  },
  sub: {
    fontSize: 14,
    color: '#78716c',
    textAlign: 'center',
    lineHeight: 22,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  btnTxt: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
