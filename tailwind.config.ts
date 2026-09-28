import type { Config } from 'tailwindcss';

// Los colores salen de variables CSS (canales RGB) definidas por [data-theme] en globals.css.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="noche"]'],
  theme: {
    extend: {
      colors: {
        fondo: token('fondo'),
        papel: token('papel'),
        tinta: token('tinta'),
        acento: token('acento'),
        'tinta-suave': token('tinta-suave'),
        linea: token('linea'),
        sombra: token('sombra'),
      },
      fontFamily: {
        display: ['var(--font-fraunces)', 'Georgia', 'serif'],
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        suave: '16px',
        tarjeta: '20px',
        panel: '24px',
      },
      boxShadow: {
        // Sombras suaves en capas; el color base es la tinta del tema.
        suave: '0 1px 2px rgb(var(--sombra) / 0.06), 0 4px 12px rgb(var(--sombra) / 0.08)',
        flotante:
          '0 2px 4px rgb(var(--sombra) / 0.06), 0 8px 24px rgb(var(--sombra) / 0.10), 0 24px 48px rgb(var(--sombra) / 0.12)',
        libro:
          '0 1px 1px rgb(var(--sombra) / 0.08), 0 6px 14px rgb(var(--sombra) / 0.14), 0 22px 40px -12px rgb(var(--sombra) / 0.30)',
      },
      transitionTimingFunction: {
        vuelo: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
