/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        nx: {
          bg: '#040c18',
          surface: '#071525',
          card: '#0b1e35',
          green: '#00d084',
          blue: '#0ea5e9',
        },
      },
    },
  },
  plugins: [],
};
