<script setup>
// Original illustrations share a 64px canvas, a 2px stroke and a similar footprint.
defineProps({ name: { type: String, default: 'duel' } })
</script>

<template>
  <svg
    viewBox="0 0 64 64"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <g v-if="name === 'duel'">
      <path class="interest-icon-wash" d="M11 36h42l4 11-4 7H11l-4-7 4-11Z" />
      <path d="M11 36h42l4 11-4 7H11l-4-7 4-11Zm-4 11h50" />
      <g class="icon-joystick">
        <path d="M21 25v14" />
        <circle cx="21" cy="19" r="6" class="interest-icon-accent" />
      </g>
      <path d="M15 39h12" />
      <circle cx="39" cy="41" r="2.5" />
      <circle cx="48" cy="41" r="2.5" />
      <path class="interest-icon-accent" d="m46 10 3 5-3 5-3-5 3-5Z" />
      <path d="M36 23h4m-6 5h3" opacity=".45" />
    </g>
    <g v-else-if="name === 'danmaku'">
      <path class="interest-icon-wash" d="m32 36 8 17-8-4-8 4 8-17Z" />
      <path d="m32 36 8 17-8-4-8 4 8-17Z" />
      <circle cx="32" cy="44" r="1.5" class="interest-icon-accent" />
      <g class="interest-icon-accent icon-bullets">
        <ellipse cx="32" cy="12" rx="2.5" ry="4" />
        <ellipse cx="19" cy="17" rx="2.5" ry="4" transform="rotate(-28 19 17)" />
        <ellipse cx="45" cy="17" rx="2.5" ry="4" transform="rotate(28 45 17)" />
        <ellipse cx="10" cy="28" rx="2.5" ry="4" transform="rotate(-52 10 28)" />
        <ellipse cx="54" cy="28" rx="2.5" ry="4" transform="rotate(52 54 28)" />
        <ellipse cx="26" cy="22" rx="1.75" ry="3.25" transform="rotate(-16 26 22)" />
        <ellipse cx="38" cy="22" rx="1.75" ry="3.25" transform="rotate(16 38 22)" />
        <ellipse cx="10" cy="42" rx="2" ry="3.5" transform="rotate(-65 10 42)" />
        <ellipse cx="54" cy="42" rx="2" ry="3.5" transform="rotate(65 54 42)" />
      </g>
      <path d="M20 35a14 14 0 0 1 24 0M16 43h3m26 0h3M32 24v4" opacity=".45" />
    </g>
    <g v-else-if="name === 'music'">
      <circle cx="27" cy="32" r="19" class="interest-icon-wash" />
      <path d="M45 26a19 19 0 1 0-9 23" />
      <g class="icon-record">
        <path d="M20 20a14 14 0 0 1 14-1M14 36a14 14 0 0 0 9 9" opacity=".45" />
        <circle cx="27" cy="32" r="7" />
        <circle cx="27" cy="32" r="1.5" class="interest-icon-accent" />
      </g>
      <path class="interest-icon-accent" d="M46 42V18l11-3v23M46 24l11-3" />
      <ellipse cx="42" cy="43" rx="4" ry="3" class="interest-icon-accent" />
      <ellipse cx="53" cy="39" rx="4" ry="3" class="interest-icon-accent" />
    </g>
    <g v-else>
      <path class="interest-icon-wash" d="M12 10h22l11 11v33H12V10Z" />
      <path d="M45 36v18H12V10h22l7 7M33 10v12h8M19 23h6m-6 7h5m-5 17h5" />
      <g class="icon-pen">
        <path class="interest-icon-accent" d="m28 42 3-10 20-20a3.5 3.5 0 0 1 5 5L36 37l-8 5Zm3-10 5 5m12-22 5 5" />
      </g>
      <path d="M49 47h7m-3.5-3.5v7" opacity=".45" />
    </g>
  </svg>
</template>

<style scoped>
.interest-icon-wash {
  fill: var(--interest-accent, currentColor);
  fill-opacity: 0.08;
  stroke: none;
}
.interest-icon-accent {
  color: var(--interest-accent, currentColor);
}
/* Animate the meaningful parts only; the 64px icon canvas stays aligned. */
.icon-joystick { transform-origin: 21px 39px; }
.icon-bullets { transform-origin: 32px 44px; }
.icon-record { transform-origin: 27px 32px; }
.icon-pen { transform-origin: 28px 42px; }
@media (prefers-reduced-motion: no-preference) {
  .icon-joystick,
  .icon-bullets,
  .icon-record,
  .icon-pen {
    transform-box: view-box;
    transition: transform 650ms cubic-bezier(.22, 1, .36, 1);
  }
  .interest-link:focus-visible .icon-joystick { transform: rotate(-12deg); }
  .interest-link:focus-visible .icon-bullets { transform: scale(1.08); }
  .interest-link:focus-visible .icon-record { transform: rotate(70deg); }
  .interest-link:focus-visible .icon-pen { transform: rotate(-7deg); }
}
@media (hover: hover) and (prefers-reduced-motion: no-preference) {
  .interest-link:hover .icon-joystick { transform: rotate(-12deg); }
  .interest-link:hover .icon-bullets { transform: scale(1.08); }
  .interest-link:hover .icon-record { transform: rotate(70deg); }
  .interest-link:hover .icon-pen { transform: rotate(-7deg); }
}
</style>
