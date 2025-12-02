/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./sections/*.{html,js,liquid}", 
    "./blocks/*.{html,js,liquid}", 
    "./snippets/*.{html,js,liquid}",
    "./js/**/*.{js,svelte,jsx}"
  ],
  theme: {
    extend: {
      screens: {
        'small': '390px',
        'md-small': '768px',
        'md': '1024px',
        'lg': '1280px',
        '2xl': '1550px',
      },
      colors: {
        'ah-navy': '#092846',
        'ah-teal': '#52c3c2',
        'text-teal': '#358282',
        'text-teal-600': '#007867',
        'body-text': '#323e46',
        'heading-text': '#092846',
        slate: {
          100: '#f1f5f9',
          200: '#e2e8f0',
          400: '#90a1b9',
        },
      },
      spacing: {
        '1': '4px',
        '2': '8px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '8': '32px',
        '10': '40px',
        '14': '56px',
        '20': '80px',
      },
      borderRadius: {
        'xl': '12px',
        'full': '9999px',
      },
      fontFamily: {
        'sans': ['Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
      },
      fontSize: {
        'decorative': ['13px', { lineHeight: '1.5', letterSpacing: '0.52px' }],
      },
    },
  },
  plugins: [],
  prefix: 'tw-' 
}
