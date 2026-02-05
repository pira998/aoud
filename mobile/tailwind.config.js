/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#0a0a0f',
        foreground: '#fafafa',
        card: '#111118',
        'card-foreground': '#fafafa',
        primary: '#8b5cf6',
        'primary-foreground': '#fafafa',
        secondary: '#1e1e2e',
        'secondary-foreground': '#a1a1aa',
        muted: '#27273a',
        'muted-foreground': '#71717a',
        accent: '#2d2d44',
        'accent-foreground': '#fafafa',
        destructive: '#ef4444',
        'destructive-foreground': '#fafafa',
        border: '#27273a',
        input: '#27273a',
        ring: '#8b5cf6',
      },
    },
  },
  plugins: [],
};
