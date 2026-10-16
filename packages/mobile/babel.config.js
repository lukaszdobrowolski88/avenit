module.exports = function (api) {
  api.cache(true);
  return {
    // Reanimated 4: plugin react-native-worklets dodaje sam babel-preset-expo (SDK 54+).
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }]],
  };
};
