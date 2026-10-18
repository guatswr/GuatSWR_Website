<template>
  <div class="misty-lake" aria-hidden="true">
    <svg class="lake-shore" viewBox="0 0 900 320" fill="none" focusable="false">
      <path class="lake-distant-bank" d="M0 210c100-4 122-42 210-34 86 8 111-44 202-40 99 4 125-48 216-34 101 16 167-42 272-38v182H0Z" />
      <path class="lake-near-bank" d="M110 220c86-23 135-4 218-25 89-22 107 4 191-20 113-32 156 2 238-20 55-15 101-10 143-19v122H110Z" />
      <g class="lake-treeline">
        <path d="m525 175 9-19-4 1 8-18 8 18-4-1 9 19Zm32-4 10-22-4 1 9-22 10 22-5-1 11 22Zm44-4 9-21-4 1 9-22 10 22-4-1 10 21Zm46-4 11-27-5 1 11-27 12 27-5-1 12 27Zm51-7 9-22-4 1 10-24 10 24-4-1 9 22Zm38-1 12-27-5 1 12-30 13 30-5-1 12 27Zm56-6 10-25-4 1 11-27 12 27-5-1 11 25Zm48-4 13-30-5 1 12-32 14 32-5-1 12 30Z" />
      </g>
    </svg>

    <svg class="lake-reflections" viewBox="0 0 1440 240" preserveAspectRatio="none" fill="none" focusable="false">
      <g stroke="currentColor" stroke-linecap="round">
        <path d="M1010 27h108m24 0h60M900 45h160m44 0h190M65 71h108m27 0h52m799-1h148M-25 106h146m42 0h92m875-9h120M45 153h200m54 0h93m668-15h82m45 0h178M-40 195h165m36 0h89m740-11h142m40 0h169" />
        <path d="M393 91h42m355 35h48m-315 56h68m121 32h36" opacity=".5" />
      </g>
    </svg>

    <svg class="lake-ice" viewBox="0 0 300 240" fill="none" focusable="false">
      <g class="lake-ice-shard">
        <path d="m160 40 32 52-17 63-35-48Z" />
        <path class="lake-ice-facet" d="m160 40 8 61 7 54-35-48Z" />
        <path class="lake-ice-edge" d="m160 40 8 61 24-9m-24 9-28 6m28-6 7 54" />
      </g>
      <g class="lake-ice-shard" opacity=".65">
        <path d="m235 122 20 18-8 37-22-24Z" />
        <path class="lake-ice-edge" d="m235 122 4 24 16-6m-16 6 8 31m-8-31-14 7" />
      </g>
      <g class="lake-ice-shard" opacity=".45">
        <path d="m91 155 22 15-9 30-24-19Z" />
        <path class="lake-ice-edge" d="m91 155 8 22 14-7m-14 7 5 23m-5-23-19 4" />
      </g>
    </svg>
    <div class="lake-mist" />
    <div class="lake-to-paper" />
  </div>
</template>

<style scoped>
.misty-lake {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  background:
    radial-gradient(ellipse at 12% 12%, var(--lake-mist) 0%, transparent 56%),
    linear-gradient(180deg, var(--section-background) 10%, var(--lake-water) 75%);
}
.lake-shore {
  position: absolute;
  top: 0;
  right: 0;
  width: min(68%, 65rem);
  height: auto;
  mask-image:
    linear-gradient(90deg, transparent, #000 35%),
    linear-gradient(180deg, #000 45%, transparent 85%);
  mask-composite: intersect;
}
.lake-distant-bank { fill: var(--lake-shore); opacity: .16; }
.lake-near-bank { fill: var(--lake-shore); opacity: .11; }
.lake-treeline { fill: var(--lake-shore); opacity: .18; }
.lake-reflections {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 48%;
  color: var(--lake-shore);
  opacity: .16;
}
.lake-ice {
  position: absolute;
  top: .75rem;
  right: 2%;
  width: clamp(11rem, 22vw, 20rem);
  height: auto;
}
.lake-ice-shard { fill: var(--lake-ice); fill-opacity: .16; }
.lake-ice-facet { fill-opacity: .14; }
.lake-ice-edge { fill: none; stroke: var(--lake-ice); stroke-opacity: .28; stroke-width: .9; }
.lake-mist {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 68% 15% at 78% 30%, var(--lake-mist) 12%, transparent 100%),
    radial-gradient(ellipse 60% 13% at 25% 48%, var(--lake-mist) 5%, transparent 100%),
    linear-gradient(180deg, transparent 35%, var(--lake-veil) 60%, transparent 90%);
}
/* End in the exact color of the following chapter, including its night theme. */
.lake-to-paper {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 55%, var(--home-about-background) 100%);
}
@media (max-width: 639px) {
  .lake-shore {
    top: -.5rem;
    right: -5rem;
    width: 35rem;
    max-width: none;
    opacity: .65;
  }
  .lake-ice {
    top: 4rem;
    right: -5rem;
    width: 14rem;
    opacity: .65;
  }
  .lake-reflections { height: 65%; opacity: .11; }
  .lake-mist {
    background:
      radial-gradient(ellipse 120% 12% at 65% 15%, var(--lake-mist), transparent),
      linear-gradient(180deg, transparent 10%, var(--lake-veil) 45%, transparent 90%);
  }
  .lake-to-paper {
    background: linear-gradient(180deg, transparent 75%, var(--home-about-background) 100%);
  }
}
</style>
