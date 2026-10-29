import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        grid: {
          online: '#10b981', // Emerald 500
          planned: '#f59e0b', // Amber 500
          fault: '#ef4444', // Red 500
          dark: '#0f172a', // Slate 900
          light: '#f8fafc' // Slate 50
        }
      }
    }
  },
  plugins: []
};

export default config;

