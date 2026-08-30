import { cardArt } from '../lib/cardArt.ts';
const CARDS = [
  ['/assets/cards/back-dual-face.webp', '5%', '8%', '-24deg'],
  ['/assets/cards/intrigue-plot.webp', '22%', '72%', '17deg'],
  ['/assets/cards/knight.webp', '39%', '-9%', '-8deg'],
  ['/assets/cards/instant-veto.webp', '55%', '78%', '23deg'],
  ['/assets/cards/treasurer.webp', '73%', '5%', '12deg'],
  ['/assets/cards/back-dual-face.webp', '88%', '62%', '-18deg'],
  ['/assets/cards/joker.webp', '-3%', '58%', '29deg'],
  ['/assets/cards/intrigue-blackbook.webp', '67%', '51%', '-31deg'],
  ['/assets/cards/back-dual-face.webp', '93%', '-5%', '20deg']
] as const;

export function CardBackdrop({ hidden = false }: { hidden?: boolean } = {}) {
  return (
    <div className={`card-backdrop${hidden ? ' card-backdrop--hidden' : ''}`} aria-hidden="true">
      {CARDS.map(([src, left, top, rotate], index) => (
        <img
          key={`${src}-${index}`}
          className="card-backdrop__card"
          /* 512 — под 115 px макета, столько занимает карта фона. */
          src={cardArt(src, 512)}
          alt=""
          decoding="async"
          draggable={false}
          style={{ left, top, transform: `rotate(${rotate})` }}
        />
      ))}
    </div>
  );
}
