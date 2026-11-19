import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import type { ComponentProps, ReactNode } from 'react'
import { Children, Fragment, isValidElement } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useStore } from '../lib/store'
import { useWallpaper } from '../lib/wallpaper'
import { colors, hexA, MAX_WIDTH, radius } from './theme'

export type IconName = ComponentProps<typeof Ionicons>['name']

/**
 * The app's backdrop: the theme's background with a soft glow of the accent at the top, or your
 * wallpaper, darkened (more towards the bottom) so the page stays readable.
 */
export function Backdrop() {
  const blur = useStore((s) => s.settings.wallpaperBlur)
  const wallpaper = useWallpaper(blur)
  const dim = useStore((s) => s.settings.wallpaperDim)
  const custom = typeof wallpaper === 'object'
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} pointerEvents="none">
      {wallpaper ? (
        <>
          <Image source={wallpaper} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={blur ? (custom ? 24 : 5) : 0} transition={150} cachePolicy="memory-disk" />
          <LinearGradient colors={[hexA(colors.bg, dim * 0.85), hexA(colors.bg, Math.min(1, dim + 0.2))]} style={StyleSheet.absoluteFill} />
        </>
      ) : (
        <LinearGradient colors={[colors.bgGlow, 'rgba(0,0,0,0)']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 360, opacity: 0.6 }} />
      )}
    </View>
  )
}

/** Centers content and caps its width on wide (desktop) windows. */
export function Column({ children, style, pointerEvents }: { children: ReactNode; style?: ViewStyle; pointerEvents?: 'box-none' | 'auto' }) {
  return (
    <View pointerEvents={pointerEvents} style={[{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: 16 }, style]}>
      {children}
    </View>
  )
}

/**
 * A screen: the backdrop full-bleed behind it, and its content kept below the status bar and
 * camera cutout. The native SafeAreaView measures where the screen really is, so a screen shown
 * as a sheet (which already starts lower) doesn't get the space twice.
 */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        {children}
      </SafeAreaView>
    </View>
  )
}

/** A scrolling page with the backdrop, an optional header and room for the tab bar. */
export function Page({ children, header, bottomSpace = 40, wide = false }: { children: ReactNode; header?: ReactNode; bottomSpace?: number; wide?: boolean }) {
  const insets = useSafeAreaInsets()
  return (
    <Screen>
      {header}
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 8, paddingBottom: insets.bottom + bottomSpace }}>
        <Column style={wide ? undefined : { maxWidth: 640 }}>{children}</Column>
      </ScrollView>
    </Screen>
  )
}

export function CircleButton({ icon, onPress, size = 40, style, label }: { icon: IconName; onPress: () => void; size?: number; style?: ViewStyle; label?: string }) {
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 },
        style
      ]}
    >
      <Ionicons name={icon} size={size * 0.5} color={colors.text} />
    </Pressable>
  )
}

export function Pill({ label, onPress, disabled, tone = 'plain', style }: { label: string; onPress: () => void; disabled?: boolean; tone?: 'plain' | 'accent'; style?: ViewStyle }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [
        {
          paddingHorizontal: 16,
          height: 38,
          borderRadius: 19,
          justifyContent: 'center',
          backgroundColor: tone === 'accent' ? colors.accent : 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          borderColor: colors.border,
          opacity: disabled ? 0.4 : pressed ? 0.6 : 1
        },
        style
      ]}
    >
      <Text style={{ color: tone === 'accent' ? colors.onAccent : colors.text, fontWeight: '600', fontSize: 15 }}>{label}</Text>
    </Pressable>
  )
}

/** A screen's top bar: a back/close button, a centered title and a button on the right. */
export function Header({ title, left = 'back', right, onLeft }: { title?: string; left?: 'back' | 'close' | 'cancel' | 'none'; right?: ReactNode; onLeft?: () => void }) {
  const nav = useNavigation()
  const goBack = onLeft ?? (() => nav.goBack())
  return (
    <Column style={{ flexDirection: 'row', alignItems: 'center', height: 56 }}>
      <View style={{ flex: 1, alignItems: 'flex-start' }}>
        {left === 'back' && <CircleButton icon="chevron-back" onPress={goBack} label="Back" />}
        {left === 'close' && <CircleButton icon="close" onPress={goBack} label="Close" />}
        {left === 'cancel' && <Pill label="Cancel" onPress={goBack} />}
      </View>
      <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }} numberOfLines={1}>
        {title}
      </Text>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>{right}</View>
    </Column>
  )
}

/** A rounded card holding rows, with thin lines between them. */
export function Group({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const items = Children.toArray(children).filter(isValidElement)
  return (
    <View style={[{ backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: 18 }, style]}>
      {items.map((child, i) => (
        <Fragment key={i}>
          {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: 16 }} />}
          {child}
        </Fragment>
      ))}
    </View>
  )
}

interface RowProps {
  label: string
  sub?: string
  value?: string
  icon?: IconName
  iconColor?: string
  onPress?: () => void
  chevron?: boolean
  /** ⌃⌄ like a pop-up menu, or ↗ for links that leave the app. */
  accessory?: 'chevron' | 'updown' | 'external' | 'none'
  right?: ReactNode
  danger?: boolean
  left?: ReactNode
}

export function Row({ label, sub, value, icon, iconColor, onPress, accessory, right, danger, left }: RowProps) {
  const acc = accessory ?? (onPress ? 'chevron' : 'none')
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: pressed ? colors.cardHi : 'transparent' })}>
      {left}
      {icon && (
        <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: '#f4f4f6', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
          <Ionicons name={icon} size={17} color={iconColor ?? '#111113'} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ color: danger ? colors.danger : colors.text, fontSize: 16 }}>{label}</Text>
        {sub ? <Text style={{ color: colors.dim, fontSize: 13, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      {value !== undefined && (
        <Text style={{ color: colors.dim, fontSize: 15, marginLeft: 8, maxWidth: '55%' }} numberOfLines={1}>
          {value}
        </Text>
      )}
      {right}
      {acc === 'chevron' && <Ionicons name="chevron-forward" size={16} color={colors.faint} style={{ marginLeft: 6 }} />}
      {acc === 'updown' && <Ionicons name="chevron-expand" size={15} color={colors.dim} style={{ marginLeft: 4 }} />}
      {acc === 'external' && <Ionicons name="arrow-up-outline" size={15} color={colors.dim} style={{ marginLeft: 6, transform: [{ rotate: '45deg' }] }} />}
    </Pressable>
  )
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: 'rgba(255,255,255,0.18)', true: colors.accent }}
      thumbColor={value && colors.onAccent !== '#ffffff' ? colors.onAccent : '#fff'}
      {...(Platform.OS === 'web' ? ({ activeThumbColor: '#fff' } as object) : {})}
    />
  )
}

/** A group's title above it, in plain grey (Settings). */
export function GroupTitle({ children }: { children: ReactNode }) {
  return <Text style={{ color: colors.dim, fontSize: 17, fontWeight: '600', marginBottom: 10, marginTop: 6, paddingHorizontal: 6 }}>{children}</Text>
}

export function SectionLabel({ children, right, style }: { children: ReactNode; right?: ReactNode; style?: TextStyle }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, marginTop: 4, paddingHorizontal: 4 }}>
      <Text style={[{ color: colors.dim, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, flex: 1 }, style]}>{children}</Text>
      {right}
    </View>
  )
}

export function Field(props: TextInputProps & { multiline?: boolean }) {
  return (
    <TextInput
      placeholderTextColor={colors.faint}
      {...props}
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: props.multiline ? radius.card : radius.row,
          borderWidth: 1,
          borderColor: colors.border,
          color: colors.text,
          fontSize: 16,
          paddingHorizontal: 16,
          paddingVertical: 14,
          minHeight: props.multiline ? 120 : undefined,
          textAlignVertical: props.multiline ? 'top' : 'center',
          ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {})
        },
        props.style
      ]}
    />
  )
}

/** A search box with a magnifying glass. */
export function SearchField({ value, onChange, placeholder, autoFocus, style }: { value: string; onChange: (t: string) => void; placeholder: string; autoFocus?: boolean; style?: ViewStyle }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.field, borderRadius: 12, paddingHorizontal: 10, height: 40 }, style]}>
      <Ionicons name="search" size={17} color={colors.dim} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.dim}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        style={{ flex: 1, color: colors.text, fontSize: 16, marginLeft: 8, height: 40, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) }}
      />
      {value ? (
        <Pressable onPress={() => onChange('')} hitSlop={8}>
          <Ionicons name="close-circle" size={17} color={colors.dim} />
        </Pressable>
      ) : null}
    </View>
  )
}

/** iOS-style segmented control. */
export function Segmented<T extends string>({ options, value, onChange }: { options: Array<{ label: string; value: T }>; value: T; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.field, borderRadius: 18, padding: 3 }}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} style={{ flex: 1, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: o.value === value ? 'rgba(255,255,255,0.22)' : 'transparent' }}>
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: o.value === value ? '600' : '400' }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  )
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <Text style={{ color: colors.dim, fontSize: 15, textAlign: 'center', marginVertical: 30, lineHeight: 21 }}>{children}</Text>
}
