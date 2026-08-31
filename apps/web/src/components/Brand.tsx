const SRC = '/assets/brand/logo.webp';
const ALT = 'Кингслер — битва за престол';

type BrandSize = 'nav' | 'bar' | 'hero';

export function Brand({
  subtitle,
  size = 'hero'
}: {
  subtitle?: string;
  size?: BrandSize;
}) {
  const cls = size === 'bar' ? 'brand' : `brand brand--${size}`;
  return (
    <div className={cls}>
      <img className="brand__logo" src={SRC} alt={ALT} draggable={false} />
      {subtitle ? <div className="brand__sub">{subtitle}</div> : null}
    </div>
  );
}
