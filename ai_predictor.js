const apiKey = '581a7cdb1a504856b6880570dab1f0b2';
const oddsApiKey = '4ff95e462539a36bd65aa7ff5fd7cd08';
const balldontlieKey = '98f3aa26-1f60-4cd9-9187-02798cd07086';
const cache = {};

async function calculateConfidence(game, league) {
  const key = `${game.home_team}-${game.away_team}-${league}`;
  if (cache[key]) return cache[key];

  let confidence = 50;
  const reasons = [];

  const injuryImpact = await getInjuryPenalty(game.home_team, game.away_team, league, reasons);
  const winStreakImpact = await getWinStreakBonus(game.home_id, game.away_id, reasons);
  const h2hImpact = await getHeadToHeadBonus(game.home_id, game.away_id, reasons);
  const publicBetImpact = await getPublicBettingBonus(game.id, game.home_team, game.away_team, reasons);
  const travelImpact = getTravelPenalty(game.home_team, game.away_team, reasons);

  confidence += winStreakImpact + h2hImpact + publicBetImpact - injuryImpact - travelImpact;
  confidence = Math.max(1, Math.min(99, Math.round(confidence)));

  const prediction = confidence >= 50 ? `${game.home_team} likely to win` : `${game.away_team} likely to win`;
  const result = { confidence, prediction, reasons };

  cache[key] = result;
  return result;
}

// ------------------ INJURY (REAL PLAYER WEIGHT) ------------------ //
async function getInjuryPenalty(home, away, league, reasons) {
  try {
    const res = await fetch(`https://api-basketball.p.rapidapi.com/injuries?league=${getLeagueId(league)}&season=2024`, {
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'api-basketball.p.rapidapi.com'
      }
    });
    const data = await res.json();
    let penalty = 0;

    for (const injury of data.response) {
      const team = injury.team.name;
      if (team === home || team === away) {
        const weight = await getPlayerRoleWeight(injury.player.name);
        reasons.push(`${injury.player.name} is injured (${team}) — Role Weight: ${weight}`);
        penalty += weight;
      }
    }
    return penalty;
  } catch (e) {
    console.error('Injury fetch error:', e);
    return 0;
  }
}

async function getPlayerRoleWeight(playerName) {
  try {
    const res = await fetch(`https://www.balldontlie.io/api/v1/players?search=${encodeURIComponent(playerName)}`, {
      headers: { Authorization: balldontlieKey }
    });
    const players = await res.json();
    const player = players.data[0];
    if (!player) return 1;

    const statsRes = await fetch(`https://www.balldontlie.io/api/v1/season_averages?season=2024&player_ids[]=${player.id}`, {
      headers: { Authorization: balldontlieKey }
    });
    const stats = await statsRes.json();
    const mpgStr = stats.data[0]?.min || "0:00";
    const mpg = parseInt(mpgStr.split(":")[0]);

    if (mpg >= 30) return 10;
    if (mpg >= 20) return 5;
    return 1;
  } catch (e) {
    console.error("balldontlie error for", playerName, e);
    return 1;
  }
}

// ------------------ OTHER FACTORS ------------------ //
async function getWinStreakBonus(homeId, awayId, reasons) {
  const home = await fetchTeamLastFive(homeId);
  const away = await fetchTeamLastFive(awayId);
  const homeWins = home.filter(g => g.win).length;
  const awayWins = away.filter(g => g.win).length;

  reasons.push(`Home is ${homeWins}-2 in last 5`);
  reasons.push(`Away is ${awayWins}-2 in last 5`);
  return (homeWins - awayWins) * 2;
}

async function fetchTeamLastFive(teamId) {
  try {
    const res = await fetch(`https://api-basketball.p.rapidapi.com/games?team=${teamId}&last=5`, {
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'api-basketball.p.rapidapi.com'
      }
    });
    const data = await res.json();
    return data.response.map(g => ({
      win: g.teams.home.id === teamId
        ? g.scores.home.total > g.scores.away.total
        : g.scores.away.total > g.scores.home.total
    }));
  } catch (e) {
    console.error('Last five fetch error:', e);
    return [];
  }
}

async function getHeadToHeadBonus(homeId, awayId, reasons) {
  try {
    const res = await fetch(`https://api-basketball.p.rapidapi.com/games?h2h=${homeId}-${awayId}`, {
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'api-basketball.p.rapidapi.com'
      }
    });
    const data = await res.json();
    const games = data.response.slice(0, 10);
    const homeWins = games.filter(g => g.teams.home.id === homeId && g.scores.home.total > g.scores.away.total).length;
    const awayWins = games.filter(g => g.teams.away.id === awayId && g.scores.away.total > g.scores.home.total).length;

    reasons.push(`H2H: Home won ${homeWins}, Away won ${awayWins}`);
    return homeWins - awayWins;
  } catch (e) {
    console.error('H2H fetch error:', e);
    return 0;
  }
}

async function getPublicBettingBonus(eventId, home, away, reasons) {
  try {
    const res = await fetch(`https://api.the-odds-api.com/v4/sports/basketball_nba/events/${eventId}/odds/?regions=us&markets=h2h&apiKey=${oddsApiKey}`);
    const data = await res.json();
    const h2h = data.bookmakers[0].markets.find(m => m.key === 'h2h');
    const homePercent = h2h.outcomes.find(o => o.name === home).price;
    const awayPercent = h2h.outcomes.find(o => o.name === away).price;

    reasons.push(`Public: ${home} ${homePercent}%, ${away} ${awayPercent}%`);
    return homePercent > awayPercent ? 3 : -3;
  } catch (e) {
    console.error('Public odds fetch error:', e);
    return 0;
  }
}

// ------------------ TRAVEL ------------------ //
function getTravelPenalty(homeTeam, awayTeam, reasons) {
  const homeCoords = teamCoordinates[homeTeam];
  const awayCoords = teamCoordinates[awayTeam];
  if (!homeCoords || !awayCoords) return 0;

  const distance = getDistance(homeCoords, awayCoords);
  if (distance > 1000) {
    reasons.push(`${awayTeam} traveling ${Math.round(distance)} miles — penalty`);
    return 5;
  } else if (distance > 500) {
    reasons.push(`${awayTeam} traveling ${Math.round(distance)} miles`);
    return 2;
  } else {
    reasons.push(`${awayTeam} short travel (${Math.round(distance)} miles)`);
    return 0;
  }
}

function getDistance([lat1, lon1], [lat2, lon2]) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getLeagueId(league) {
  switch (league) {
    case "NBA": return 12;
    case "NFL": return 62;
    case "MLB": return 1;
    default: return 12;
  }
}
