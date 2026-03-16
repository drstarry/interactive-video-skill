# Interactive Video Skill

**[Live Demo](https://drstarry.github.io/interactive-video-skill/)** — 8 example walkthroughs across all themes.

Turn docs, posts, and codebases into interactive walkthroughs — narrated animation, quizzes, and hands-on widgets. Built as a [Claude Code](https://docs.anthropic.com/en/docs/claude-code) skill. Output is vanilla HTML/JS/CSS — zero dependencies, works in any browser.

## Who is this for?

Best when the audience needs to get oriented quickly — newcomers who don't yet know what to ask, or teams absorbing required material efficiently:

- **Onboarding & compliance** — turn a 20-page doc into a 5-minute walkthrough new hires actually complete
- **Beginner overviews** — give newcomers the big picture with enough practice to actually remember it
- **Open source projects** — generate walkthroughs from docs; regenerate each release so they stay current
- **Knowledge transfer** — when someone leaves, turn their notes into something a replacement can absorb quickly
- **Blog post / talk companions** — offer an interactive version alongside the written post for people who prefer video

No video editing. No API keys. No manual setup.

## Install

Paste this into Claude Code:

```
Install the interactive-video skill from https://github.com/drstarry/interactive-video-skill into ~/.claude/skills/interactive-video and run its setup script
```

## Use

```
/interactive-video https://example.com/blog-post
/interactive-video walk through the auth system in this codebase
/interactive-video turn our onboarding doc into a walkthrough ~/docs/new-hire-guide.md
```

Claude researches your source, opens a configurator for preferences (audience, theme, voice, language), then generates the entire walkthrough automatically.

## What You Get

A self-contained HTML walkthrough with canvas animations, narrated audio (400+ voices, 50+ languages), quizzes with misconception-based feedback, and interactive widgets (drag-to-sort, categorize, slider, hotspot). 8 visual themes from Terminal to Notebook to Clean Light.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `edge-tts: command not found` | Claude runs setup automatically on first use. If PATH is wrong, add `~/.local/bin` to PATH |
| Configurator won't open | `pkill -f http-server` then retry |
| Canvas blank | Check browser console (F12) — usually missing engine files, re-run the skill |

## License

GPL-3.0
