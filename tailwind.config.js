/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // <--- TO JEST KLUCZOWE
  theme: {
    extend: {
      // Zaokrąglenie sterowane w Ustawienia → Wygląd. Każdy promień = base * --radius-scale;
      // gdy zmiennej brak → fallback 1 = dokładnie domyślne wartości Tailwinda. 'full'/'none'
      // celowo nietknięte (pigułki i avatary zostają okrągłe/proste).
      borderRadius: {
        DEFAULT: 'calc(0.25rem * var(--radius-scale, 1))',
        sm: 'calc(0.125rem * var(--radius-scale, 1))',
        md: 'calc(0.375rem * var(--radius-scale, 1))',
        lg: 'calc(0.5rem * var(--radius-scale, 1))',
        xl: 'calc(0.75rem * var(--radius-scale, 1))',
        '2xl': 'calc(1rem * var(--radius-scale, 1))',
        '3xl': 'calc(1.5rem * var(--radius-scale, 1))',
      },
      colors: {
        accent: {
          primary: 'rgb(var(--accent-primary) / <alpha-value>)',
          'primary-light': 'rgb(var(--accent-primary-light) / <alpha-value>)',
          'primary-lighter': 'rgb(var(--accent-primary-lighter) / <alpha-value>)',
          'primary-lightest': 'rgb(var(--accent-primary-lightest) / <alpha-value>)',
          'primary-dark': 'rgb(var(--accent-primary-dark) / <alpha-value>)',
          'primary-darkest': 'rgb(var(--accent-primary-darkest) / <alpha-value>)',
          secondary: 'rgb(var(--accent-secondary) / <alpha-value>)',
          'secondary-light': 'rgb(var(--accent-secondary-light) / <alpha-value>)',
          'secondary-lighter': 'rgb(var(--accent-secondary-lighter) / <alpha-value>)',
          'secondary-lightest': 'rgb(var(--accent-secondary-lightest) / <alpha-value>)',
          'secondary-dark': 'rgb(var(--accent-secondary-dark) / <alpha-value>)',
          'secondary-darkest': 'rgb(var(--accent-secondary-darkest) / <alpha-value>)',
        }
      }
    },
  },
  plugins: [],
}
