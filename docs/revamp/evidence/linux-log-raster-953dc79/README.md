# Public dark logs: bounded visual-deviation decision

2026-10-20. **User approved only this documented pixel exception.**
Direct answer: “接受这一个已记录的像素例外（推荐）”. Implementation and fresh
Windows/Linux verification are recorded in [log 16](../../logs/16-approved-raster/README.md);
the original failing evidence below remains unchanged.

Source: actual Ubuntu [run 39368727728](https://github.com/guatswr/GuatSWR_Website/actions/runs/39368727728),
commit `953dc79f76a12ea1372e5937b9fdb15a69609ef1`, artifact 12240298746,
batch 116, mobile `/logs` dark comparison. Downloaded ZIP SHA256:
`64c83a7519e9f7e3eacee9922a79bee60ef78160b6cf4ae2f2e2dd0ea884f8eb`.
First attempt and CI retry both report the same one-pixel comparison failure.

The existing protocol compares 2291 × 2344 physical pixels with pixelmatch
threshold 0.1 and antialias inclusion disabled. It detects **1 significant
differing pixel**, at `(670,1789)`, on the round avatar border:

| | RGBA |
| --- | --- |
| Archive | 51, 65, 85, 255 |
| Nuxt | 30, 41, 61, 255 |

There are 7924 raw RGBA differences before the existing antialias/threshold
classification; therefore “one pixel” must not be described as byte-identical
images apart from one pixel. Capture geometry and cropping are unchanged; see
[comparison.json](comparison.json). Prior independent Linux runs reproduce the
same significant coordinate/color pair. Matching computed styles and the edge
location suggest a paint/rasterization issue; its exact cause is not proven.

These are original 160 × 160 physical-pixel crops from `(610,1720)`, with no
retouching, scaling, masks or replacement background:

| Archive | Nuxt |
| --- | --- |
| ![Archive avatar border](archive-detail.png) | ![Nuxt avatar border](nuxt-detail.png) |

Approved decision: accept **this documented avatar-border difference only** as a
specific public visual exception. The test must still retain both
original screenshots/diff, require identical capture geometry, allow zero
differences elsewhere, and fail for an additional pixel or a different color/
location. This is not approval to loosen the global threshold, mask an avatar,
alter public styling or skip the comparison. All other comparisons retain zero
unapproved pixels. Other public, performance and security gates remain.

Fresh local Noble/Chromium captures measure a different whole-table width:
2179 cropped / 2181 raw physical pixels, still height 2344 and DPR 2.625.
Both sites have identical geometry within that environment. The significant
pixel remains exactly `(670,1789)` with the same RGBA pair. The guard explicitly
enumerates this measured geometry and the original Ubuntu geometry above;
it does not accept arbitrary image sizes. The first local verification failed
because only the Ubuntu width was enumerated; its raw report is retained.
The subsequent fresh browser run passes with the exact approved pixel still
reported as **one**, not zero. No additional visual difference is authorized.
