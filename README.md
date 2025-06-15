project:
  name: BetIQ
  description: >
    BetIQ is a smart, data-driven sports prediction platform. 
    It combines real-time odds, injury reports, travel distances, win/loss streaks, 
    and public betting trends to generate confidence-based predictions and betting insights.
  author: Rufaro Tafamombe
  github: https://github.com/Tafamomber/BetIQ
  features:
    - Live sportsbook odds
    - AI-generated confidence scores
    - Injury integration with player weighting
    - Win/loss streak analysis
    - Head-to-head stats and betting trends
    - Saved user picks and favorites
    - Responsive UI with dark theme and green branding

setup:
  steps:
    - git clone https://github.com/Tafamomber/BetIQ.git
    - cd BetIQ
    - Open index.html in your browser

api_keys:
  odds_api: your-oddsapi-key
  basketball_api: your-rapidapi-key
  balldontlie_api: your-balldontlie-key

file_structure:
  - index.html: Main dashboard
  - profile.html: User profile and saved picks
  - admin.html: Admin features (optional)
  - ai_predictor.js: AI prediction engine
  - scripts.js: UI and API scripts
  - styles.css: Full app styling
  - logo.png: BetIQ branding
  - README.md: Markdown documentation

future_plans:
  - Add NFL and MLB support
  - Build a backend with user authentication
  - Visual charts and betting history

contributing: >
  Contributions are welcome. Fork the repo and open a pull request.
