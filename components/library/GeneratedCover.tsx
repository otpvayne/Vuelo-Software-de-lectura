import WingedBook from '@/components/ui/WingedBook';

const PALETTES = 6;

/** FNV-1a de 32 bits: estable entre sesiones y plataformas. */
export function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Clase de paleta (.portada-N en globals.css) derivada del título. */
export const paletteClass = (title: string) => `portada-${hashString(title) % PALETTES}`;

interface GeneratedCoverProps {
  title: string;
  author: string | null;
  /** Ancho de la portada en px, para escalar la tipografía. */
  width: number;
}

/** Portada para libros sin portada extraíble: degradado + libro alado + título en Fraunces. */
export default function GeneratedCover({ title, author, width }: GeneratedCoverProps) {
  const h = hashString(title);
  const angle = 140 + (h % 70);
  const titleSize = Math.max(11, Math.round(width * 0.105));

  return (
    <div
      className={`${paletteClass(title)} grano-papel relative flex size-full flex-col items-center overflow-hidden text-center`}
      style={{
        backgroundColor: 'rgb(var(--pb))',
        backgroundImage: `var(--ruido-papel), linear-gradient(${angle}deg, rgb(var(--pa)), rgb(var(--pb)))`,
        color: 'rgb(var(--pt))',
        padding: `${Math.round(width * 0.1)}px ${Math.round(width * 0.09)}px`,
      }}
    >
      {/* Marco fino */}
      <span
        aria-hidden
        className="pointer-events-none absolute rounded-[3px] border"
        style={{ inset: Math.round(width * 0.05), borderColor: 'rgb(var(--pt) / 0.3)' }}
      />
      <WingedBook
        className="mt-[6%] w-[58%] opacity-90"
        accentClassName="text-[rgb(var(--pb))]"
        starClassName=""
      />
      <p
        className="mt-auto line-clamp-4 font-display font-semibold leading-[1.08] tracking-tight"
        style={{ fontSize: titleSize }}
      >
        {title}
      </p>
      {author && (
        <p
          className="mt-[6%] line-clamp-1 font-sans uppercase tracking-[0.14em] opacity-75"
          style={{ fontSize: Math.max(8, Math.round(width * 0.058)) }}
        >
          {author}
        </p>
      )}
    </div>
  );
}
