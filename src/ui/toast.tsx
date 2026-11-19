import { useEffect, useRef } from 'react'
import { Animated, Platform, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { create } from 'zustand'
import { useWide } from '../lib/layout'
import { colors } from './theme'

// A short message at the bottom of the window, optionally with an Undo button.

interface Toast {
  id: number
  text: string
  undo?: () => void
}

const useToast = create<{ toast: Toast | null }>(() => ({ toast: null }))
let counter = 0
let timer: ReturnType<typeof setTimeout> | null = null

export function toast(text: string, undo?: () => void): void {
  if (timer) clearTimeout(timer)
  const id = ++counter
  useToast.setState({ toast: { id, text, undo } })
  timer = setTimeout(() => useToast.setState((s) => (s.toast?.id === id ? { toast: null } : s)), 4500)
}

export function ToastHost() {
  const t = useToast((s) => s.toast)
  const insets = useSafeAreaInsets()
  const wide = useWide()
  const y = useRef(new Animated.Value(0)).current
  useEffect(() => {
    y.setValue(t ? 0 : 1)
    if (t) Animated.spring(y, { toValue: 1, useNativeDriver: Platform.OS !== 'web', damping: 18, stiffness: 240 }).start()
  }, [t?.id, y])
  if (!t) return null
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: wide ? 24 : insets.bottom + 92, alignItems: 'center' }}>
      <Animated.View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          maxWidth: 520,
          marginHorizontal: 16,
          paddingLeft: 18,
          paddingRight: t.undo ? 6 : 18,
          minHeight: 46,
          borderRadius: 23,
          backgroundColor: colors.cardHi,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.12)',
          shadowColor: '#000',
          shadowOpacity: 0.4,
          shadowRadius: 16,
          opacity: y,
          transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }]
        }}
      >
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500', flexShrink: 1 }}>{t.text}</Text>
        {t.undo && (
          <Pressable
            onPress={() => {
              t.undo?.()
              useToast.setState({ toast: null })
            }}
            style={({ pressed }) => ({ marginLeft: 12, paddingHorizontal: 14, height: 34, borderRadius: 17, justifyContent: 'center', backgroundColor: pressed ? colors.accentSoft : 'transparent' })}
          >
            <Text style={{ color: colors.accentHi, fontWeight: '700', fontSize: 14 }}>Undo</Text>
          </Pressable>
        )}
      </Animated.View>
    </View>
  )
}
