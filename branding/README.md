# Ubuntu Ultimate branding

- `ubuntu-ultimate-logo.jpeg`, `ubuntu-ultimate-full.jpeg`: the original artwork (2048 × 2048).
- App assets cut from it live in `mobile/assets/images/` (icon, Android adaptive icon, splash, favicon, `logo-mark.png`).

## Colours (sampled from the logo)

| Use | Hex |
| --- | --- |
| Navy circle | `#46566E` |
| Wordmark / dark UI (`colors.night`) | `#293750` |
| Disc terracotta | `#D47D57` |
| Buttons and links (`colors.brand`, darker for contrast) | `#B4532C` |
| Background (`colors.bg`) | `#F4F7F8` |

Every text/background pair in `mobile/src/ui/theme.ts` passes WCAG AA contrast (4.5:1), which matters for outdoor use.
