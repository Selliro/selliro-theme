/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './layout/**/*.{liquid,json}',
    './sections/**/*.{liquid,json}',
    './snippets/**/*.{liquid,json}',
    './templates/**/*.{liquid,json}',
    './blocks/**/*.{liquid,json}',
    './locales/**/*.json'
  ],
  theme: {
    extend: {}
  },
  plugins: []
};


