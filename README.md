# retrac.space
A little space for all the cool things I've built.

The decorative WebGL2 background selects one of four original shaders and
randomizes eight parameters, hue, and starting time on each page load. There
are no reshuffle controls. It pauses in hidden tabs, shows a still frame for
reduced motion (including live preference changes), and retains the solid CSS
background when WebGL2 is unavailable. Context restoration keeps the same look.

Rendering settings live in `background.js`: 30 FPS, 2x render scale, an eight
million pixel cap, and 0.12 shader seconds per second. The dark overlay in
`styles.css` keeps the headings readable. The script loads once after its canvas
in this static site's `index.html`; it has no dependencies or build step.

The behavior was inspired by Frank Force's
[procedural background](https://github.com/KilledByAPixel/KilledByAPixel.github.io/blob/main/background.js).
That repository has no published license, and its background credits the
[GPL-licensed OS13k](https://github.com/KilledByAPixel/OS13k). This implementation
uses original renderer and shader code under this repository's MIT license;
no code from either source is redistributed here.

Run the regression checks with `node --test tests/*.test.cjs`. Background tests
exercise lifecycle and scheduling with a mocked WebGL context; they do not
validate GPU compilation, visual appearance, or mobile performance.


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
