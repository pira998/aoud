/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    './src/**/*.css',  // Include CSS files to preserve custom classes
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#0a0a0f',
        foreground: '#fafafa',
        card: '#111118',
        'card-foreground': '#fafafa',
        popover: '#1a1a24',
        'popover-foreground': '#fafafa',
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
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
