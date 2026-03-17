/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // <--- TO JEST KLUCZOWE
  theme: {
    extend: {
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
