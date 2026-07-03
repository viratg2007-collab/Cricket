import type { Match, MatchSettings, Pair, Player, Team } from './types';
import { DEFAULT_SETTINGS } from './types';
import { TEAM, INNINGS_ID, MATCH_ID, pairId, playerId } from './ids';

export { INNINGS_ID, MATCH_ID };

export const MATCH_SETTINGS: MatchSettings = { ...DEFAULT_SETTINGS };

export const TEAMS: Team[] = [
  { id: TEAM.SS,  name: 'Sparkle Strikers',   short_name: 'SS'  },
  { id: TEAM.NA,  name: "Nishant's Angles",    short_name: 'NA'  },
  { id: TEAM.AS,  name: 'Anay Strikers',       short_name: 'AS'  },
  { id: TEAM.MS,  name: 'Modi Sarkar',         short_name: 'MS'  },
  { id: TEAM.KS,  name: 'Kashvat Strikers',    short_name: 'KS'  },
  { id: TEAM.ATS, name: 'Anita Stars',         short_name: 'ATS' },
];

// ── SS players (1–14) ──────────────────────────────────────────────────
const ssNames = [
  'Disha Sanghvi', 'Mita Donda', 'Diya Lakhani', 'Nishtha',
  'Vanita Nayani', 'Dhun Tejani', 'Nimisha', 'Priyanka Shah',
  'Shikha Mehta', 'Janvi Kakadiya', 'Mamta Desai', 'Heena Korat',
  'Rachna Dugar', 'Priyanka Mehta',
];

// ── NA players (15–28) ─────────────────────────────────────────────────
const naNames = [
  'Siya Shah', 'Hetal Virani', 'Pal Shah', 'Spathika',
  'Devanshi Shah', 'Hetal Javeri', 'Hetal Shah', 'Ankita Mehta',
  'Aarushi', 'Ronak Shah', 'Mitika', 'Divya Kolkur',
  'Parita', 'Nilpa Shah',
];

// ── AS players (29–42) ─────────────────────────────────────────────────
const asNames = [
  'Aarya Sadhani', 'Hetal Gandhi', 'Ayushi Shah', 'Payal Shah',
  'Ahim Shah', 'Viha Variya', 'Raina Mehta', 'Amita Tejani',
  'Bhavika Mehta', 'Angana Javeri', 'Aaniya', 'Swati Jain',
  'Jitakshi', 'Kinjal Dholakia',
];

// ── MS players (43–56) ─────────────────────────────────────────────────
const msNames = [
  'Peher Modi', 'Payal Kothari', 'Jasmina Dhamelia', 'Naisha Sheladiya',
  'Reema Patawari', 'Kashvi Maniyar', 'Urvashi Patel', 'Dipti Shah',
  'Prisha Van', 'Nami Mehta', 'Diya Shah', 'Sajani Kothari',
  'Khushi Shah', 'Brinda Patel',
];

// ── KS players (57–70) ─────────────────────────────────────────────────
const ksNames = [
  'Hiya Gandhi', 'Akanksha', 'Hetal Vanani', 'Shonaya Mehta',
  'Neelam Vanani', 'Myra Shah', 'Bina Mehta', 'Ami Diyang',
  'Vaibhavi', 'Rasila Patel', 'Heena Kothari', 'Nisha',
  'Rani Verma', 'Sejal Shah',
];

// ── ATS players (71–84) ────────────────────────────────────────────────
const atsNames = [
  'Yashvi Shah', 'Ahana Javeri', 'Urvi Mehta', 'Dimple Mavani',
  'Rashi Shah', 'Miloni Sanspara', 'Shayna Shah', 'Daya Patel',
  'Ritika Verma', 'Drisha Doshi', 'Swati Kshirsagar', 'Sharmila Nahata',
  'Saloni Shah', 'Priti Mehta',
];

// captainName lets a team's captain be someone other than the first-listed player
// WITHOUT reordering the roster (player IDs are position-based and must stay stable).
function makePlayers(teamId: string, offset: number, names: string[], captainName?: string): Player[] {
  return names.map((name, i) => ({
    id: playerId(offset + i + 1),
    team_id: teamId,
    name,
    jersey_number: i + 1,
    role: 'allrounder',
    is_captain: captainName ? name === captainName : i === 0,
  }));
}

export const PLAYERS: Player[] = [
  ...makePlayers(TEAM.SS,  0,  ssNames),
  ...makePlayers(TEAM.NA,  14, naNames, 'Hetal Shah'), // captain: Hetal Shah (not first-listed Siya Shah)
  ...makePlayers(TEAM.AS,  28, asNames),
  ...makePlayers(TEAM.MS,  42, msNames),
  ...makePlayers(TEAM.KS,  56, ksNames),
  ...makePlayers(TEAM.ATS, 70, atsNames),
];

export const DEMO_MATCH: Match = {
  id: MATCH_ID,
  name: "Sparkle Strikers vs Nishant's Angles",
  home_team_id: TEAM.SS,
  away_team_id: TEAM.NA,
  settings: MATCH_SETTINGS,
  status: 'live',
};

// SS batting pairs: pair indexes 1–6
export const SS_PAIRS: Pair[] = [
  { id: pairId(1), match_id: MATCH_ID, team_id: TEAM.SS, pair_number: 1, player1_id: playerId(1),  player2_id: playerId(2)  },
  { id: pairId(2), match_id: MATCH_ID, team_id: TEAM.SS, pair_number: 2, player1_id: playerId(3),  player2_id: playerId(4)  },
  { id: pairId(3), match_id: MATCH_ID, team_id: TEAM.SS, pair_number: 3, player1_id: playerId(5),  player2_id: playerId(6)  },
  { id: pairId(4), match_id: MATCH_ID, team_id: TEAM.SS, pair_number: 4, player1_id: playerId(7),  player2_id: playerId(8)  },
  { id: pairId(5), match_id: MATCH_ID, team_id: TEAM.SS, pair_number: 5, player1_id: playerId(9),  player2_id: playerId(10) },
  { id: pairId(6), match_id: MATCH_ID, team_id: TEAM.SS, pair_number: 6, player1_id: playerId(11), player2_id: playerId(12) },
];

// NA batting pairs: pair indexes 7–12 (used when NA bats in innings 2)
export const NA_PAIRS: Pair[] = [
  { id: pairId(7),  match_id: MATCH_ID, team_id: TEAM.NA, pair_number: 1, player1_id: playerId(15), player2_id: playerId(16) },
  { id: pairId(8),  match_id: MATCH_ID, team_id: TEAM.NA, pair_number: 2, player1_id: playerId(17), player2_id: playerId(18) },
  { id: pairId(9),  match_id: MATCH_ID, team_id: TEAM.NA, pair_number: 3, player1_id: playerId(19), player2_id: playerId(20) },
  { id: pairId(10), match_id: MATCH_ID, team_id: TEAM.NA, pair_number: 4, player1_id: playerId(21), player2_id: playerId(22) },
  { id: pairId(11), match_id: MATCH_ID, team_id: TEAM.NA, pair_number: 5, player1_id: playerId(23), player2_id: playerId(24) },
  { id: pairId(12), match_id: MATCH_ID, team_id: TEAM.NA, pair_number: 6, player1_id: playerId(25), player2_id: playerId(26) },
];

export const DEMO_INNINGS_ID = INNINGS_ID;
