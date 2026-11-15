# retrac.space
A little space for all the cool things I've built.

The experimental homepage lives at `/home-v2/` (static entry point:
`home-v2/index.html`). It is a three.js solar system: the sun is the bio and
each project is a planet. Drag to look around, click a planet to fly to it,
and click it again (or use the panel link) to visit the project. The planet
list at the bottom does the same from the keyboard. Without WebGL, the page
shows the bio and plain project links instead. Click a title letter to drop
the letters, or enter the Konami code (↑ ↑ ↓ ↓ ← → ← → B A) for warp speed.
With reduced motion (system setting or `?reduce_motion=true`), orbits stand
still, camera moves are instant and previews stay paused. There is no motion
toggle.

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
