import { View, type ViewStyle } from 'react-native'
import { WebView } from 'react-native-webview'

// Phones: YouTube's embed in a web view, with a web origin (YouTube refuses embeds without one).

const ORIGIN = 'https://deli5150.github.io'

export function VideoFrame({ youtubeKey, style }: { youtubeKey: string; style?: ViewStyle }) {
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%}</style></head><body><iframe src="https://www.youtube-nocookie.com/embed/${youtubeKey}?autoplay=1&rel=0&modestbranding=1&playsinline=1" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></body></html>`
  return (
    <View style={[{ backgroundColor: '#000', overflow: 'hidden' }, style]}>
      <WebView
        key={youtubeKey}
        source={{ html, baseUrl: ORIGIN }}
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        style={{ flex: 1, backgroundColor: '#000' }}
      />
    </View>
  )
}
