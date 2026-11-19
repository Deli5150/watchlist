import { useEffect, useRef, type ReactNode } from 'react'
import { Animated, Easing, Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'

// Small, native-thread animations used across the app.

const NATIVE = Platform.OS !== 'web'

/** Fades (and optionally slides) its content in when it mounts; give it a `key` to replay. */
export function FadeIn({ children, from = 0, dy = 0, duration = 220, style }: { children: ReactNode; from?: number; dy?: number; duration?: number; style?: StyleProp<ViewStyle> }) {
  const t = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }).start()
  }, [t, duration])
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: t,
          transform: [
            { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) },
            { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [dy, 0] }) }
          ]
        }
      ]}
    >
      {children}
    </Animated.View>
  )
}

/** A Pressable that sinks slightly while pressed. */
export function PressableScale({ children, style, scaleTo = 0.975, ...rest }: PressableProps & { style?: StyleProp<ViewStyle>; scaleTo?: number; children: ReactNode }) {
  const s = useRef(new Animated.Value(1)).current
  const to = (v: number) => Animated.spring(s, { toValue: v, useNativeDriver: NATIVE, speed: 40, bounciness: 0 }).start()
  return (
    <Pressable {...rest} onPressIn={(e) => (to(scaleTo), rest.onPressIn?.(e))} onPressOut={(e) => (to(1), rest.onPressOut?.(e))}>
      <Animated.View style={[style, { transform: [{ scale: s }] }]}>{children}</Animated.View>
    </Pressable>
  )
}
