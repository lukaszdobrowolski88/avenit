/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#ec4899',
          50: '#fdf2f8',
          100: '#fce7f3',
          200: '#fbcfe8',
          300: '#f9a8d4',
          400: '#f472b6',
          500: '#ec4899',
          600: '#db2777',
          700: '#be185d',
          800: '#9d174d',
          900: '#831843',
        },
        accent: {
          DEFAULT: '#f97316',
          500: '#f97316',
          600: '#ea580c',
        },
        team: {
          program: '#ec4899',
          worship: '#a855f7',
          media: '#f97316',
          atmosfera: '#14b8a6',
          kids: '#eab308',
          groups: '#3b82f6',
          mlodziezowka: '#f43f5e',
        },
      },
    },
  },
  plugins: [],
};
