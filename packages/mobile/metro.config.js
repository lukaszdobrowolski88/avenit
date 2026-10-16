const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
// Mobilka jest poza workspace'ami npm (własne node_modules: React 19 / RN z Expo). Ze wspólnego
// kodu bierzemy tylko packages/shared (czyste JS, bez zależności zewnętrznych) — obserwujemy sam
// ten katalog, a pakiety rozwiązujemy z node_modules mobilki (node_modules weba z Reactem 18
// nie trafiają do paczki). Wyszukiwanie hierarchiczne zostaje (zagnieżdżone node_modules pakietów).
const sharedRoot = path.resolve(projectRoot, '../shared');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [sharedRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

module.exports = withNativeWind(config, { input: './global.css' });
