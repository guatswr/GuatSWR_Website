/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'sky-brand': '#38bdf8', // 自定义主题色
        'sky-dark': '#0284c7',
      }
    },
  },
  plugins: [],
}