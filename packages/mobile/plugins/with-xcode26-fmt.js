// Xcode 26 (iOS 26 SDK — od 2026 wymagany przez App Store Connect) + React Native 0.76 (Expo SDK 52):
// Clang z Xcode 26 zgłasza obsługę consteval, więc biblioteka fmt 11 (zależność RN) włącza
// FMT_USE_CONSTEVAL i przestaje się kompilować. Po `pod install` wymuszamy FMT_USE_CONSTEVAL 0
// w Pods/fmt/include/fmt/base.h — na starszym Xcode zmiana nic nie psuje.
// Do usunięcia po przejściu na Expo SDK 54+ (nowsze RN mają poprawione fmt).
const { withPodfile } = require('expo/config-plugins');

const MARK = '# avenit: xcode26 fmt consteval';
const SNIPPET = `
    ${MARK}
    fmt_base = File.join(installer.sandbox.root.to_s, 'fmt', 'include', 'fmt', 'base.h')
    if File.exist?(fmt_base)
      src = File.read(fmt_base)
      fixed = src.gsub(/#(\\s*)define FMT_USE_CONSTEVAL 1/, '#\\1define FMT_USE_CONSTEVAL 0')
      if fixed != src
        File.chmod(0644, fmt_base)
        File.write(fmt_base, fixed)
        Pod::UI.puts '[avenit] fmt: FMT_USE_CONSTEVAL=0 (Xcode 26)'
      end
    end
`;

module.exports = function withXcode26Fmt(config) {
  return withPodfile(config, (cfg) => {
    const podfile = cfg.modResults.contents;
    if (!podfile.includes(MARK)) {
      if (!/post_install do \|installer\|/.test(podfile)) {
        throw new Error('with-xcode26-fmt: w Podfile brak bloku post_install');
      }
      cfg.modResults.contents = podfile.replace(/post_install do \|installer\|\n/, (m) => `${m}${SNIPPET}`);
    }
    return cfg;
  });
};
