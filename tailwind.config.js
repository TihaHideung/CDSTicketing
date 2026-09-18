/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#0a1a33',
          900: '#0e2a52',
          800: '#123a6e',
          700: '#164a8a',
        },
        brand: {
          red: '#e0301e',
        },
      },
    },
  },
  plugins: [],
};
