/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // <--- TO JEST KLUCZOWE
  theme: {
    extend: {},
  },
  plugins: [],
}
