# retrac.space
A little space for all the cool things I've built.

The experimental homepage lives at `/home-v2/` (static entry point:
`home-v2/index.html`). It has the same copy, links and videos as the original,
drawn as a three.js scene: the logo and headings are voxels sampled from the
real font, and the project cards are thick slabs with the pixel-ripple video
face. The DOM keeps the real text, links and buttons underneath, and the plain
page shows if WebGL is unavailable. Click a logo letter to send the letters
tumbling in 3D, or enter the Konami code (↑ ↑ ↓ ↓ ← → ← → B A) to shatter the
logo. Animations follow the system reduced-motion preference and the existing
`?reduce_motion=true` override. There is no motion toggle.

Run the non-browser checks with `node --test tests/*.test.cjs`.

> [!IMPORTANT]
> **Source Available — MIT Licensed**
>
> This repository contains the source code for [retrac.space](https://retrac.space), my personal website.
>
> You're welcome to explore, [fork](https://github.com/retracdev/space/fork), modify, and use the code for your own projects, including commercial ones, as long as you retain the required copyright and license notices. Visible credit is appreciated, but not required.
>
> This repository is not accepting public contributions. Only authorized collaborators can make changes to the original project.
>
> For full terms and permissions, see the [MIT License](./LICENSE).
