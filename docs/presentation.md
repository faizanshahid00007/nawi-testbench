# NAWI TestBench: presentation and visual identity

## Demo route

Open `/demo.html` for a five-step, five-minute presentation guide. It links to the real application and
explains what to demonstrate at each stage:

1. The reporting problem and the connected workflow.
2. A passing and a failing observation in the public interactive test bench (`/#live-lab`).
3. Instrument particulars, laboratory conditions and test observations, with the live readout.
4. Review, report exports, the QR-verified certificate and the public verification page.
5. Versioned rules, traceability and the path to laboratory validation.

The homepage's indicator and the live bench use the application's actual rule-set endpoint; the fallback
constants are the same Table 6 values. A single passing point never claims the instrument passes.

## Identity: "Precision Aurora"

- Ground: deep ink navy (`--bg-0 #070b16`, `--bg-1 #0b1220`) with one accent, teal (`#2dd4bf`);
  the teal → sky gradient (`--grad-brand`) is used only on the logo tile and primary buttons. Emerald and
  coral are reserved for verdicts. Work surfaces in the workbench are light (`--paper #eef1f7`, white cards).
- Logo: `public/brand/mark.svg`, a balance on a teal-to-sky gradient tile; icons in `public/brand/`,
  favicon at `/favicon.ico`.
- Type: Sora (display), Manrope (text and UI), JetBrains Mono (numbers, formulas, the LCD annunciators).
  Loaded from Google Fonts with system fallbacks; the app works offline with the fallbacks.
- Signature element: the seven-segment LCD readout (`public/readout.js`) with its MPE gauge, used on the
  landing hero, the login page, the dashboard rail and every observation form.
- Motion: deliberately minimal for performance. One-time scroll reveals only; no blur filters,
  backdrop blur, parallax or continuous animation. Disabled under `prefers-reduced-motion`.
- Layout: fixed solid navigation, hero with the live indicator, four feature panels, the interactive
  test bench, the five-step workflow, one closing panel. Nothing decorative that does not explain the product.
- Tokens live in `public/site.css` (`:root`), including radii, shadows and easing curves.

## Files

| Page | Files |
|---|---|
| Landing `/` | `index.html`, `landing.css`, `landing.js` |
| Login `/login` | `login.html`, `login.css`, `login.js` |
| Workbench `/app` | `app.html`, `app.css`, `app.js` |
| Presentation guide `/demo.html` | `demo.html`, `demo.css`, `demo.js` |
| The standard `/standards` | `standards.html`, `standards.js` |
| Shared | `site.css`, `chart.js`, `readout.js`, `brand/` |
