// Android builds only for phones' ARM processors (64- and 32-bit), not Intel x86 (no phones use
// it; Apple-silicon emulators are ARM too), which roughly halves the APK people download.
const { withGradleProperties } = require('expo/config-plugins')

module.exports = function withPhoneArchitectures(config) {
  return withGradleProperties(config, (c) => {
    const value = 'armeabi-v7a,arm64-v8a'
    const existing = c.modResults.find((p) => p.type === 'property' && p.key === 'reactNativeArchitectures')
    if (existing) existing.value = value
    else c.modResults.push({ type: 'property', key: 'reactNativeArchitectures', value })
    return c
  })
}
