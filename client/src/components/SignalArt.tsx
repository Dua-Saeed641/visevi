/**
 * Hero artwork, white line-art on the red hero: a sensor reading on a map
 * (contour lines, a pin with pulsing rings and a temperature scale), a
 * satellite on its orbit sending a beam down to the site, and a small
 * before/after frame. It is the whole product in one picture: signal, capture,
 * comparison. Drawn as real SVG (not an image), so nothing about it blocks
 * text selection. Motion is CSS and switches off for reduced-motion users.
 */
export function SignalArt({ className = '' }: { className?: string }) {
  const contours = [
    'M110 300 C 130 240, 190 215, 250 232 S 350 200, 405 250 S 470 330, 420 372 S 300 405, 235 385 S 90 360, 110 300 Z',
    'M148 300 C 165 255, 205 240, 252 252 S 335 228, 380 265 S 430 322, 392 354 S 300 378, 248 362 S 130 342, 148 300 Z',
    'M190 300 C 205 270, 232 262, 262 270 S 322 254, 350 280 S 384 318, 358 338 S 292 350, 258 342 S 176 328, 190 300 Z',
    'M228 302 C 238 286, 254 282, 272 287 S 306 280, 322 296 S 338 314, 322 322 S 288 328, 270 324 S 218 316, 228 302 Z',
  ]
  return (
    <svg viewBox="0 0 560 560" className={className} role="img" aria-label="A temperature reading on a map, a satellite sending a beam to the site, and a before and after comparison" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <clipPath id="sa-disc"><circle cx="280" cy="292" r="190" /></clipPath>
      </defs>

      <style>{`
        @keyframes sa-pulse { 0% { transform: scale(0.35); opacity: 0.9 } 100% { transform: scale(1.35); opacity: 0 } }
        @keyframes sa-flow { to { stroke-dashoffset: -28 } }
        @keyframes sa-orbit { to { stroke-dashoffset: -60 } }
        .sa-ring { transform-origin: 340px 258px; animation: sa-pulse 3.2s ease-out infinite }
        .sa-ring.b { animation-delay: 1.07s } .sa-ring.c { animation-delay: 2.13s }
        .sa-beam { animation: sa-flow 1.4s linear infinite }
        .sa-orbit { animation: sa-orbit 9s linear infinite }
        @media (prefers-reduced-motion: reduce) { .sa-ring, .sa-beam, .sa-orbit { animation: none } .sa-ring { opacity: 0.35; transform: scale(0.9) } }
      `}</style>

      {/* globe: graticule and contour lines */}
      <circle cx="280" cy="292" r="190" strokeWidth="2" />
      <g clipPath="url(#sa-disc)">
        <g strokeWidth="1" opacity="0.22">
          <ellipse cx="280" cy="292" rx="190" ry="60" />
          <ellipse cx="280" cy="292" rx="190" ry="120" />
          <ellipse cx="280" cy="292" rx="60" ry="190" />
          <ellipse cx="280" cy="292" rx="120" ry="190" />
          <line x1="90" y1="292" x2="470" y2="292" />
          <line x1="280" y1="102" x2="280" y2="482" />
        </g>
        <g strokeWidth="1.6">
          {contours.map((d, i) => <path key={i} d={d} opacity={0.34 + i * 0.13} />)}
        </g>
      </g>

      {/* temperature scale */}
      <g>
        <line x1="52" y1="150" x2="52" y2="430" strokeWidth="2" />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <line key={i} x1={i % 2 === 0 ? 40 : 46} x2="52" y1={150 + i * 40} y2={150 + i * 40} strokeWidth="1.6" opacity="0.8" />
        ))}
        <g fill="#fff" stroke="none" fontFamily="Helvetica, Arial, sans-serif" fontSize="14" fontWeight="700" opacity="0.85">
          <text x="14" y="155">45</text><text x="14" y="235">35</text><text x="14" y="315">25</text><text x="14" y="395">15</text>
        </g>
        <path d="M64 196 L84 206 L64 216 Z" fill="#fff" stroke="none" />
        <line x1="84" y1="206" x2="304" y2="252" strokeWidth="1.4" strokeDasharray="3 6" opacity="0.7" />
      </g>

      {/* the site: pulsing rings and a pin */}
      <g>
        <circle className="sa-ring" cx="340" cy="258" r="70" strokeWidth="2" />
        <circle className="sa-ring b" cx="340" cy="258" r="70" strokeWidth="2" />
        <circle className="sa-ring c" cx="340" cy="258" r="70" strokeWidth="2" />
        <path d="M340 296 C 322 272, 314 262, 314 248 A 26 26 0 1 1 366 248 C 366 262, 358 272, 340 296 Z" fill="#fff" stroke="none" />
        <circle cx="340" cy="247" r="10" fill="#d6111e" stroke="none" />
      </g>

      {/* reading label */}
      <g>
        <rect x="384" y="270" width="98" height="38" rx="8" fill="#d6111e" strokeWidth="2" />
        <text x="433" y="295" textAnchor="middle" fill="#fff" stroke="none" fontFamily="Helvetica, Arial, sans-serif" fontSize="20" fontWeight="700">41.3 °C</text>
      </g>

      {/* orbit, satellite and beam */}
      <g transform="rotate(-24 280 292)">
        <ellipse className="sa-orbit" cx="280" cy="292" rx="262" ry="96" strokeWidth="1.6" strokeDasharray="4 10" opacity="0.7" />
      </g>
      <g transform="translate(468 108) rotate(28)">
        <rect x="-11" y="-8" width="22" height="16" rx="2" fill="#d6111e" strokeWidth="2.2" />
        <rect x="-44" y="-6" width="28" height="12" fill="#d6111e" strokeWidth="2" />
        <rect x="16" y="-6" width="28" height="12" fill="#d6111e" strokeWidth="2" />
        <line x1="-30" y1="-6" x2="-30" y2="6" strokeWidth="1.2" /><line x1="30" y1="-6" x2="30" y2="6" strokeWidth="1.2" />
        <line x1="0" y1="8" x2="0" y2="16" strokeWidth="2" /><circle cx="0" cy="18" r="2.4" fill="#fff" stroke="none" />
      </g>
      <line className="sa-beam" x1="456" y1="128" x2="352" y2="240" strokeWidth="2.2" strokeDasharray="10 6" />

      {/* before / after frame */}
      <g>
        <rect x="360" y="392" width="170" height="112" rx="10" fill="#d6111e" strokeWidth="2.2" />
        <line x1="445" y1="392" x2="445" y2="504" strokeWidth="1.6" strokeDasharray="4 5" />
        <path d="M372 470 C 390 440, 410 452, 428 428" strokeWidth="1.6" opacity="0.75" />
        <path d="M372 486 C 394 462, 414 474, 432 452" strokeWidth="1.6" opacity="0.5" />
        <path d="M459 470 C 474 458, 490 462, 516 430" strokeWidth="1.6" opacity="0.75" />
        <path d="M459 486 C 476 476, 494 480, 518 452" strokeWidth="1.6" opacity="0.5" />
        <g fill="#fff" stroke="none" fontFamily="Helvetica, Arial, sans-serif" fontSize="11" fontWeight="700" letterSpacing="1.4">
          <text x="372" y="412">BEFORE</text><text x="459" y="412">AFTER</text>
        </g>
        <line x1="340" y1="296" x2="400" y2="392" strokeWidth="1.4" strokeDasharray="3 6" opacity="0.7" />
      </g>
    </svg>
  )
}
