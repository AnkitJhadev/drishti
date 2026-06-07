import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          page: '#0a0f1e',
          card: '#111827',
          elevated: '#1a2235',
        },
        border: {
          DEFAULT: '#1f2937',
          hover: '#374151',
        },
        accent: '#f59e0b',
        success: '#10b981',
        danger: '#ef4444',
        warning: '#f97316',
        info: '#3b82f6',
        text: {
          primary: '#f9fafb',
          secondary: '#9ca3af',
          muted: '#6b7280',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        xs: '11px',
        sm: '12px',
        base: '14px',
        lg: '16px',
        xl: '18px',
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '8px',
      },
    },
  },
  plugins: [],
}

export default config
