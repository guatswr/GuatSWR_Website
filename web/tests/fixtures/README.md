The `noto-sans-sc-{400,600}.ttf` files are Google Fonts Noto Sans SC subsets
containing only the Chinese characters in the foundation smoke page. Source:
`https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;600&text=桂航绯想天桂林航天工业学院东方同好社群`
(retrieved 2026-10-18). Distributed under the accompanying SIL Open Font License.

Only Playwright screenshot tests inject these local fonts. Production keeps the
system font stack and never downloads or serves these fixture assets.
