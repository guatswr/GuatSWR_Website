<template>
  <div class="misty-lake" aria-hidden="true">
    <div class="lake-surface">
      <div class="lake-light" />
    </div>
    <div class="lake-to-paper" />
  </div>
</template>

<style scoped>
.misty-lake {
  --lake-surface: #f8f8f5;
  --lake-blue: rgb(137 171 232 / 0.56);
  --lake-blue-soft: rgb(181 204 240 / 0.28);
  --lake-rose: rgb(221 148 159 / 0.39);
  --lake-rose-soft: rgb(238 201 202 / 0.24);
  --lake-gold: rgb(224 201 126 / 0.34);
  --lake-ice: rgb(191 219 224 / 0.2);
  --lake-light: rgb(250 250 247 / 0.76);
  --lake-edge: rgb(255 255 255 / 0.6);
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  background: var(--section-background);
}
/* Broad color fields soften into the reading surface. There are no tiled
   textures, hard illustration edges or animated filters behind the text. */
.lake-surface {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background:
    radial-gradient(ellipse 65% 98% at 108% -8%, var(--lake-blue) 0%, var(--lake-blue-soft) 39%, transparent 76%),
    radial-gradient(ellipse 65% 96% at -9% 110%, var(--lake-rose) 0%, var(--lake-rose-soft) 42%, transparent 78%),
    radial-gradient(ellipse 52% 65% at 53% 113%, var(--lake-gold) 0%, transparent 76%),
    radial-gradient(ellipse 42% 65% at 95% 103%, var(--lake-ice), transparent 82%),
    var(--lake-surface);
}
.lake-light {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 49% 82% at 39% 24%, var(--lake-light), transparent 82%),
    linear-gradient(150deg, var(--lake-light), transparent 48%);
}
/* Fade back to the next chapter's paper, keeping the section boundary quiet. */
.lake-to-paper {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 84%, var(--home-about-background) 100%);
}
:global(.dark .misty-lake) {
  --lake-surface: #19222d;
  --lake-blue: rgb(75 105 168 / 0.46);
  --lake-blue-soft: rgb(54 79 130 / 0.24);
  --lake-rose: rgb(146 77 108 / 0.32);
  --lake-rose-soft: rgb(100 64 88 / 0.2);
  --lake-gold: rgb(133 123 66 / 0.2);
  --lake-ice: rgb(63 116 132 / 0.14);
  --lake-light: rgb(26 35 45 / 0.84);
  --lake-edge: rgb(169 194 222 / 0.08);
}
@media (min-width: 1280px) {
  .lake-surface {
    inset: 1.25rem;
    border: 1px solid var(--lake-edge);
    border-radius: clamp(1.5rem, 2.3vw, 2.5rem);
  }
}
@media (max-width: 639px) {
  .lake-surface {
    background:
      radial-gradient(ellipse 130% 48% at 125% -3%, var(--lake-blue) 0%, var(--lake-blue-soft) 44%, transparent 78%),
      radial-gradient(ellipse 120% 50% at -32% 104%, var(--lake-rose) 0%, var(--lake-rose-soft) 44%, transparent 80%),
      radial-gradient(ellipse 100% 35% at 66% 110%, var(--lake-gold), transparent 78%),
      var(--lake-surface);
  }
  .lake-light {
    background: radial-gradient(ellipse 120% 55% at 0% 30%, var(--lake-light), transparent 90%);
  }
  .lake-to-paper {
    background: linear-gradient(180deg, transparent 92%, var(--home-about-background) 100%);
  }
}
</style>
