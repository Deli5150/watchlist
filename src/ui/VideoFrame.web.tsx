import { createElement } from 'react'
import { View, type ViewStyle } from 'react-native'

// Desktop (and browser): YouTube's privacy-enhanced embed in an iframe. The Electron shell adds the
// Referer YouTube requires (desktop/main.cjs), since pages on app:// don't send one.

export function VideoFrame({ youtubeKey, style }: { youtubeKey: string; style?: ViewStyle }) {
  const src = `https://www.youtube-nocookie.com/embed/${youtubeKey}?autoplay=1&rel=0&modestbranding=1&playsinline=1`
  return (
    <View style={[{ backgroundColor: '#000', overflow: 'hidden' }, style]}>
      {createElement('iframe', {
        key: youtubeKey,
        src,
        title: 'Trailer',
        allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
        allowFullScreen: true,
        referrerPolicy: 'strict-origin-when-cross-origin',
        style: { border: 0, width: '100%', height: '100%' }
      })}
    </View>
  )
}
