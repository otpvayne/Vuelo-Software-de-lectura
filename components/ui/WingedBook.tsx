interface WingedBookProps {
  /** Color de las páginas y alas (usa currentColor: p. ej. `text-papel`). */
  className?: string;
  /** Color de las líneas de texto y la estrella (p. ej. `text-acento`). */
  accentClassName?: string;
  /** Color de la estrella; por defecto el de acento. */
  starClassName?: string;
  /** Contorno de páginas y alas, para fondos claros (p. ej. `text-tinta/30`). */
  outlineClassName?: string;
  star?: boolean;
  title?: string;
}

/** Libro abierto con alas: el motivo del ícono de Vuelo, en SVG inline. */
export default function WingedBook({
  className = '',
  accentClassName = '',
  starClassName,
  outlineClassName,
  star = true,
  title,
}: WingedBookProps) {
  return (
    <svg
      viewBox="0 0 120 88"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {/* Alas */}
      <path d="M22 30 C 15 21 7 20 1 25 C 9 24 15 28 21 36 Z" fill="currentColor" opacity="0.7" />
      <path d="M98 30 C 105 21 113 20 119 25 C 111 24 105 28 99 36 Z" fill="currentColor" opacity="0.7" />
      {/* Páginas */}
      <path d="M60 40 C 50 31 37 28 20 28 L 25 70 C 39 70 51 73 60 80 Z" fill="currentColor" opacity="0.96" />
      <path d="M60 40 C 70 31 83 28 100 28 L 95 70 C 81 70 69 73 60 80 Z" fill="currentColor" opacity="0.8" />
      {outlineClassName && (
        <g className={outlineClassName} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M22 30 C 15 21 7 20 1 25 C 9 24 15 28 21 36 Z" />
          <path d="M98 30 C 105 21 113 20 119 25 C 111 24 105 28 99 36 Z" />
          <path d="M60 40 C 50 31 37 28 20 28 L 25 70 C 39 70 51 73 60 80 C 69 73 81 70 95 70 L 100 28 C 83 28 70 31 60 40 Z" />
        </g>
      )}
      <g className={accentClassName} fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" opacity="0.85">
        <path d="M60 40 L 60 80" opacity="0.5" />
        <path d="M30 42 C 38 42 46 44 53 49" />
        <path d="M31 52 C 39 52 46 54 53 59" />
        <path d="M90 42 C 82 42 74 44 67 49" />
        <path d="M89 52 C 81 52 74 54 67 59" />
      </g>
      {star && (
        <path
          className={starClassName ?? accentClassName}
          fill="currentColor"
          d="M60 2 L 63.5 11.2 L 73.3 11.6 L 65.6 17.7 L 68.2 27.2 L 60 21.8 L 51.8 27.2 L 54.4 17.7 L 46.7 11.6 L 56.5 11.2 Z"
        />
      )}
    </svg>
  );
}
