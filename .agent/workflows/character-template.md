---
description: How to create character pages for the RToC Wiki
---

# Character Page Template

This workflow describes how to create a new character page for the RToC Wiki, matching the established style.

## Structure Overview

Every character page uses:
1. **Theme class on body**: `character-theme-[character-name]` (e.g., `character-theme-seo-eun-hyun`, `character-theme-kim-young-hoon`)
2. **Custom CSS in `<style>` tag**: Theme colors, hero background, gradient title
3. **Hero section**: Background image with character art, title, subtitle
4. **Main content**: Quote, sections (Appearance, Personality, Relationships, Prowess, Trivia, See Also)
5. **Sidebar infobox**: Gradient title, image carousel, info sections (Personal Info, Status, Aliases)

## File Locations

- Character pages: `pages/characters/[character_name].html`
- Character images: `assets/images/[character_name]_*.png`
  - `*_profile.png` - Main portrait for sidebar
  - `*_full.png` - Full body art (can be used for hero background)
  - `*_cover.jpg` - Cover art variant

## Template Code

```html
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>[CHARACTER NAME] | Regressor's Tale of Cultivation Wiki</title>
    <link rel="stylesheet" href="../../styles/main.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600&family=Inter:wght@400;500;600;700&family=Outfit:wght@500;600;700;800&display=swap" rel="stylesheet">
    <script type="module" src="https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.esm.js"></script>
    <style>
        /* [CHARACTER] Theme Override */
        .character-theme-[character-slug] {
            --accent-primary: [PRIMARY_COLOR];      /* e.g., #FFD700 for gold, #0ea5e9 for blue */
            --accent-secondary: [SECONDARY_COLOR];  /* e.g., #FFA500 for orange */
            --text-highlight: [PRIMARY_COLOR];
            background: [BG_COLOR] !important;      /* #050505 for dark, linear-gradient for light */
        }

        /* Hero Background */
        .character-theme-[character-slug] .hero {
            min-height: 60vh;
            background: linear-gradient(to bottom, rgba(0, 0, 0, 0.5) 0%, [BG_COLOR] 100%),
                url('../../assets/images/[character_name]_full.png') center top/cover no-repeat;
        }

        /* Title Gradient */
        .character-theme-[character-slug] .hero-title {
            background: linear-gradient(135deg, [PRIMARY_COLOR], [SECONDARY_COLOR]);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        /* Sidebar Theme */
        .character-theme-[character-slug] .infobox-title {
            background: linear-gradient(135deg, [PRIMARY_COLOR] 0%, [SECONDARY_COLOR] 50%, [PRIMARY_COLOR] 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            filter: drop-shadow(0 2px 4px rgba([RGB_VALUES], 0.3));
            animation: shimmer-[color] 3s ease-in-out infinite;
        }

        .character-theme-[character-slug] .character-sidebar {
            background: rgba(20, 20, 20, 0.8);
            border: 1px solid rgba([RGB_VALUES], 0.15);
            box-shadow: 0 4px 20px rgba([RGB_VALUES], 0.08);
        }

        .character-theme-[character-slug] .infobox-header {
            background: rgba([RGB_VALUES], 0.1);
            color: [PRIMARY_COLOR];
        }

        .character-theme-[character-slug] .character-quote {
            border-left-color: [PRIMARY_COLOR];
            background: linear-gradient(90deg, rgba([RGB_VALUES], 0.05), transparent);
        }

        .character-theme-[character-slug] .section-title {
            color: [PRIMARY_COLOR];
            border-bottom-color: rgba([RGB_VALUES], 0.2);
        }

        @keyframes shimmer-[color] {
            0%, 100% {
                filter: drop-shadow(0 0 20px rgba([RGB_VALUES], 0.5)) drop-shadow(0 2px 8px rgba([RGB_VALUES], 0.3));
            }
            50% {
                filter: drop-shadow(0 0 30px rgba([RGB_VALUES], 0.7)) drop-shadow(0 2px 12px rgba([RGB_VALUES], 0.5));
            }
        }
    </style>
</head>

<body class="character-theme-[character-slug]">

    <nav class="nav" style="background: rgba(10, 10, 15, 0.95); box-shadow: rgba(0, 0, 0, 0.4) 0px 4px 20px;">
        <div class="nav-container">
            <a href="../../index.html" class="nav-logo">
                <div class="nav-logo-icon">R</div>
                RToC Wiki
            </a>
            <ul class="nav-links">
                <li><a href="../../index.html" class="nav-link">Home</a></li>
                <li><a href="../characters.html" class="nav-link" style="color: #ffffff; background: rgba([RGB_VALUES], 0.1);">Characters</a></li>
                <li><a href="../concepts.html" class="nav-link">Concepts</a></li>
                <li><a href="../plot.html" class="nav-link">Plot</a></li>
                <li><a href="../cultivation.html" class="nav-link">Cultivation</a></li>
                <li><a href="../locations.html" class="nav-link">Locations</a></li>
            </ul>
        </div>
    </nav>

    <header class="hero" style="min-height: 40vh; padding-bottom: 2rem;">
        <div class="hero-content">
            <h1 class="hero-title">[CHARACTER NAME]</h1>
            <p class="hero-subtitle">[CHARACTER TITLE/EPITHET]</p>
        </div>
    </header>

    <main class="section">
        <div class="character-layout">
            <!-- Main Content -->
            <div class="character-main" contenteditable="false">
                <div class="character-header">
                    <div class="character-quote">
                        "[MEMORABLE QUOTE FROM CHARACTER]"
                    </div>
                    <div class="spoiler character-section-content revealed">
                        <strong>[CHARACTER NAME]</strong> [INTRODUCTION TEXT]
                    </div>
                    <!-- Add more spoiler sections as needed -->
                </div>

                <div class="character-section-content">
                    <h2 class="section-title">Appearance</h2>
                    <div class="spoiler revealed" style="padding: 1.5rem; min-height: 120px;">
                        <p>[APPEARANCE DESCRIPTION]</p>
                    </div>
                </div>

                <div class="character-section-content">
                    <h2 class="section-title">Personality</h2>
                    <p>[PERSONALITY DESCRIPTION]</p>
                </div>

                <div class="character-section-content">
                    <h2 class="section-title">Relationships</h2>
                    <h3>Allies</h3>
                    <ul style="list-style-type: disc; margin-left: 1.5rem; color: var(--text-secondary); line-height: 1.8;">
                        <li>[ALLY NAME]</li>
                    </ul>

                    <h3>Love Interests</h3>
                    <ul style="list-style-type: disc; margin-left: 1.5rem; color: var(--text-secondary); line-height: 1.8;">
                        <li>[LOVE INTEREST]</li>
                    </ul>
                </div>

                <div class="character-section-content">
                    <h2 class="section-title">Prowess</h2>
                    <div class="infobox-row">
                        <span class="infobox-label">Peak Cultivation</span>
                        <span class="infobox-value">[CULTIVATION LEVEL]</span>
                    </div>
                    <div class="infobox-row">
                        <span class="infobox-label">Peak Martial Realm</span>
                        <span class="infobox-value">[MARTIAL LEVEL]</span>
                    </div>
                </div>

                <div class="character-section-content">
                    <h2 class="section-title">Trivia</h2>
                    <ul style="list-style-type: disc; margin-left: 1.5rem; color: var(--text-secondary); line-height: 1.8;">
                        <li>[TRIVIA FACT]</li>
                    </ul>
                </div>

                <div class="character-section-content" style="margin-top: 3rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 2rem;">
                    <h2 class="section-title">See Also</h2>
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem;">
                        <a href="[related_character].html" class="nav-link" style="display: block; background: var(--bg-secondary); padding: 1rem; border-radius: 8px; text-align: center; border: 1px solid rgba(255,255,255,0.1); transition: all 0.2s;">
                            <div style="font-weight: 600; margin-bottom: 0.5rem; color: var(--text-primary);">[RELATED CHARACTER]</div>
                            <div style="font-size: 0.8em; color: var(--text-secondary);">[THEIR TITLE]</div>
                        </a>
                        <a href="../characters.html" class="nav-link" style="display: block; background: var(--bg-secondary); padding: 1rem; border-radius: 8px; text-align: center; border: 1px solid rgba(255,255,255,0.1); transition: all 0.2s;">
                            <div style="font-weight: 600; margin-bottom: 0.5rem; color: var(--text-primary);">All Characters</div>
                            <div style="font-size: 0.8em; color: var(--text-secondary);">View Full Roster</div>
                        </a>
                    </div>
                </div>
            </div>

            <!-- Sidebar Infobox -->
            <aside class="character-sidebar" style="outline-offset: 4px;">
                <h3 class="infobox-title" contenteditable="false">[CHARACTER NAME]</h3>
                <div class="infobox-image" contenteditable="false">
                    <div class="carousel-container">
                        <div class="carousel-track">
                            <img src="../../assets/images/[character_name]_profile.png" alt="[CHARACTER] (Profile)" class="carousel-img active" data-caption="[CAPTION 1]">
                            <img src="../../assets/images/[character_name]_full.png" alt="[CHARACTER] (Full)" class="carousel-img" data-caption="[CAPTION 2]">
                        </div>
                        <button class="carousel-btn prev" title="Previous"><ion-icon name="chevron-back-outline"></ion-icon></button>
                        <button class="carousel-btn next" title="Next"><ion-icon name="chevron-forward-outline"></ion-icon></button>
                        <div class="carousel-indicators">
                            <span class="dot active" data-index="0"></span>
                            <span class="dot" data-index="1"></span>
                        </div>
                    </div>
                    <div id="carousel-caption" style="text-align: center; font-size: 0.8rem; margin-top: 0.5rem; min-height: 1.2em; font-weight: 500;">[CAPTION 1]</div>
                </div>

                <div class="infobox-section" contenteditable="false">
                    <div class="infobox-header">Personal Info</div>
                    <div class="infobox-row">
                        <span class="infobox-label">Race</span>
                        <span class="infobox-value">[RACE]</span>
                    </div>
                    <div class="infobox-row">
                        <span class="infobox-label">Role</span>
                        <span class="infobox-value">[ROLE]</span>
                    </div>
                    <div class="infobox-row">
                        <span class="infobox-label">Gender</span>
                        <span class="infobox-value">[GENDER]</span>
                    </div>
                    <div class="infobox-row">
                        <span class="infobox-label">Age</span>
                        <span class="infobox-value">[INITIAL AGE]<br>
                            <div class="spoiler revealed">[CURRENT AGE]</div>
                        </span>
                    </div>
                </div>

                <div class="infobox-section" contenteditable="false">
                    <div class="infobox-header">Status</div>
                    <div class="infobox-row">
                        <span class="infobox-label">State</span>
                        <span class="infobox-value">[ALIVE/DECEASED/UNKNOWN]</span>
                    </div>
                    <div class="infobox-row">
                        <span class="infobox-label">Affiliation</span>
                        <span class="infobox-value">[AFFILIATION]</span>
                    </div>
                    <div class="infobox-row">
                        <span class="infobox-label">Rank</span>
                        <span class="infobox-value">[RANK]</span>
                    </div>
                </div>

                <div class="infobox-section" contenteditable="false">
                    <div class="infobox-header">Aliases</div>
                    <div class="aliases-list">
                        <div class="spoiler revealed">
                            [ALIAS 1]<br>
                            [ALIAS 2]<br>
                            [ALIAS 3]
                        </div>
                    </div>
                </div>
            </aside>
        </div>
    </main>

    <script src="../../scripts/editor.js"></script>
    <script src="../../scripts/main.js"></script>

</body>

</html>
```

## Theme Color Reference

| Character | Primary Color | Secondary Color | Background |
|-----------|---------------|-----------------|------------|
| Seo Eun-hyun | #0ea5e9 (Sky Blue) | #03a9f4 | Light gradient |
| Kim Young-hoon | #FFD700 (Gold) | #FFA500 (Orange) | #050505 (Dark) |
| [New Character] | [COLOR] | [COLOR] | [BG] |

## Required Images

For each character, prepare:
1. `[name]_profile.png` - Main sidebar portrait (recommended: 400x500px or similar)
2. `[name]_full.png` - Full body or action shot (used for hero background and carousel)
3. Optional: Additional art variants for carousel

## Steps to Create New Character Page

1. Copy this template to `pages/characters/[character_name].html`
2. Replace all `[PLACEHOLDERS]` with character data
3. Save character images to `assets/images/`
4. Update `pages/characters.html` to add a link to the new character
5. Choose theme colors that fit the character's aesthetic
6. Test the page locally before deploying
