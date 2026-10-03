// Parses the Match Schedule sheet. This is the only trusted source for fixtures
// (the Group Fixtures sheet has errors).
import ExcelJS from "exceljs";
import { SCHEDULE_FILE, SCHEDULE_SHEET, SHORT_CODES, THIMPHU_OFFSET } from "./config";
import type { Database } from "../../src/lib/supabase/database.types";

type Stage = Database["public"]["Enums"]["match_stage"];
type SlotSource = Database["public"]["Enums"]["slot_source"];

export type ParsedTeam = { slot: string; group_code: string; short_code: string; name: string };

type Source = { kind: SlotSource; group?: string; label?: string };

export type ParsedMatch = {
  id: number;
  stage: Stage;
  group_code: string | null;
  slot_label: string | null;
  kickoff_at: string;
  home_slot: string | null;
  away_slot: string | null;
  home: Source | null;
  away: Source | null;
  notes: string | null;
};

const STAGES: Record<string, Stage> = {
  "Group Stage": "group",
  "Round of 16": "round_of_16",
  "Quarter-Final": "quarter_final",
  "Semi-Final": "semi_final",
  "3rd Place Match": "third_place",
  Final: "final",
};

function text(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object" && "richText" in value) return value.richText.map((r) => r.text).join("").trim();
  if (typeof value === "object" && "result" in value) return String(value.result ?? "").trim();
  return String(value).trim();
}

// Date cells come back as UTC-midnight Dates, or as Excel serial numbers.
function isoDate(value: ExcelJS.CellValue): string {
  let date: Date;
  if (value instanceof Date) date = value;
  else if (typeof value === "number") date = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
  else throw new Error(`Unexpected date cell: ${JSON.stringify(value)}`);
  return date.toISOString().slice(0, 10);
}

// "6:30 PM - 8:30 PM" -> "18:30"
function startTime(range: string): string {
  const m = range.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) throw new Error(`Unexpected time: ${range}`);
  let hour = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") hour += 12;
  return `${String(hour).padStart(2, "0")}:${m[2]}`;
}

function parseSource(label: string): Source {
  let m = label.match(/^Winner Group ([A-H])$/);
  if (m) return { kind: "group_winner", group: m[1] };
  m = label.match(/^Runner-up Group ([A-H])$/);
  if (m) return { kind: "group_runner_up", group: m[1] };
  m = label.match(/^(Winner|Loser) (R16-M\d|QF\d|SF\d)$/);
  if (m) return { kind: m[1] === "Winner" ? "match_winner" : "match_loser", label: m[2] };
  throw new Error(`Unrecognised knockout source: ${label}`);
}

export async function readSchedule(): Promise<{ teams: ParsedTeam[]; matches: ParsedMatch[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(SCHEDULE_FILE);
  const sheet = workbook.getWorksheet(SCHEDULE_SHEET);
  if (!sheet) throw new Error(`Sheet "${SCHEDULE_SHEET}" not found in ${SCHEDULE_FILE}`);

  const teams = new Map<string, ParsedTeam>();
  const matches: ParsedMatch[] = [];
  const labelCounters: Record<string, number> = { quarter_final: 0, semi_final: 0 };
  let stage: Stage = "group";

  sheet.eachRow((row) => {
    const id = row.getCell(1).value;
    if (typeof id !== "number") return; // titles, section headers, rest days

    // The Stage column is only filled on the first row of each section.
    const stageText = text(row.getCell(5).value);
    if (stageText) {
      const s = STAGES[stageText];
      if (!s) throw new Error(`Unknown stage "${stageText}" on match ${id}`);
      stage = s;
    }

    const groupOrSlot = text(row.getCell(6).value);
    const team1 = text(row.getCell(7).value);
    const team2 = text(row.getCell(8).value);
    const kickoff_at = `${isoDate(row.getCell(2).value)}T${startTime(text(row.getCell(4).value))}:00${THIMPHU_OFFSET}`;
    const notes = text(row.getCell(11).value) || null;

    if (stage === "group") {
      for (const [slot, name] of [[team1, text(row.getCell(9).value)], [team2, text(row.getCell(10).value)]]) {
        if (!SHORT_CODES[slot]) throw new Error(`Unknown team slot "${slot}" on match ${id}`);
        if (!teams.has(slot)) teams.set(slot, { slot, group_code: slot[0], short_code: SHORT_CODES[slot], name });
      }
      matches.push({
        id, stage, group_code: groupOrSlot, slot_label: null, kickoff_at,
        home_slot: team1, away_slot: team2, home: null, away: null, notes,
      });
      return;
    }

    let slot_label: string;
    if (stage === "round_of_16") slot_label = groupOrSlot;
    else if (stage === "quarter_final") slot_label = `QF${++labelCounters.quarter_final}`;
    else if (stage === "semi_final") slot_label = `SF${++labelCounters.semi_final}`;
    else if (stage === "third_place") slot_label = "3RD";
    else slot_label = "FINAL";

    matches.push({
      id, stage, group_code: null, slot_label, kickoff_at,
      home_slot: null, away_slot: null, home: parseSource(team1), away: parseSource(team2), notes,
    });
  });

  return { teams: [...teams.values()].sort((a, b) => a.slot.localeCompare(b.slot)), matches };
}
