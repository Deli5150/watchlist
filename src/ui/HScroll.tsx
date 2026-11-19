import { useEffect, useRef, type ReactNode } from 'react'
import { Platform, ScrollView, type ScrollViewInstance, type StyleProp, type ViewStyle } from 'react-native'

// A sideways row that the mouse wheel scrolls left and right on desktop (a plain vertical wheel
// would otherwise scroll the page). At either end the wheel goes back to scrolling the page.

export function HScroll({ children, style, contentContainerStyle }: { children: ReactNode; style?: StyleProp<ViewStyle>; contentContainerStyle?: StyleProp<ViewStyle> }) {
  const ref = useRef<ScrollViewInstance>(null)
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const node = (ref.current as unknown as { getScrollableNode?: () => HTMLElement } | null)?.getScrollableNode?.()
    if (!node) return
    const onWheel = (e: WheelEvent) => {
      // Trackpads already scroll sideways; only turn a mostly vertical wheel into a sideways one.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      const max = node.scrollWidth - node.clientWidth
      if (max <= 0) return
      const next = Math.max(0, Math.min(max, node.scrollLeft + e.deltaY))
      if (next === node.scrollLeft) return
      e.preventDefault()
      node.scrollLeft = next
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [])
  return (
    <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={Platform.OS === 'web'} style={style} contentContainerStyle={[{ paddingBottom: Platform.OS === 'web' ? 10 : 0 }, contentContainerStyle]}>
      {children}
    </ScrollView>
  )
}
