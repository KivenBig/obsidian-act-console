import {
  App,
  ButtonComponent,
  ItemView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  requestUrl,
  Setting,
  setIcon,
  TFile,
  TFolder,
  WorkspaceLeaf
} from "obsidian";
import { THEME_CSS } from "./theme-data.gen";
// THEME_CSS is now a single string (payview-saas), not a Record

const VIEW_TYPE = "act-workspace-view";

const RECENT_THOUGHTS_LIMIT = 3;
const MOBILE_DAILY_CAPTURE_COMMAND_ID = "act-capture:act-capture-open";
const DIDA_WEB_URL = "https://dida365.com";
const DIDA_API_BASE = "https://api.dida365.com";
const DIDA_PREVIEW_LIMIT = 10;
const WEEK_IMPORTANT_HEADINGS = ["本周要事", "今日行动", "每日行动"];
const RENDER_DEBOUNCE_MS = 350;
const STARTUP_RENDER_DELAY_MS = 1600;
const STARTUP_AUTO_OPEN_DELAY_MS = 1800;
const DIDA_ACTIVE_CACHE_MS = 5000;

type MainTab = "focus" | "action" | "card" | "time";

interface WeekTask { text: string; done: boolean; }
interface ActionTask {
  title: string;
  aiNote: string;
  personalNote: string;
  deadline: string;
  priority: string;
  tags: string[];
  isTracked: boolean;
  todos: string[];
  filePath: string;
  folder: "11" | "12";
  latestProgressAt: number | null;
  latestProgressText: string;
  progressCount: number;
}

interface ProgressSection {
  start: number;
  end: number;
  level: number;
}

interface ProgressEntry {
  marker: string;
  text: string;
}
interface DidaTask {
  id: string;
  title: string;
  content?: string;
  desc?: string;
  isAllDay?: boolean;
  priority: number; // 0=none, 1=low, 3=medium, 5=high
  status: number; // 0=active, 2=completed
  dueDate?: string;
  startDate?: string;
  completedTime?: string;
  projectId?: string;
  sortOrder?: number;
  timeZone?: string;
  repeatFlag?: string;
  reminders?: string[];
  tags?: string[];
  items?: { title: string; status: number }[];
}

interface SkillShortcut {
  label: string;
  skill: string;
}

type TerminalMode = "terminal" | "system" | "copy";
type ProgressLogFormat = "heading-time" | "bullet-time";
type CompletedLogTarget = "weekly" | "daily" | "custom";

const QUICK_SKILLS: SkillShortcut[] = [];

/* ========= THEME ========= */

type CycleMode = "monthly" | "weekly" | "weekly13";

interface CycleInfo {
  cycle: string;
  weekOfCycle: number;
  totalWeeks: number;
}

interface FolderPaths {
  inbox: string;
  focusAction: string;
  activeAction: string;
  maybeAction: string;
  daily: string;
  weekly: string;
  cycle: string;
  vision: string;
  card: string;
  newCard: string;
  indexCard: string;
  bibCard: string;
  mainCard: string;
  thought: string;
  thoughtFile: string;
}

interface DvPaths {
  mainCard: string;
  bibCard: string;
  indexCard: string;
  newCard: string;
}

interface DidaSettings {
  enabled: boolean;
  accessToken: string;
  lookbackDays: number;

  completedLogTarget: CompletedLogTarget;
  completedLogPathTemplate: string;
  completedLogHeading: string;
}

interface ProgressLogSettings {
  heading: string;
  format: ProgressLogFormat;
}

interface TemplatePaths {
  taskNote: string;
  weekly: string;
  daily: string;
}

interface ActWorkspaceSettings {
  promptDrafts: Record<string, NotePromptValue>;
  progressDrafts: Record<string, { text: string; type: string }>;
  progressLog: ProgressLogSettings;
  skillItems: SkillShortcut[];
  skillCommandTemplate: string;
  terminalMode: TerminalMode;
  cycleMode: CycleMode;
  dvPaths: DvPaths;
  folders: FolderPaths;
  dida: DidaSettings;
  updateRepo: string;
  updateToken: string;
  hideCompletedNotes: boolean;
  cardVisibility: Record<string, boolean>;
  cardSearchMode: Record<string, "folder" | "tag">;
  cardTags: Record<string, string>;
  templates: TemplatePaths;
  refreshInterval: number;
}

const DEFAULT_FOLDERS: FolderPaths = {
  inbox: "+",
  focusAction: "10-Action/11-Focus-聚焦承诺",
  activeAction: "10-Action/12-Active-活跃跟进",
  maybeAction: "10-Action/13-Maybe-将来也许",
  daily: "30-Time/34-Daily-日志",
  weekly: "30-Time/33-Weekly-每周",
  cycle: "30-Time/32-12Week-十二周",
  vision: "30-Time/31-Vision-愿景",
  card: "20-Card",
  mainCard: "20-Card/24-MainCard-核心卡",
  bibCard: "20-Card/23-BibCard-阅读卡",
  indexCard: "20-Card/22-IndexCard-索引卡",
  newCard: "",
  thought: "+/ACT闪念",
  thoughtFile: "+/ACT闪念/每日闪念.md"
};

const DEFAULT_DIDA: DidaSettings = {
  enabled: false,
  accessToken: "",
  lookbackDays: 14,
  completedLogTarget: "weekly",
  completedLogPathTemplate: "{weeklyFolder}/{weekId}.md",
  completedLogHeading: "## 每日记录"
};

const DEFAULT_DV_PATHS: DvPaths = {
  mainCard: "20-Card/知识总览.base#核心卡总览",
  bibCard: "20-Card/知识总览.base#阅读卡总览",
  indexCard: "20-Card/知识总览.base#索引卡总览",
  newCard: ""
};

const DEFAULT_PROGRESS_LOG: ProgressLogSettings = {
  heading: "## 进展记录",
  format: "heading-time"
};

const DEFAULT_SETTINGS: ActWorkspaceSettings = {
  promptDrafts: {},
  progressDrafts: {},
  progressLog: { ...DEFAULT_PROGRESS_LOG },
  skillItems: QUICK_SKILLS.map((s) => ({ ...s })),
  skillCommandTemplate: "cd {{vault}} && codex '{{skill}}'",
  terminalMode: "terminal",
  cycleMode: "monthly",
  dvPaths: { ...DEFAULT_DV_PATHS },
  folders: { ...DEFAULT_FOLDERS },
  dida: { ...DEFAULT_DIDA },
  updateRepo: "",
  updateToken: "",
  hideCompletedNotes: false,
  cardVisibility: { mainCard: true, bibCard: true, indexCard: true, newCard: false },
  cardSearchMode: {},
  cardTags: {},
  templates: { taskNote: "", weekly: "", daily: "" },
  refreshInterval: 30
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDateOnly(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDateTime(date: Date): string {
  return `${formatDateOnly(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatShortDateTime(date: Date): string {
  return `${String(date.getFullYear()).slice(2)}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function getWeekdayShortName(date: Date): string {
  return ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
}

function formatDailyDate(date: Date): string {
  return `${formatDateOnly(date)}（${getWeekdayShortName(date)}）`;
}

function formatWeeklyLogHeading(date: Date): string {
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} 周${getWeekdayShortName(date)}`;
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function formatWeekId(date: Date): string {
  return `${date.getFullYear()}-W${pad(getWeekNumber(date))}`;
}

function weekIdToDate(weekId: string): Date {
  const [yearStr, weekStr] = weekId.split("-W");
  const year = parseInt(yearStr);
  const week = parseInt(weekStr);
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - (dayOfWeek - 1));
  const target = new Date(week1Monday);
  target.setDate(week1Monday.getDate() + (week - 1) * 7);
  return target;
}

function getWeekBounds(date: Date): { monday: Date; sunday: Date } {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { monday, sunday };
}

function getNextMonday(date: Date): Date {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  next.setDate(next.getDate() + diff);
  return next;
}

function getCycleInfo(date: Date, mode: CycleMode): CycleInfo {
  if (mode === "monthly") {
    const month = date.getMonth();
    const quarter = Math.floor(month / 3);
    const cycle = `Y${quarter + 1}`;
    const qStart = new Date(date.getFullYear(), quarter * 3, 1);
    const qEnd = new Date(date.getFullYear(), (quarter + 1) * 3, 0);
    const dayOfQ = Math.floor((date.getTime() - qStart.getTime()) / 86400000);
    const weekOfCycle = Math.floor(dayOfQ / 7) + 1;
    const totalDays = Math.floor((qEnd.getTime() - qStart.getTime()) / 86400000) + 1;
    const totalWeeks = Math.ceil(totalDays / 7);
    return { cycle, weekOfCycle, totalWeeks };
  }
  const weekNum = getWeekNumber(date);
  if (mode === "weekly13") {
    const cycle = weekNum <= 13 ? "Y1" : weekNum <= 26 ? "Y2" : weekNum <= 39 ? "Y3" : "Y4";
    return { cycle, weekOfCycle: ((weekNum - 1) % 13) + 1, totalWeeks: 13 };
  }
  const cycle = weekNum <= 12 ? "Y1" : weekNum <= 24 ? "Y2" : weekNum <= 36 ? "Y3" : "Y4";
  return { cycle, weekOfCycle: ((weekNum - 1) % 12) + 1, totalWeeks: 12 };
}

function getNextYearCycle(year: number, cycle: string): { year: number; cycle: string } {
  const order = ["Y1", "Y2", "Y3", "Y4"];
  const index = order.indexOf(cycle);
  if (index >= 0 && index < order.length - 1) return { year, cycle: order[index + 1] };
  return { year: year + 1, cycle: "Y1" };
}


function safeFileName(input: string): string {
  return input.trim().replace(/[\\/:*?"<>|#^[\]]/g, "").replace(/\s+/g, "-").slice(0, 48) || "未命名";
}

function normalizeInlineText(input: string): string {
  return input.replace(/-->/g, "").replace(/\s+/g, " ").trim();
}

function shellQuote(input: string): string {
  return `'${input.replace(/'/g, "'\\''")}'`;
}

function toAppleScriptString(input: string): string {
  return `"${input.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

const DEFAULT_UPDATE_REPO = "KivenBig/obsidian-act-console";
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

function normalizeGitHubRepo(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!trimmed) return "";

  const sshMatch = trimmed.match(/^git@github\.com:(.+?\/.+?)(?:\.git)?$/i);
  const urlMatch = trimmed.match(/^https?:\/\/github\.com\/([^/\s]+\/[^/\s#?]+)(?:\.git)?(?:[/?#].*)?$/i);
  const shortMatch = trimmed.match(/^([^/\s]+\/[^/\s]+)$/);
  const repo = sshMatch?.[1] ?? urlMatch?.[1] ?? shortMatch?.[1] ?? "";
  return repo.replace(/\.git$/i, "").replace(/\/+$/, "");
}

function getGitHubRepoUrl(input: string): string {
  const repo = normalizeGitHubRepo(input);
  return repo ? `https://github.com/${repo}` : "";
}

function formatWeekRange(weekId: string): string {
  if (!/^\d{4}-W\d{2}$/.test(weekId)) return "";
  const monday = weekIdToDate(weekId);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${pad(monday.getMonth() + 1)}.${pad(monday.getDate())} - ${pad(sunday.getMonth() + 1)}.${pad(sunday.getDate())}`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseCheckboxes(content: string): WeekTask[] {
  const tasks: WeekTask[] = [];
  for (const line of content.split("\n")) {
    const m = line.match(/^[-*]\s*\[([ xX])\]\s*(.+)/);
    if (m) tasks.push({ done: m[1].toLowerCase() === "x", text: m[2].trim() });
  }
  return tasks;
}

function parseConfigHeading(input: string, fallbackLevel: 1 | 2 | 3, fallbackTitle: string): { level: 1 | 2 | 3; title: string } {
  const trimmed = input.trim();
  if (!trimmed) return { level: fallbackLevel, title: fallbackTitle };
  const match = trimmed.match(/^(#{1,3})\s+(.+)$/);
  if (!match) return { level: fallbackLevel, title: trimmed };
  return { level: match[1].length as 1 | 2 | 3, title: match[2].trim() || fallbackTitle };
}

function findProgressSection(content: string, headingSetting = DEFAULT_PROGRESS_LOG.heading): ProgressSection | null {
  const target = parseConfigHeading(headingSetting, 2, "进展记录");
  const lines = content.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!match || match[1].length !== target.level || match[2].trim() !== target.title) continue;
    const level = target.level;
    let end = lines.length;
    for (let next = index + 1; next < lines.length; next += 1) {
      const nextHeading = lines[next].match(/^(#{1,6})\s+/);
      if (nextHeading && nextHeading[1].length <= level) {
        end = next;
        break;
      }
    }
    return { start: index + 1, end, level };
  }
  return null;
}

function extractTaskSection(content: string, matchHeading: (heading: string) => boolean): string {
  const lines = content.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^##\s+(.+?)\s*$/);
    if (!match || !matchHeading(match[1].trim())) continue;
    let end = lines.length;
    for (let next = index + 1; next < lines.length; next += 1) {
      const nextHeading = lines[next].match(/^(#{1,6})\s+/);
      if (nextHeading && nextHeading[1].length <= 2) {
        end = next;
        break;
      }
    }
    return lines.slice(index + 1, end).join("\n").trim();
  }
  return "";
}

function findTaskSection(content: string, matchHeading: (heading: string) => boolean): { start: number; end: number; level: number } | null {
  const lines = content.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!match || !matchHeading(match[2].trim())) continue;
    const level = match[1].length;
    let end = lines.length;
    for (let next = index + 1; next < lines.length; next += 1) {
      const nextHeading = lines[next].match(/^(#{1,6})\s+/);
      if (nextHeading && nextHeading[1].length <= level) {
        end = next;
        break;
      }
    }
    return { start: index + 1, end, level };
  }
  return null;
}

function getNextActionSection(content: string): { start: number; end: number; level: number } | null {
  return findTaskSection(content, (heading) => heading === "下步行动" || heading === "下一步行动" || heading === "行动清单");
}

function extractSectionBlock(content: string, heading: string): string {
  return extractTaskSection(content, (title) => title === heading);
}

function extractProgressEntries(content: string, headingSetting = DEFAULT_PROGRESS_LOG.heading): ProgressEntry[] {
  const section = findProgressSection(content, headingSetting);
  if (!section) return [];
  const lines = content.split("\n").slice(section.start, section.end);
  const entries: ProgressEntry[] = [];
  let current: ProgressEntry | null = null;

  const pushCurrent = () => {
    if (current && current.text.trim()) entries.push({ marker: current.marker, text: current.text.trim() });
    current = null;
  };

  for (const line of lines) {
    const heading = line.match(/^#{3,6}\s+(.+)/);
    if (heading) {
      pushCurrent();
      current = { marker: heading[1].trim(), text: "" };
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.+)/);
    if (bullet) {
      const marker = extractProgressMarker(bullet[1]);
      if (marker) {
        pushCurrent();
        current = { marker, text: bullet[1].trim() };
        continue;
      }
    }
    if (current && line.trim()) {
      current.text = current.text ? `${current.text}\n${line.trim()}` : line.trim();
    }
  }
  pushCurrent();
  return entries.sort((a, b) => {
    const aTime = parseProgressMarkerTime(a.marker);
    const bTime = parseProgressMarkerTime(b.marker);
    if (!Number.isNaN(aTime) && !Number.isNaN(bTime)) return bTime - aTime;
    if (!Number.isNaN(aTime)) return -1;
    if (!Number.isNaN(bTime)) return 1;
    return 0;
  });
}

function extractProgressMarker(text: string): string {
  return text.match(/^(\[\[\d{4}[-/]\d{1,2}[-/]\d{1,2}[^\]]*\]\]|\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:\s+\d{1,2}:\d{2})?)/)?.[1] ?? "";
}

function parseProgressMarkerTime(marker: string): number {
  const match = marker.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!match) return Number.NaN;
  return new Date(
    parseInt(match[1]),
    parseInt(match[2]) - 1,
    parseInt(match[3]),
    match[4] ? parseInt(match[4]) : 0,
    match[5] ? parseInt(match[5]) : 0
  ).getTime();
}

function extractProgressTypeTag(text: string): { tag: string; body: string } {
  const match = text.match(/^【(判断|卡点|情绪|下步行动|下一步)】\s*/);
  if (match) return { tag: match[1], body: text.slice(match[0].length).trim() };
  return { tag: "", body: text };
}

function buildProgressEntry(text: string, format: ProgressLogFormat, headingLevel = 3): string {
  const time = formatDateTime(new Date());
  const body = text.trim();
  if (format === "bullet-time") return `- ${time} ${body}`;
  return `${"#".repeat(headingLevel)} ${time}\n\n${body}`;
}

function appendProgressEntry(content: string, text: string, progressLog: ProgressLogSettings = DEFAULT_PROGRESS_LOG): string {
  const target = parseConfigHeading(progressLog.heading, 2, "进展记录");
  const entryHeadingLevel = target.level >= 3 ? Math.min(6, target.level + 1) : 3;
  const entry = buildProgressEntry(text, progressLog.format, entryHeadingLevel);
  const section = findProgressSection(content, progressLog.heading);
  if (!section) {
    const trimmed = content.replace(/\s*$/, "");
    return `${trimmed}\n\n${"#".repeat(target.level)} ${target.title}\n\n${entry}\n`;
  }

  const lines = content.split("\n");
  let insertAt = section.start;
  while (insertAt < section.end && lines[insertAt].trim() === "") insertAt += 1;
  lines.splice(insertAt, 0, entry, "");
  return lines.join("\n").replace(/\s*$/, "\n");
}

function parseCheckboxesInSection(content: string, heading: string): WeekTask[] {
  const sectionLines: string[] = [];
  let inSection = false;
  let sectionLevel = 0;
  for (const line of content.split("\n")) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();
      if (title === heading) {
        inSection = true;
        sectionLevel = level;
        continue;
      }
      if (inSection && level <= sectionLevel) break;
    }
    if (inSection) sectionLines.push(line);
  }
  return parseCheckboxes(sectionLines.join("\n"));
}

interface PriorityTask {
  text: string;
  done: boolean;
  priority: number; // 3 = !!!, 2 = !!, 1 = !
  displayText: string; // text without priority markers
  doneDate: string; // e.g. "2026-05-22", empty if not done
}

interface MarkedAction {
  text: string;
  priority: number;
  done: boolean;
  doneDate: string;
  lineIndex: number;
}

function parsePriorityTasks(content: string, sectionHeading: string | string[] = "每日行动"): PriorityTask[] {
  const tasks: PriorityTask[] = [];
  const headings = Array.isArray(sectionHeading) ? sectionHeading : [sectionHeading];
  const lines = content.split("\n");
  let inSection = false;
  for (const line of lines) {
    if (headings.some((heading) => line.match(new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`)))) { inSection = true; continue; }
    if (inSection && line.match(/^##\s+/)) break; // next section
    if (!inSection) continue;
    const m = line.match(/^[-*]\s*\[([ xX])\]\s*(.+)/);
    if (!m) continue;
    const done = m[1].toLowerCase() === "x";
    const rawText = m[2].trim();
    // detect priority: !!! / !! / ! (or full-width ！ variants) at the beginning or end of text
    const leadingMatch = rawText.match(/^([!！]{1,3})\s+/);
    const trailingMatch = rawText.match(/\s*([!！]{1,3})\s*(?:✅.*)?$/);
    const priority = leadingMatch ? leadingMatch[1].length : (trailingMatch ? trailingMatch[1].length : 0);
    // extract done date from ✅ YYYY-MM-DD
    const doneDateMatch = rawText.match(/✅\s*(\d{4}-\d{2}-\d{2})/);
    const doneDate = doneDateMatch ? doneDateMatch[1] : "";
    const displayText = rawText
      .replace(/^[!！]{1,3}\s+/, "")       // remove leading priority marks
      .replace(/\s*[!！]{1,3}\s*(?:✅.*)?$/, "")  // remove trailing priority marks
      .replace(/\s*✅.*$/, "")          // remove ✅ timestamp
      .trim();
    tasks.push({ text: rawText, done, priority, displayText, doneDate });
  }
  return tasks;
}

function parseMarkedActions(content: string): MarkedAction[] {
  const items: MarkedAction[] = [];
  const lines = content.split("\n");
  const section = getNextActionSection(content);
  if (!section) return items;
  for (let lineIndex = section.start; lineIndex < section.end; lineIndex += 1) {
    const line = lines[lineIndex];
    const m = line.match(/^\s*[-*]\s*\[([ xX])\]\s*(.+)/);
    if (!m) {
      const plain = line.match(/^\s*[-*]\s+([!！]{1,3})\s+(.+)/);
      if (plain) {
        items.push({ text: plain[2].trim(), priority: plain[1].length, done: false, doneDate: "", lineIndex });
      }
      continue;
    }
    const done = m[1].toLowerCase() === "x";
    const rawText = m[2].trim();
    const leadingMatch = rawText.match(/^([!！]{1,3})\s+/);
    const trailingMatch = rawText.match(/\s*([!！]{1,3})\s*(?:✅.*)?$/);
    const priority = leadingMatch ? leadingMatch[1].length : (trailingMatch ? trailingMatch[1].length : 0);
    if (priority === 0) continue;
    const doneDateMatch = rawText.match(/✅\s*(\d{4}-\d{2}-\d{2})/);
    const doneDate = doneDateMatch ? doneDateMatch[1] : "";
    const text = rawText.replace(/^[!！]{1,3}\s+/, "").replace(/\s*[!！]{1,3}\s*(?:✅.*)?$/, "").replace(/\s*✅.*$/, "").trim();
    items.push({ text, priority, done, doneDate, lineIndex });
  }
  items.sort((a, b) => b.priority - a.priority);
  return items;
}

function completeTaskActionLine(content: string, lineIndex: number, completedDate: string): string {
  const lines = content.split("\n");
  const line = lines[lineIndex];
  if (!line) return content;
  if (/^\s*[-*]\s*\[x\]/i.test(line)) {
    if (/✅\s*\d{4}-\d{2}-\d{2}/.test(line)) return content;
    lines[lineIndex] = `${line.trimEnd()} ✅ ${completedDate}`;
    return lines.join("\n");
  }

  const openCheckbox = line.match(/^(\s*[-*]\s*)\[ \](\s*.+)$/);
  if (openCheckbox) {
    const nextLine = `${openCheckbox[1]}[x]${openCheckbox[2].trimEnd()}`;
    lines[lineIndex] = /✅\s*\d{4}-\d{2}-\d{2}/.test(nextLine) ? nextLine : `${nextLine} ✅ ${completedDate}`;
    return lines.join("\n");
  }

  const plain = line.match(/^(\s*[-*]\s+)(.+)$/);
  if (plain) {
    const nextLine = `${plain[1]}[x] ${plain[2].trimEnd()}`;
    lines[lineIndex] = /✅\s*\d{4}-\d{2}-\d{2}/.test(nextLine) ? nextLine : `${nextLine} ✅ ${completedDate}`;
    return lines.join("\n");
  }

  return content;
}

function readFrontmatterLine(fm: string, pattern: string): string {
  return fm.match(new RegExp(`^${pattern}:[^\\S\\r\\n]*(.*)$`, "m"))?.[1]?.trim() ?? "";
}

function parseFrontmatterAction(content: string): { tags: string[]; aiNote: string; personalNote: string; deadline: string; priority: string } {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return { tags: [], aiNote: "", personalNote: "", deadline: "", priority: "" };
  const fm = fmMatch[1];
  const tags: string[] = [];
  const tagsBlock = fm.match(/^tags:\s*\n((?:[ \t]+-[^\n]*\n?)*)/m);
  if (tagsBlock) {
    const tagRe = /[ \t]+-\s*(.+)/g;
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = tagRe.exec(tagsBlock[1])) !== null) tags.push(tagMatch[1].trim());
  }
  const aiNote = readFrontmatterLine(fm, "AI[ \\t]?备注");
  const personalNote = readFrontmatterLine(fm, "个人备注");
  const deadlineRaw = readFrontmatterLine(fm, "(?:t-deadline|截止日期)").replace(/^["'](.*)["']$/, "$1");
  const priority = readFrontmatterLine(fm, "(?:priority|优先级)");
  return { tags, aiNote, personalNote, deadline: /\d/.test(deadlineRaw) ? deadlineRaw : "", priority };
}

function parseDidaLogHeading(input: string): { level: 1 | 2 | 3; title: string } {
  const trimmed = input.trim() || "## 每日记录";
  const match = trimmed.match(/^(#{1,3})\s+(.+)$/);
  if (!match) return { level: 2, title: trimmed };
  return { level: match[1].length as 1 | 2 | 3, title: match[2].trim() || "每日记录" };
}

function renderDidaLogTemplate(template: string, date: Date): string {
  const weekId = formatWeekId(date);
  const dateKey = formatDateOnly(date);
  return template
    .replace(/\{weekId\}/g, weekId)
    .replace(/\{date\}/g, dateKey)
    .replace(/\{dailyDate\}/g, formatDailyDate(date))
    .replace(/\{dateHeading\}/g, formatWeeklyLogHeading(date))
    .replace(/\{year\}/g, String(date.getFullYear()))
    .replace(/\{month\}/g, pad(date.getMonth() + 1))
    .replace(/\{day\}/g, pad(date.getDate()));
}

function findHeadingIndex(lines: string[], level: number, title: string, start = 0, end = lines.length): number {
  const headingRe = new RegExp(`^#{${level}}\\s+${escapeRegExp(title)}\\s*$`);
  for (let i = start; i < end; i++) {
    if (headingRe.test(lines[i])) return i;
  }
  return -1;
}

function findSectionEnd(lines: string[], headingIndex: number, level: number, limit = lines.length): number {
  for (let i = headingIndex + 1; i < limit; i++) {
    const match = lines[i].match(/^(#{1,6})\s+/);
    if (match && match[1].length <= level) return i;
  }
  return limit;
}

function ensureHeading(lines: string[], level: number, title: string): number {
  let index = findHeadingIndex(lines, level, title);
  if (index !== -1) return index;
  if (lines.length > 0 && lines[lines.length - 1].trim() !== "") lines.push("");
  lines.push(`${"#".repeat(level)} ${title}`, "");
  index = lines.length - 2;
  return index;
}

function insertLinesAtSectionEnd(lines: string[], sectionEnd: number, newLines: string[]) {
  const prefixBlank = lines[sectionEnd - 1]?.trim() === "" ? [] : [""];
  lines.splice(sectionEnd, 0, ...prefixBlank, ...newLines, "");
}

function insertDidaCompletedLines(content: string, date: Date, linesToAdd: string[], headingSetting: string): { content: string; added: number } {
  const newLines = linesToAdd.filter((line) => !content.includes(line.match(/<!--\s*(?:dida|action):[^>]+-->/)?.[0] ?? line));
  if (newLines.length === 0) return { content, added: 0 };

  const lines = content.split("\n");
  const target = parseDidaLogHeading(renderDidaLogTemplate(headingSetting, date));
  const targetIndex = ensureHeading(lines, target.level, target.title);
  const targetEnd = findSectionEnd(lines, targetIndex, target.level);

  if (target.level >= 3) {
    insertLinesAtSectionEnd(lines, targetEnd, newLines);
    return { content: lines.join("\n"), added: newLines.length };
  }

  const dayLevel = target.level + 1;
  const dayHeading = formatWeeklyLogHeading(date);
  let dayIndex = findHeadingIndex(lines, dayLevel, dayHeading, targetIndex + 1, targetEnd);
  if (dayIndex === -1) {
    const prefixBlank = lines[targetEnd - 1]?.trim() === "" ? [] : [""];
    lines.splice(targetEnd, 0, ...prefixBlank, `${"#".repeat(dayLevel)} ${dayHeading}`, ...newLines, "");
    return { content: lines.join("\n"), added: newLines.length };
  }

  const dayEnd = findSectionEnd(lines, dayIndex, dayLevel, targetEnd);
  insertLinesAtSectionEnd(lines, dayEnd, newLines);
  return { content: lines.join("\n"), added: newLines.length };
}

function formatDeadline(dateStr: string): { text: string; cls: string } {
  const m = dateStr.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return { text: dateStr, cls: "act-deadline-normal" };
  const target = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((target.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { text: "已过期", cls: "act-deadline-overdue" };
  if (diff === 0) return { text: "今天截止", cls: "act-deadline-today" };
  if (diff <= 3) return { text: `剩 ${diff} 天`, cls: "act-deadline-urgent" };
  if (diff <= 7) return { text: `剩 ${diff} 天`, cls: "act-deadline-soon" };
  return { text: `${target.getMonth() + 1}月${target.getDate()}日`, cls: "act-deadline-normal" };
}

function parseDeadlineDate(dateStr: string): Date | null {
  const m = dateStr.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return null;
  const target = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  target.setHours(0, 0, 0, 0);
  return target;
}

function countOpenTasks(tasks: WeekTask[]): number {
  return tasks.filter((task) => !task.done).length;
}

interface ChildProcessLike {
  execFile(file: string, args: string[], callback: (error: unknown, stdout: string, stderr: string) => void): void;
}

function getNodeRequire(): ((name: string) => unknown) | null {
  try {
    const globalRequire = (globalThis as unknown as { require?: (name: string) => unknown }).require;
    return globalRequire ?? (eval("require") as (name: string) => unknown);
  } catch {
    return null;
  }
}

function getNodeChildProcess(): ChildProcessLike | null {
  const req = getNodeRequire();
  if (!req) return null;
  try {
    return req("child_process") as ChildProcessLike;
  } catch {
    return null;
  }
}

interface NotePromptValue {
  title: string;
  body: string;
  dueDate?: string;
  dueTime?: string;
  priority?: string;
}

interface NotePromptOptions {
  dueDateLabel?: string;
  dueTimeLabel?: string;
  priorityLabel?: string;
  defaultDueDate?: string;
  defaultPriority?: string;
  helperText?: string;
}

class NotePromptModal extends Modal {
  private titleText: string;
  private titlePlaceholder: string;
  private bodyPlaceholder: string;
  private draft: NotePromptValue;
  private options: NotePromptOptions;
  private onSubmit: (value: NotePromptValue) => void | Promise<void>;
  private onDraftChange: (value: NotePromptValue) => void | Promise<void>;
  private onDraftClear: () => void | Promise<void>;
  private titleInputEl!: HTMLInputElement;
  private bodyInputEl!: HTMLTextAreaElement;
  private dueDateInputEl?: HTMLInputElement;
  private dueTimeInputEl?: HTMLInputElement;
  private prioritySelectEl?: HTMLSelectElement;
  private draftSaveTimer: number | null = null;
  private submitted = false;

  constructor(
    app: App,
    title: string,
    titlePlaceholder: string,
    bodyPlaceholder: string,
    draft: NotePromptValue,
    onDraftChange: (value: NotePromptValue) => void | Promise<void>,
    onDraftClear: () => void | Promise<void>,
    onSubmit: (value: NotePromptValue) => void | Promise<void>,
    options: NotePromptOptions = {}
  ) {
    super(app);
    this.titleText = title;
    this.titlePlaceholder = titlePlaceholder;
    this.bodyPlaceholder = bodyPlaceholder;
    this.draft = draft;
    this.options = options;
    this.onDraftChange = onDraftChange;
    this.onDraftClear = onDraftClear;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    this.modalEl.addClass("act-note-modal");
    this.contentEl.empty();
    this.contentEl.addClass("act-modal");
    this.contentEl.createEl("h2", { text: this.titleText });
    this.titleInputEl = this.contentEl.createEl("input", { type: "text", placeholder: this.titlePlaceholder, cls: "act-input" });
    this.bodyInputEl = this.contentEl.createEl("textarea", { placeholder: this.bodyPlaceholder, cls: "act-input act-textarea" });
    this.titleInputEl.value = this.draft.title;
    this.bodyInputEl.value = this.draft.body;
    this.titleInputEl.addEventListener("input", () => this.scheduleDraftSave());
    this.bodyInputEl.addEventListener("input", () => this.scheduleDraftSave());
    if (this.options.helperText) {
      this.contentEl.createDiv({ cls: "act-modal-helper", text: this.options.helperText });
    }
    if (this.options.dueDateLabel || this.options.dueTimeLabel || this.options.priorityLabel) {
      const row = this.contentEl.createDiv({ cls: "act-modal-field-row" });
      if (this.options.dueDateLabel) {
        const field = row.createDiv({ cls: "act-modal-field" });
        field.createEl("label", { text: this.options.dueDateLabel });
        this.dueDateInputEl = field.createEl("input", { type: "date", cls: "act-input" });
        this.dueDateInputEl.value = this.draft.dueDate ?? this.options.defaultDueDate ?? "";
        this.dueDateInputEl.addEventListener("input", () => this.scheduleDraftSave());
        this.renderDueDateQuickActions(field);
      }
      if (this.options.dueTimeLabel) {
        const field = row.createDiv({ cls: "act-modal-field" });
        field.createEl("label", { text: this.options.dueTimeLabel });
        this.dueTimeInputEl = field.createEl("input", { type: "time", cls: "act-input" });
        this.dueTimeInputEl.value = this.draft.dueTime ?? "";
        this.dueTimeInputEl.addEventListener("input", () => this.scheduleDraftSave());
      }
      if (this.options.priorityLabel) {
        const field = row.createDiv({ cls: "act-modal-field" });
        field.createEl("label", { text: this.options.priorityLabel });
        this.prioritySelectEl = field.createEl("select", { cls: "act-input" });
        [
          { value: "0", label: "无优先级" },
          { value: "1", label: "低优先级" },
          { value: "3", label: "中优先级" },
          { value: "5", label: "高优先级" }
        ].forEach((option) => {
          this.prioritySelectEl?.createEl("option", { value: option.value, text: option.label });
        });
        this.prioritySelectEl.value = this.draft.priority ?? this.options.defaultPriority ?? "0";
        this.prioritySelectEl.addEventListener("change", () => this.scheduleDraftSave());
      }
    }
    this.titleInputEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault();
        this.bodyInputEl.focus();
      }
      if (event.key === "Escape") this.close();
    });
    this.bodyInputEl.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void this.submit();
      if (event.key === "Escape") this.close();
    });
    const actions = this.contentEl.createDiv({ cls: "act-modal-actions" });
    new ButtonComponent(actions).setButtonText("取消").onClick(() => this.close());
    new ButtonComponent(actions).setButtonText("确定").setCta().onClick(() => void this.submit());
    this.titleInputEl.focus();
  }

  private renderDueDateQuickActions(container: HTMLElement) {
    const quick = container.createDiv({ cls: "act-due-quick" });
    const today = new Date();
    const options = [
      { label: "今日", date: today },
      { label: "明天", date: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1) },
      { label: "下周一", date: getNextMonday(today) }
    ];
    for (const option of options) {
      const button = quick.createEl("button", { text: option.label, attr: { type: "button" } });
      button.addEventListener("click", () => {
        if (!this.dueDateInputEl) return;
        this.dueDateInputEl.value = formatDateOnly(option.date);
        this.scheduleDraftSave();
      });
    }
    const clear = quick.createEl("button", { text: "清空", cls: "is-clear", attr: { type: "button" } });
    clear.addEventListener("click", () => {
      if (this.dueDateInputEl) this.dueDateInputEl.value = "";
      if (this.dueTimeInputEl) this.dueTimeInputEl.value = "";
      this.scheduleDraftSave();
    });
  }

  onClose() {
    if (this.draftSaveTimer !== null) {
      window.clearTimeout(this.draftSaveTimer);
      this.draftSaveTimer = null;
    }
    if (!this.submitted && this.titleInputEl && this.bodyInputEl) void this.saveDraftNow();
  }

  private currentValue(): NotePromptValue {
    return {
      title: this.titleInputEl.value,
      body: this.bodyInputEl.value,
      dueDate: this.dueDateInputEl?.value,
      dueTime: this.dueTimeInputEl?.value,
      priority: this.prioritySelectEl?.value
    };
  }

  private scheduleDraftSave() {
    if (this.draftSaveTimer !== null) window.clearTimeout(this.draftSaveTimer);
    this.draftSaveTimer = window.setTimeout(() => {
      this.draftSaveTimer = null;
      void this.saveDraftNow();
    }, 350);
  }

  private async saveDraftNow() {
    await this.onDraftChange(this.currentValue());
  }

  private async submit() {
    const title = this.titleInputEl.value.trim();
    const body = this.bodyInputEl.value.trim();
    if (!title) {
      new Notice("标题不能为空");
      return;
    }
    try {
      await this.onSubmit({
        ...this.currentValue(),
        title,
        body
      });
      this.submitted = true;
      await this.onDraftClear();
      this.close();
    } catch (error) {
      console.error("Failed to save note prompt", error);
      new Notice("保存失败，请查看开发者控制台");
    }
  }
}

class ActWorkspaceView extends ItemView {
  private plugin: ActWorkspacePlugin;
  private activeTab: MainTab = "focus";
  private selectedProgressTaskPath = "";
  private focusActionFolder: "focus" | "active" | "maybe" = "focus";
  private get progressDrafts() { return this.plugin.settings.progressDrafts; }
  private get F() { return this.plugin.settings.folders; }
  private didaUnscheduledExpanded = false;
  private renderTimer: number | null = null;
  private isRendering = false;
  private renderQueued = false;
  private didaActiveCache: { token: string; fetchedAt: number; tasks: DidaTask[]; promise?: Promise<DidaTask[]> } | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: ActWorkspacePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "ACT 工作台"; }
  getIcon() { return "layout-dashboard"; }

  private refreshIntervalId: number | null = null;

  async onOpen() {
    this.renderStartupPlaceholder();
    this.requestRender(STARTUP_RENDER_DELAY_MS);
    this.startRefreshInterval();
  }

  async onClose() {
    if (this.renderTimer !== null) {
      window.clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    this.stopRefreshInterval();
  }

  startRefreshInterval() {
    this.stopRefreshInterval();
    const seconds = this.plugin.settings.refreshInterval;
    if (seconds <= 0) return;
    this.refreshIntervalId = window.setInterval(() => {
      // 用户正在工作台内的输入框中打字时跳过本次刷新，避免焦点被夺走
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        this.containerEl.contains(active) &&
        (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement)
      ) return;
      void this.render();
    }, seconds * 1000);
  }

  private stopRefreshInterval() {
    if (this.refreshIntervalId !== null) {
      window.clearInterval(this.refreshIntervalId);
      this.refreshIntervalId = null;
    }
  }

  private requestRender(delay = RENDER_DEBOUNCE_MS) {
    if (this.renderTimer !== null) window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = null;
      void this.render();
    }, delay);
  }

  private renderStartupPlaceholder() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("act-root");
    const quotes = [
      "看清全局，推进一步。",
      "行动 · 知识 · 方向，正在就位...",
      "今天，从这里开始。",
      "少即是多，完成即开始。"
    ];
    const now = new Date();
    const weekday = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];
    const dateStr = `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}`;
    const weekId = formatWeekId(now);

    const wrap = container.createDiv({ cls: "act-startup" });

    const brand = wrap.createDiv({ cls: "act-startup-brand" });
    brand.createSpan({ text: "A", cls: "act-startup-letter" });
    brand.createSpan({ text: "C", cls: "act-startup-letter" });
    brand.createSpan({ text: "T", cls: "act-startup-letter" });

    wrap.createDiv({ text: "工作台", cls: "act-startup-label" });

    const meta = wrap.createDiv({ cls: "act-startup-meta" });
    meta.createSpan({ text: `${dateStr}  星期${weekday}` });
    meta.createSpan({ text: "·", cls: "act-startup-dot" });
    meta.createSpan({ text: weekId });

    wrap.createDiv({ text: quotes[Math.floor(Math.random() * quotes.length)], cls: "act-startup-quote" });

    const bar = wrap.createDiv({ cls: "act-startup-bar" });
    bar.createDiv({ cls: "act-startup-bar-fill" });
  }

  async render() {
    if (this.isRendering) {
      this.renderQueued = true;
      return;
    }
    this.isRendering = true;
    try {
      const container = this.containerEl.children[1] as HTMLElement;
      container.empty();
      container.addClass("act-root");

      this.renderOverview(container);
      this.renderMainTabs(container);

      const body = container.createDiv({ cls: "act-tab-body" });
      if (this.activeTab === "focus") await this.renderFocusTab(body);
      if (this.activeTab === "action") await this.renderActionTab(body);
      if (this.activeTab === "card") await this.renderCardTab(body);
      if (this.activeTab === "time") await this.renderTimeTab(body);
    } finally {
      this.isRendering = false;
      if (this.renderQueued) {
        this.renderQueued = false;
        this.requestRender();
      }
    }
  }


  private renderOverview(container: HTMLElement) {
    const card = container.createDiv({ cls: "act-overview" });
    const toolbar = card.createDiv({ cls: "act-ov-toolbar" });

    const header = toolbar.createDiv({ cls: "act-ov-skill-header" });
    header.createSpan({ text: "常用技能", cls: "act-ov-skill-title" });
    header.createSpan({ text: "一键唤起 AI Agent，让笔记自己思考", cls: "act-ov-skill-desc" });

    const skills = toolbar.createDiv({ cls: "act-ov-skills" });
    const skillItems = this.plugin.settings.skillItems.length > 0 ? this.plugin.settings.skillItems : QUICK_SKILLS;
    for (const item of skillItems) {
      const chip = skills.createEl("button", {
        text: item.label,
        cls: "act-ov-skill",
        attr: { title: `运行 Skill：${item.skill}` }
      });
      chip.addEventListener("click", () => this.plugin.openSkillInTerminal(item.skill));
    }
  }

  private renderMainTabs(container: HTMLElement) {
    const tabs = container.createDiv({ cls: "act-tabs" });
    this.tabButton(tabs, "focus", "🎯", "Today", "聚焦");
    this.tabButton(tabs, "action", "⚡", "Action", "行动");
    this.tabButton(tabs, "card", "💎", "Card", "知识");
    this.tabButton(tabs, "time", "🧭", "Time", "方向");
  }

  private tabButton(container: HTMLElement, mode: MainTab, icon: string, en: string, zh: string) {
    const button = container.createEl("button", { cls: `act-tab ${this.activeTab === mode ? "is-active" : ""}` });
    button.createSpan({ text: icon, cls: "act-tab-icon" });
    button.createSpan({ text: `${en} · ${zh}`, cls: "act-tab-label" });
    button.addEventListener("click", () => this.setTab(mode));
  }

  private async setTab(mode: MainTab) {
    this.activeTab = mode;
    await this.render();
  }

  private async renderFocusTab(container: HTMLElement) {
    const grid = container.createDiv({ cls: "act-panel-grid" });
    const main = grid.createDiv({ cls: "act-panel-main" });
    const side = grid.createDiv({ cls: "act-panel-side" });

    await this.renderFocusActions(main);
    await this.renderFixedSchedule(main);

    await this.renderTodayCompleted(side);
    await this.renderRecentThoughts(side);
  }

  private async renderFocusActions(container: HTMLElement) {
    const tabs: { id: "focus" | "active" | "maybe"; label: string; folder: string }[] = [
      { id: "focus", label: "聚焦承诺", folder: this.F.focusAction },
      { id: "active", label: "活跃跟进", folder: this.F.activeAction },
      { id: "maybe", label: "将来也许", folder: this.F.maybeAction }
    ];
    const current = tabs.find((t) => t.id === this.focusActionFolder) ?? tabs[0];

    const section = container.createDiv({ cls: "act-section" });
    section.setAttribute("data-label", "任务清单 · 今日");

    const tabBar = section.createDiv({ cls: "act-section-tabs" });
    for (const tab of tabs) {
      const btn = tabBar.createEl("button", { text: tab.label, cls: `act-section-tab ${tab.id === this.focusActionFolder ? "is-active" : ""}`, attr: { type: "button" } });
      btn.addEventListener("click", () => {
        this.focusActionFolder = tab.id;
        this.render();
      });
    }
    const infoTrigger = tabBar.createDiv({ cls: "act-info-trigger" });
    const infoIcon = infoTrigger.createSpan({ cls: "act-info-icon" });
    setIcon(infoIcon, "info");
    const popup = infoTrigger.createDiv({ cls: "act-info-popup" });
    popup.createDiv({ text: "数据来源", cls: "act-info-heading" });
    popup.createDiv({ text: current.folder, cls: "act-info-text" });
    popup.createDiv({ text: "显示规则", cls: "act-info-heading" });
    popup.createDiv({ text: "仅显示带 #a-任务笔记 标签的笔记。行动项读取 ## 下步行动 区块中带 ! 或 ！ 标记的未完成内容；已完成行动项不在此处显示，会进入「今日已完成」。! / ！ = 一般，!! / ！！ = 重要，!!! / ！！！ = 最优先。", cls: "act-info-text" });
    popup.createDiv({ text: "新建规则", cls: "act-info-heading" });
    popup.createDiv({ text: "点击 + 按钮新建任务笔记，自动保存到当前所选文件夹。笔记自带 #a-任务笔记 标签和标准模板（下步行动 / 进展记录 / 背景目标）。", cls: "act-info-text" });

    const addBtn = tabBar.createEl("button", { text: "+", cls: "act-section-tab act-section-tab-add", attr: { type: "button" } });
    addBtn.addEventListener("click", () => this.createFocusTaskNote(current));

    const folder = this.app.vault.getAbstractFileByPath(current.folder);
    if (!(folder instanceof TFolder)) {
      this.empty(section, "文件夹不存在");
      return;
    }

    const todayStr = formatDateOnly(new Date());
    let noteCount = 0;
    const allFiles: TFile[] = [];
    const collectFiles = (f: TFolder) => {
      for (const child of f.children) {
        if (child instanceof TFile && child.extension === "md") allFiles.push(child);
        else if (child instanceof TFolder) collectFiles(child);
      }
    };
    collectFiles(folder);
    for (const child of allFiles) {
      const content = await this.app.vault.cachedRead(child);
      const { tags, deadline } = parseFrontmatterAction(content);
      if (!tags.includes("a-任务笔记")) continue;
      const markedItems = parseMarkedActions(content);
      const pendingItems = markedItems.filter((item) => !item.done);
      const todayDoneItems = markedItems.filter((item) => item.done && item.doneDate === todayStr);
      const allDone = pendingItems.length === 0;

      if (this.plugin.settings.hideCompletedNotes && pendingItems.length === 0 && todayDoneItems.length === 0) continue;

      noteCount++;
      const group = section.createDiv({ cls: `act-focus-action-group ${allDone ? "is-all-done" : ""}` });
      const head = group.createDiv({ cls: "act-focus-action-head" });
      const titleLink = head.createEl("a", { text: child.basename, cls: "act-focus-action-title", href: "#" });
      titleLink.addEventListener("click", (e) => { e.preventDefault(); this.plugin.openPath(child.path); });
      if (allDone) {
        head.createSpan({ text: "✓ 全部完成", cls: "act-focus-action-all-done" });
      }
      if (deadline) {
        const dl = formatDeadline(deadline);
        head.createSpan({ text: dl.text, cls: "act-focus-action-deadline" });
      }

      for (const item of pendingItems) {
        const row = group.createDiv({ cls: "act-focus-action-item" });
        const check = row.createDiv({ cls: "act-focus-action-check", attr: { role: "button", "aria-label": "完成行动项", title: "完成行动项" } });
        check.createDiv();
        check.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          await this.plugin.completeTaskActionItem(child.path, item.lineIndex);
          await this.render();
        });
        row.createSpan({ text: item.text, cls: "act-focus-action-text" });
        if (item.priority >= 3) row.createSpan({ text: "!!!", cls: "act-focus-action-priority is-p1" });
        else if (item.priority >= 2) row.createSpan({ text: "!!", cls: "act-focus-action-priority is-p2" });
      }
      for (const item of todayDoneItems) {
        const row = group.createDiv({ cls: "act-focus-action-item is-done" });
        const check = row.createDiv({ cls: "act-focus-action-check" });
        check.createDiv();
        row.createSpan({ text: item.text, cls: "act-focus-action-text" });
        row.createSpan({ text: `✓ ${item.doneDate}`, cls: "act-focus-action-done-date" });
      }
    }
    if (noteCount === 0) {
      this.empty(section, "当前文件夹暂无未完成行动项");
    }

  }

  private async renderTodayCompleted(container: HTMLElement) {
    const section = this.section(container, "今日已完成", "聚焦 · 完成");
    const today = new Date();
    const todayStr = formatDateOnly(today);
    const weekId = formatWeekId(today);
    const weekPath = `${this.F.weekly}/${weekId}.md`;
    this.smallAction(section, "本周完成", () => this.plugin.openPath(weekPath));
    this.sectionInfo(section, {
      source: weekPath,
      rule: "统一从周记读取。点击滴答清单区域的「任务更新」按钮可同步滴答清单 + 行动文件夹的完成记录到周记。来源识别：滴答清单：→ 滴答；聚焦/跟进/也许：→ 对应行动来源；其他 → 计划。"
    });

    const completed: { text: string; source: string }[] = [];

    const weekFile = this.app.vault.getAbstractFileByPath(weekPath);
    if (weekFile instanceof TFile) {
      const content = await this.app.vault.cachedRead(weekFile);
      for (const line of content.split("\n")) {
        if (/^\s*-\s*\[x\]/i.test(line) && line.includes(todayStr)) {
          let text = line.replace(/^\s*-\s*\[x\]\s*/i, "").replace(/<!--.*?-->/g, "").replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/, "").trim();
          const isDida = text.startsWith("滴答清单：") || text.startsWith("滴答清单:");
          const actionMatch = text.match(/^(聚焦|跟进|也许)[：:]/);
          if (isDida) {
            text = text.replace(/^滴答清单[：:]/, "").trim();
            completed.push({ text, source: "滴答" });
          } else if (actionMatch) {
            text = text.replace(/^(?:聚焦|跟进|也许)[：:]/, "").trim();
            completed.push({ text, source: actionMatch[1] });
          } else {
            completed.push({ text, source: "计划" });
          }
        }
      }
    }

    if (completed.length === 0) {
      this.empty(section, "今天还没有完成记录");
      return;
    }

    section.createDiv({ text: `今日完成 ${completed.length} 项`, cls: "act-hint" });
    const sourceClsMap: Record<string, string> = { "滴答": "is-dida", "计划": "is-plan", "聚焦": "is-focus", "跟进": "is-active", "也许": "is-maybe" };
    for (const item of completed) {
      const row = section.createDiv({ cls: "act-completed-row" });
      row.createSpan({ text: "✓", cls: "act-completed-check" });
      row.createSpan({ text: item.text, cls: "act-completed-text" });
      row.createSpan({ text: item.source, cls: `act-completed-source ${sourceClsMap[item.source] ?? ""}` });
    }
  }

  private async renderRecentThoughts(container: HTMLElement) {
    const section = this.section(container, "最近闪念", "闪念 · 最近");
    this.sectionInfo(section, {
      source: this.F.thought,
      rule: "列出 ACT 闪念文件夹下的闪念笔记。这里只显示笔记入口，不读取正文内容；点击条目会打开对应笔记。"
    });
    const dailyPath = `${this.F.daily}/${formatDailyDate(new Date())}.md`;
    const btnGroup = section.createDiv({ cls: "act-action-btn-group" });
    const dailyBtn = btnGroup.createEl("button", { text: "今日日志", cls: "act-small-action", attr: { type: "button" } });
    dailyBtn.addEventListener("click", () => this.plugin.openOrCreateDaily(dailyPath));
    const thoughtBtn = btnGroup.createEl("button", { text: "记录闪念", cls: "act-small-action", attr: { type: "button" } });
    thoughtBtn.addEventListener("click", () => this.plugin.openDailyCapture());

    const folder = this.app.vault.getAbstractFileByPath(this.F.thought);
    if (!(folder instanceof TFolder)) {
      this.empty(section, "ACT 闪念文件夹不存在");
      return;
    }

    const notes = folder.children
      .filter((child): child is TFile => child instanceof TFile && child.extension === "md")
      .sort((a, b) => b.stat.mtime - a.stat.mtime);
    if (notes.length === 0) {
      this.empty(section, "还没有闪念笔记");
      return;
    }

    section.createDiv({ text: `${notes.length} 篇闪念笔记`, cls: "act-hint" });
    for (const file of notes) {
      const row = section.createDiv({ cls: "act-thought-row" });
      row.createDiv({
        text: new Date(file.stat.mtime).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }),
        cls: "act-thought-date"
      });
      row.createDiv({ text: file.basename, cls: "act-thought-preview" });
      row.addEventListener("click", () => this.plugin.openPath(file.path));
      row.addClass("is-clickable");
    }
  }

  private static ACTION_STATUSES = [
    { tag: "a-推进中", label: "推进中", css: "active" },
    { tag: "a-等待中", label: "等待中", css: "waiting" },
    { tag: "a-暂停搁置", label: "暂停搁置", css: "paused" },
    { tag: "a-已完成", label: "已完成", css: "done" }
  ];

  private getActionStatus(task: ActionTask): string {
    for (const s of ActWorkspaceView.ACTION_STATUSES) {
      if (task.tags.includes(s.tag)) return s.css;
    }
    return "none";
  }

  private async setActionStatus(task: ActionTask, newTag: string) {
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    if (!(file instanceof TFile)) return;
    const statusTags = ActWorkspaceView.ACTION_STATUSES.map((s) => s.tag);
    await this.app.vault.process(file, (content) => {
      const fmMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/);
      if (!fmMatch) return content;
      const before = fmMatch[1];
      let fm = fmMatch[2];
      const after = fmMatch[3];
      const rest = content.slice(fmMatch[0].length);
      const tagsBlock = fm.match(/^(tags:\s*\n)((?:[ \t]+-[^\n]*\n?)*)/m);
      if (!tagsBlock) {
        fm += `\ntags:\n  - ${newTag}\n`;
        return before + fm + after + rest;
      }
      let tagLines = tagsBlock[2].split("\n").filter((l) => l.trim());
      tagLines = tagLines.filter((l) => { const t = l.replace(/^[ \t]+-\s*/, "").trim(); return !statusTags.includes(t); });
      if (newTag) tagLines.push(`  - ${newTag}`);
      fm = fm.replace(tagsBlock[0], tagsBlock[1] + tagLines.join("\n") + (tagLines.length ? "\n" : ""));
      return before + fm + after + rest;
    });
    new Notice(`状态已更新为 ${newTag || "无"}`);
  }

  private async renderActionTab(container: HTMLElement) {
    const tasks = (await this.parseActionTasks()).sort((a, b) => {
      const folderOrder = a.folder.localeCompare(b.folder);
      if (folderOrder !== 0) return folderOrder;
      const aDate = parseDeadlineDate(a.deadline)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bDate = parseDeadlineDate(b.deadline)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aDate - bDate || a.title.localeCompare(b.title, "zh-CN");
    });

    if (!this.selectedProgressTaskPath || !tasks.some((task) => task.filePath === this.selectedProgressTaskPath)) {
      this.selectedProgressTaskPath = tasks[0]?.filePath ?? "";
    }

    const grid = container.createDiv({ cls: "act-panel-grid act-action-grid" });
    const list = grid.createDiv({ cls: "act-panel-side" });
    const detail = grid.createDiv({ cls: "act-panel-main" });

    this.renderActionTaskList(list, tasks);

    const selectedTask = tasks.find((task) => task.filePath === this.selectedProgressTaskPath);
    if (selectedTask) await this.renderProgressDetail(detail, selectedTask);
    else this.empty(detail, "先创建一个任务笔记");
  }

  private renderActionTaskList(container: HTMLElement, tasks: ActionTask[]) {
    const headerRow = container.createDiv({ cls: "act-action-list-header" });
    headerRow.createEl("h2", { text: "任务列表", cls: "act-section-title" });
    const addBtn = headerRow.createEl("button", { cls: "act-action-add-btn", attr: { type: "button", "aria-label": "新建任务笔记" } });
    setIcon(addBtn, "plus");
    addBtn.addEventListener("click", () => this.createActionTaskNote());
    this.sectionInfo(headerRow, {
      source: `${this.F.focusAction} 与 ${this.F.activeAction} 下的 Markdown 文件`,
      rule: "仅显示 tags 包含 a-任务笔记 的笔记，资料笔记不会出现。按文件夹分组（聚焦承诺 / 活跃跟进），组内按执行状态排序：推进中 → 等待中 → 未标记 → 暂停搁置。已完成任务隐藏。",
      props: [
        { name: "tags: a-任务笔记", desc: "必须有此标签才会显示在列表中" },
        { name: "tags: a-推进中", desc: "正在推进的任务" },
        { name: "tags: a-等待中", desc: "等待外部条件的任务" },
        { name: "tags: a-暂停搁置", desc: "暂时搁置的任务" },
        { name: "tags: a-已完成", desc: "已完成，自动隐藏" },
        { name: "t-deadline", desc: "截止日期，用于排序" }
      ]
    });

    const folders = [
      { id: "11", label: "聚焦承诺" },
      { id: "12", label: "活跃跟进" }
    ];

    for (const folder of folders) {
      const folderTasks = tasks.filter((t) => t.folder === folder.id && !t.tags.includes("a-已完成"));
      if (folderTasks.length === 0) continue;

      const folderHeader = container.createDiv({ cls: `act-action-folder is-folder-${folder.id}` });
      folderHeader.createSpan({ text: folder.label });
      folderHeader.createSpan({ text: `${folderTasks.length}`, cls: "act-action-group-count" });

      const statusOrder = [
        { css: "active", label: "推进中" },
        { css: "waiting", label: "等待中" },
        { css: "none", label: "" },
        { css: "paused", label: "暂停搁置" }
      ];

      const grouped = new Map<string, ActionTask[]>();
      for (const task of folderTasks) {
        const status = this.getActionStatus(task);
        if (!grouped.has(status)) grouped.set(status, []);
        grouped.get(status)!.push(task);
      }

      for (const s of statusOrder) {
        const items = grouped.get(s.css);
        if (!items || items.length === 0) continue;
        if (s.label) {
          const subHeader = container.createDiv({ cls: `act-action-status-label is-${s.css}` });
          subHeader.createSpan({ cls: `act-action-dot is-${s.css}` });
          subHeader.createSpan({ text: s.label });
        }
        for (const task of items) {
          const active = task.filePath === this.selectedProgressTaskPath;
          const btn = container.createEl("button", { cls: `act-action-task-btn ${active ? "is-active" : ""}`, attr: { type: "button" } });
          btn.createSpan({ text: task.title, cls: "act-action-task-name" });
          btn.addEventListener("click", async () => {
            this.selectedProgressTaskPath = task.filePath;
            await this.render();
          });
        }
      }
    }

    const doneCount = tasks.filter((t) => t.tags.includes("a-已完成")).length;
    if (doneCount > 0) {
      container.createDiv({ text: `${doneCount} 个已完成任务已隐藏`, cls: "act-action-done-hint" });
    }
  }

  private createActionTaskNote() {
    const folderChoices = [
      { path: this.F.focusAction, label: "聚焦承诺", desc: "重要且需要持续推进的核心任务" },
      { path: this.F.activeAction, label: "活跃跟进", desc: "需要关注但非最高优先级的任务" },
      { path: this.F.maybeAction, label: "将来也许", desc: "未来可能做、当前不推进的事项" }
    ];
    const modal = new Modal(this.app);
    modal.titleEl.setText("新建任务笔记");
    const body = modal.contentEl;
    body.createDiv({ text: "选择任务所属文件夹：", cls: "act-folder-choice-hint" });
    for (const choice of folderChoices) {
      const btn = body.createEl("button", { cls: "act-folder-choice-btn", attr: { type: "button" } });
      btn.createDiv({ text: choice.label, cls: "act-folder-choice-label" });
      btn.createDiv({ text: choice.desc, cls: "act-folder-choice-desc" });
      btn.addEventListener("click", () => {
        modal.close();
        this.plugin.openNotePrompt(
          "action-task",
          `新建任务 · ${choice.label}`,
          "任务标题",
          "补充背景、目标或约束...",
          async ({ title, body: noteBody }) => {
            const path = `${choice.path}/${safeFileName(title)}.md`;
            const content = await this.plugin.buildTaskNoteContent(noteBody);
            await this.app.vault.create(path, content);
            this.selectedProgressTaskPath = path;
            await this.render();
            await this.plugin.openPathInSide(path);
          }
        );
      });
    }
    modal.open();
  }

  private createFocusTaskNote(tab: { id: string; label: string; folder: string }) {
    this.plugin.openNotePrompt(
      "action-task",
      `新建任务 · ${tab.label}`,
      "任务标题",
      "补充背景、目标或约束...",
      async ({ title, body: noteBody }) => {
        const path = `${tab.folder}/${safeFileName(title)}.md`;
        const content = await this.plugin.buildTaskNoteContent(noteBody);
        await this.app.vault.create(path, content);
        await this.render();
        await this.plugin.openPathInSide(path);
      }
    );
  }

  private async renderProgressDetail(container: HTMLElement, task: ActionTask) {
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    if (!(file instanceof TFile)) {
      this.empty(container, "任务笔记不存在");
      return;
    }
    const content = await this.app.vault.cachedRead(file);
    const entries = extractProgressEntries(content, this.plugin.settings.progressLog.heading);

    const head = container.createDiv({ cls: "act-progress-head" });
    const titleWrap = head.createDiv({ cls: "act-progress-head-text" });
    titleWrap.createDiv({ text: task.title, cls: "act-progress-title" });
    const headMeta = titleWrap.createDiv({ cls: "act-progress-head-meta" });
    headMeta.createSpan({ text: task.folder === "11" ? "聚焦承诺" : "活跃跟进" });
    if (task.deadline) {
      const dl = parseDeadlineDate(task.deadline);
      if (dl) {
        const daysLeft = Math.ceil((dl.getTime() - Date.now()) / 86400000);
        const urgency = daysLeft < 0 ? `已逾期 ${-daysLeft} 天` : daysLeft <= 7 ? `还剩 ${daysLeft} 天` : `截止 ${task.deadline}`;
        const cls = daysLeft < 0 ? "is-overdue" : daysLeft <= 7 ? "is-urgent" : "";
        headMeta.createSpan({ text: urgency, cls: `act-deadline-hint ${cls}` });
      } else {
        headMeta.createSpan({ text: `截止 ${task.deadline}` });
      }
    }
    if (task.priority) headMeta.createSpan({ text: `P${task.priority}` });
    if (task.aiNote) headMeta.createSpan({ text: task.aiNote, cls: "act-head-remark" });
    const open = head.createEl("button", { text: "打开原笔记", cls: "act-progress-open", attr: { type: "button" } });
    open.addEventListener("click", () => this.plugin.openPath(task.filePath));

    const statusBar = container.createDiv({ cls: "act-status-switcher" });
    statusBar.createDiv({ text: "执行状态", cls: "act-status-switcher-label act-section-title" });
    this.sectionInfo(statusBar, {
      source: "任务笔记 frontmatter → tags 属性",
      rule: "点击状态标签切换任务的执行状态（写入 frontmatter tags）。再次点击当前状态可清除。状态与文件夹正交：文件夹管承诺程度，标签管当前进度。",
      props: [
        { name: "a-推进中", desc: "正在推进执行" },
        { name: "a-等待中", desc: "等待外部条件（别人回复、资源就位等）" },
        { name: "a-暂停搁置", desc: "暂时搁置，不紧急" },
        { name: "a-已完成", desc: "已完成，从列表隐藏" }
      ]
    });
    const currentStatus = this.getActionStatus(task);
    for (const s of ActWorkspaceView.ACTION_STATUSES) {
      const chip = statusBar.createEl("button", { text: s.label, cls: `act-status-chip is-${s.css} ${currentStatus === s.css ? "is-current" : ""}`, attr: { type: "button" } });
      chip.addEventListener("click", async () => {
        if (currentStatus === s.css) {
          await this.setActionStatus(task, "");
        } else {
          await this.setActionStatus(task, s.tag);
        }
        await this.render();
      });
    }

    // --- 记录进展（输入框）---
    const editor = container.createDiv({ cls: "act-workbench-editor" });
    editor.createDiv({ text: "记录进展", cls: "act-workbench-editor-title act-section-title" });
    this.sectionInfo(editor, {
      source: `写入到任务笔记 → ${this.plugin.settings.progressLog.heading} 区块顶部`,
      rule: `选择类型后输入内容，保存后按「${this.plugin.settings.progressLog.format === "bullet-time" ? "项目符 + 时间" : "三级标题 + 时间"}」插入。非进展类型会以【类型】前缀写入，如【卡点】内容。`
    });
    const draft = this.progressDrafts[task.filePath] ?? { text: "", type: "进展" };
    let recordType = draft.type;
    let draftSaveTimer: number | null = null;
    const saveDraft = () => { this.progressDrafts[task.filePath] = draft; this.plugin.saveSettings(); };
    // 输入防抖：避免每敲一个键就写一次 data.json
    const saveDraftDebounced = () => {
      if (draftSaveTimer !== null) window.clearTimeout(draftSaveTimer);
      draftSaveTimer = window.setTimeout(() => {
        draftSaveTimer = null;
        saveDraft();
      }, 400);
    };
    const typeRow = editor.createDiv({ cls: "act-progress-type-row" });
    for (const type of ["进展", "判断", "卡点", "情绪", "下步行动"]) {
      const chip = typeRow.createEl("button", { text: type, cls: `act-progress-type ${type === recordType ? "is-active" : ""}`, attr: { type: "button" } });
      chip.addEventListener("click", () => {
        recordType = type;
        draft.type = type;
        saveDraft();
        typeRow.querySelectorAll(".act-progress-type").forEach((el) => el.removeClass("is-active"));
        chip.addClass("is-active");
      });
    }
    const inputRow = editor.createDiv({ cls: "act-workbench-input-row" });
    const input = inputRow.createEl("textarea", {
      cls: "act-progress-input",
      attr: { placeholder: "记录进展、判断、卡点...", rows: "4" }
    });
    input.value = draft.text;
    input.addEventListener("input", () => {
      draft.text = input.value;
      saveDraftDebounced();
    });
    input.addEventListener("blur", () => {
      if (draftSaveTimer !== null) {
        window.clearTimeout(draftSaveTimer);
        draftSaveTimer = null;
        saveDraft();
      }
    });
    const btnGroup = inputRow.createDiv({ cls: "act-progress-btn-group" });
    let expanded = false;
    const expandBtn = btnGroup.createEl("button", { cls: "act-progress-expand", attr: { type: "button" } });
    setIcon(expandBtn, "maximize-2");
    expandBtn.addEventListener("click", () => {
      expanded = !expanded;
      input.classList.toggle("is-expanded", expanded);
      setIcon(expandBtn, expanded ? "minimize-2" : "maximize-2");
      input.focus();
    });
    const save = btnGroup.createEl("button", { text: "保存", cls: "act-progress-save", attr: { type: "button" } });
    save.addEventListener("click", async () => {
      const text = input.value.trim();
      if (!text) { new Notice("先写点内容"); input.focus(); return; }
      if (recordType === "下步行动") {
        await this.plugin.appendNextAction(task.filePath, text);
      } else {
        await this.plugin.appendProgressToTask(task.filePath, `【${recordType}】${text}`);
      }
      this.progressDrafts[task.filePath] = { text: "", type: recordType };
      await this.plugin.saveSettings();
      await this.render();
    });

    // --- 下步行动 ---
    const section = getNextActionSection(content);
    const contentLines = content.split("\n");
    const nextActionLines = section
      ? contentLines.slice(section.start, section.end).map((line, offset) => ({ line, lineIndex: section.start + offset, writable: true }))
      : task.todos.map((todo) => ({ line: `- [ ] ${todo}`, lineIndex: -1, writable: false }));
    const visibleNextActionLines = nextActionLines.filter((item) => item.line.trim());
    if (visibleNextActionLines.length > 0) {
      const nextBox = container.createDiv({ cls: "act-workbench-next" });
      nextBox.createDiv({ text: "下步行动", cls: "act-workbench-next-title act-section-title" });
      this.sectionInfo(nextBox, {
        source: "任务笔记 → ## 下步行动 区块",
        rule: "读取任务笔记中 ## 下步行动（或 ## 下一步行动 / ## 行动清单）下的内容。支持复选框（- [ ] / - [x]）和普通列表。"
      });
      const nextBody = nextBox.createDiv({ cls: "act-workbench-next-body" });
      for (const action of visibleNextActionLines) {
        const line = action.line;
        const trimmed = line.trim();
        if (!trimmed) continue;
        const isCheckbox = /^[-*]\s*\[([ xX])\]\s*(.+)/.exec(trimmed);
        if (isCheckbox) {
          const done = isCheckbox[1].toLowerCase() === "x";
          const row = nextBody.createDiv({ cls: `act-workbench-todo ${done ? "is-done" : ""}` });
          const check = row.createDiv({ cls: "act-focus-action-check" });
          check.createDiv();
          if (!done && action.writable) {
            check.setAttribute("role", "button");
            check.setAttribute("aria-label", "完成行动项");
            check.setAttribute("title", "完成行动项");
            check.addEventListener("click", async () => {
              await this.plugin.completeTaskActionItem(task.filePath, action.lineIndex);
              await this.render();
            });
          }
          row.createSpan({ text: isCheckbox[2].trim(), cls: "act-workbench-todo-text" });
        } else if (/^[-*]\s+/.test(trimmed)) {
          const row = nextBody.createDiv({ cls: "act-workbench-todo" });
          const check = row.createDiv({ cls: "act-focus-action-check" });
          check.createDiv();
          if (action.writable) {
            check.setAttribute("role", "button");
            check.setAttribute("aria-label", "完成行动项");
            check.setAttribute("title", "完成行动项");
            check.addEventListener("click", async () => {
              await this.plugin.completeTaskActionItem(task.filePath, action.lineIndex);
              await this.render();
            });
          }
          row.createSpan({ text: trimmed.replace(/^[-*]\s+/, ""), cls: "act-workbench-todo-text" });
        } else {
          nextBody.createDiv({ text: trimmed.replace(/^[-*]\s+/, ""), cls: "act-workbench-todo-plain" });
        }
      }
    } else {
      const nextBox = container.createDiv({ cls: "act-workbench-next is-empty" });
      nextBox.createDiv({ text: "下步行动", cls: "act-workbench-next-title act-section-title" });
      this.sectionInfo(nextBox, {
        source: "任务笔记 → ## 下步行动 区块",
        rule: "读取任务笔记中 ## 下步行动（或 ## 下一步行动 / ## 行动清单）下的内容。支持复选框（- [ ] / - [x]）和普通列表。"
      });
      nextBox.createDiv({ text: "还没有写下一步，在原笔记的 ## 下步行动 中添加", cls: "act-empty" });
    }

    // --- 最近进展 ---
    if (entries.length > 0) {
      const recentBox = container.createDiv({ cls: "act-workbench-recent" });
      recentBox.createDiv({ text: "最近进展", cls: "act-workbench-section-title act-section-title" });
      this.sectionInfo(recentBox, {
        source: `任务笔记 → ${this.plugin.settings.progressLog.heading} 区块（最近 3 条）`,
        rule: "识别两种格式：1) ### 标题 作为分段标记；2) 以日期开头的列表项（- YYYY-MM-DD HH:MM 内容 或 - [[YYYY-MM-DD（周几）]] 内容）。按时间倒序，仅显示最近 3 条。",
        props: [
          { name: "### 标题", desc: "三级标题作为进展分段标记" },
          { name: "- YYYY-MM-DD HH:MM", desc: "日期时间开头的列表项" },
          { name: "- [[日期链接]]", desc: "Obsidian 日期双链开头的列表项" }
        ]
      });
      for (const entry of entries.slice(0, 3)) {
        const { tag, body: entryBody } = extractProgressTypeTag(entry.text);
        const item = recentBox.createDiv({ cls: `act-progress-entry ${tag ? `is-type-${tag}` : ""}` });
        const timeRow = item.createDiv({ cls: "act-progress-entry-time" });
        timeRow.createSpan({ text: entry.marker || "记录" });
        if (tag) timeRow.createSpan({ text: tag, cls: `act-progress-tag is-${tag}` });
        item.createDiv({ text: entryBody, cls: "act-progress-entry-text" });
      }
    }

  }

  private async renderFixedSchedule(container: HTMLElement) {
    if (!this.plugin.settings.dida.enabled) return;
    const section = this.section(container, "固定日程", "滴答清单 · 今日");
    section.addClass("act-dida-section");
    const actions = section.createDiv({ cls: "act-dida-header-actions" });
    this.didaToolButton(actions, "新增任务", "plus", () => this.plugin.captureDidaTask());
    this.didaToolButton(actions, "打开滴答清单", "external-link", () => window.open(DIDA_WEB_URL, "_blank"));
    this.didaToolButton(actions, "任务更新", "refresh-cw", async () => {
      try {
        this.invalidateDidaActiveCache();
        const didaAdded = await this.plugin.syncCompletedDidaToWeekly({ silent: true });
        const actionResult = await this.plugin.syncActionCompletedToWeekly();
        const parts: string[] = [];
        if (didaAdded > 0) parts.push(`滴答 ${didaAdded} 条`);
        if (actionResult.today > 0) parts.push(`行动 ${actionResult.today} 条`);
        if (actionResult.backfill > 0) parts.push(`补录历史 ${actionResult.backfill} 条`);
        new Notice(parts.length > 0 ? `已同步完成记录：${parts.join("、")}` : "已更新，无新增完成记录");
      } catch (error) {
        console.error("任务更新失败", error);
        new Notice(`同步失败：${error instanceof Error ? error.message : String(error)}`);
      }
      await this.render();
    });
    this.sectionInfo(section, {
      source: "滴答清单 Open API（设置中配置 Access Token）",
      rule: `今日任务 = dueDate 为今天；未安排任务 = 无 dueDate 或已超期。点击「任务更新」按钮可将完成记录同步到周记。按优先级降序、截止日期升序排列。`,
      props: [
        { name: "priority", desc: "0=无, 1=低, 3=中, 5=高" },
        { name: "dueDate", desc: "任务截止日期" },
        { name: "status", desc: "0=进行中, 2=已完成" }
      ]
    });

    const layout = section.createDiv({ cls: "act-dida-layout" });
    await this.renderTodayDidaPanel(layout);
    await this.renderUnscheduledDidaPanel(layout);
  }

  private didaToolButton(container: HTMLElement, label: string, icon: string, onClick: () => void) {
    const button = container.createEl("button", { cls: "act-dida-tool", attr: { type: "button" } });
    const iconEl = button.createSpan({ cls: "act-dida-tool-icon" });
    setIcon(iconEl, icon);
    button.createSpan({ text: label, cls: "act-dida-tool-label" });
    button.addEventListener("click", onClick);
  }

  private async renderTodayDidaPanel(container: HTMLElement) {
    await this.renderDidaApiPanel(container, "今日任务", undefined, "今天没有任务", (task) => this.isTodayDidaTask(task));
  }

  private async renderUnscheduledDidaPanel(container: HTMLElement) {
    await this.renderDidaApiPanel(
      container,
      "未安排任务",
      DIDA_PREVIEW_LIMIT,
      "暂无未安排或超期任务",
      (task) => this.isUnscheduledOrOverdueDidaTask(task),
      {
        expanded: this.didaUnscheduledExpanded,
        collapsedText: "已折叠，点击展开",
        onToggle: (panel, expanded) => this.toggleDidaApiPanel(
          panel,
          expanded,
          "未安排任务",
          DIDA_PREVIEW_LIMIT,
          "暂无未安排或超期任务",
          (task) => this.isUnscheduledOrOverdueDidaTask(task)
        )
      }
    );
  }

  private async toggleDidaApiPanel(
    panel: HTMLElement,
    expanded: boolean,
    title: string,
    limit: number | undefined,
    emptyMessage: string,
    filterTask: (task: DidaTask) => boolean
  ) {
    this.didaUnscheduledExpanded = !expanded;
    panel.empty();
    await this.renderDidaApiPanelContent(panel, title, limit, emptyMessage, filterTask, {
      expanded: this.didaUnscheduledExpanded,
      collapsedText: "已折叠，点击展开",
      onToggle: (nextPanel, nextExpanded) => this.toggleDidaApiPanel(nextPanel, nextExpanded, title, limit, emptyMessage, filterTask)
    });
  }

  private async renderDidaApiPanel(
    container: HTMLElement,
    title: string,
    limit: number | undefined,
    emptyMessage: string,
    filterTask: (task: DidaTask) => boolean,
    toggle?: { expanded: boolean; collapsedText: string; onToggle: (panel: HTMLElement, expanded: boolean) => void | Promise<void> }
  ) {
    const panel = container.createDiv({
      cls: `act-dida-panel ${toggle ? "is-collapsible" : ""} ${toggle && !toggle.expanded ? "is-collapsed" : ""}`
    });
    await this.renderDidaApiPanelContent(panel, title, limit, emptyMessage, filterTask, toggle);
  }

  private async renderDidaApiPanelContent(
    panel: HTMLElement,
    title: string,
    limit: number | undefined,
    emptyMessage: string,
    filterTask: (task: DidaTask) => boolean,
    toggle?: { expanded: boolean; collapsedText: string; onToggle: (panel: HTMLElement, expanded: boolean) => void | Promise<void> }
  ) {
    panel.toggleClass("is-collapsible", Boolean(toggle));
    panel.toggleClass("is-collapsed", Boolean(toggle && !toggle.expanded));
    const head = panel.createDiv({ cls: "act-dida-panel-head" });
    if (toggle) {
      const titleButton = head.createEl("button", { cls: "act-dida-panel-toggle", attr: { type: "button" } });
      titleButton.createSpan({ text: toggle.expanded ? "▾" : "▸", cls: "act-dida-panel-toggle-icon" });
      titleButton.createSpan({ text: title, cls: "act-dida-panel-title" });
      titleButton.addEventListener("click", () => void toggle.onToggle(panel, toggle.expanded));
    } else {
      head.createDiv({ text: title, cls: "act-dida-panel-title" });
    }
    const countEl = head.createDiv({ text: "正在读取...", cls: "act-dida-count" });

    if (toggle && !toggle.expanded) {
      countEl.setText(toggle.collapsedText);
      head.addEventListener("click", (event) => {
        if (event.target instanceof HTMLElement && event.target.closest("button")) return;
        void toggle.onToggle(panel, toggle.expanded);
      });
      return;
    }

    const listEl = panel.createDiv({ cls: "act-dida-list" });

    const token = await this.plugin.getDidaApiToken();
    if (!token) {
      countEl.setText("Token 不可用");
      this.empty(listEl, "请先在插件设置 → 滴答清单中配置 Access Token");
      return;
    }

    try {
      const tasks = (await this.getCachedActiveDidaTasks(token))
        .filter(filterTask)
        .sort((a, b) => {
          const rankDelta = this.getDidaPriorityRank(b) - this.getDidaPriorityRank(a);
          if (rankDelta !== 0) return rankDelta;
          return this.getDidaDueTimestamp(a) - this.getDidaDueTimestamp(b);
        });
      const visibleTasks = typeof limit === "number" ? tasks.slice(0, limit) : tasks;

      if (visibleTasks.length === 0) {
        countEl.setText("暂无任务");
        this.empty(listEl, emptyMessage);
        return;
      }

      for (const task of visibleTasks) this.renderDidaTaskRow(listEl, task);
      const hiddenCount = typeof limit === "number" ? Math.max(0, tasks.length - limit) : 0;
      countEl.setText(hiddenCount > 0 ? `显示 ${visibleTasks.length} 个，还有 ${hiddenCount} 个` : `共 ${tasks.length} 个`);
    } catch (error) {
      console.error("Failed to load Dida tasks", error);
      countEl.setText("读取失败");
      this.empty(listEl, "未能读取滴答清单任务，请检查 Access Token 或网络连接");
    }
  }

  private async getCachedActiveDidaTasks(token: string): Promise<DidaTask[]> {
    const now = Date.now();
    if (this.didaActiveCache?.token === token) {
      if (this.didaActiveCache.promise) return this.didaActiveCache.promise;
      if (now - this.didaActiveCache.fetchedAt < DIDA_ACTIVE_CACHE_MS) return this.didaActiveCache.tasks;
    }

    const promise = this.fetchActiveDidaTasks(token);
    this.didaActiveCache = {
      token,
      fetchedAt: now,
      tasks: this.didaActiveCache?.token === token ? this.didaActiveCache.tasks : [],
      promise
    };
    try {
      const tasks = await promise;
      this.didaActiveCache = { token, fetchedAt: Date.now(), tasks };
      return tasks;
    } catch (error) {
      this.didaActiveCache = null;
      throw error;
    }
  }

  invalidateDidaActiveCache() {
    this.didaActiveCache = null;
  }

  private async fetchActiveDidaTasks(token: string): Promise<DidaTask[]> {
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const projectsRes = await requestUrl({ url: `${DIDA_API_BASE}/open/v1/project`, method: "GET", headers });
    const projects = projectsRes.json as { id: string; name: string }[];
    if (!Array.isArray(projects)) {
      console.error("[ACT] Dida projects response is not an array", projectsRes.json);
      return [];
    }
    projects.unshift({ id: "inbox", name: "收件箱" });

    const results = await Promise.all(
      projects.map(async (project): Promise<DidaTask[]> => {
        try {
          const res = await requestUrl({ url: `${DIDA_API_BASE}/open/v1/project/${encodeURIComponent(project.id)}/data`, method: "GET", headers });
          const data = res.json as { tasks?: DidaTask[] };
          return (data.tasks ?? []).map((t) => ({ ...t, projectId: t.projectId ?? project.id }));
        } catch (error) {
          console.error(`[ACT] Failed to fetch tasks for project "${project.name}"`, error);
          return [];
        }
      })
    );
    const allTasks: DidaTask[] = [];
    for (const batch of results) {
      for (const t of batch) {
        if (t.id && t.title && t.status === 0) allTasks.push(t);
      }
    }
    return allTasks;
  }

  private isTodayDidaTask(task: DidaTask): boolean {
    const dueDate = this.getDidaDueDate(task);
    return Boolean(dueDate && formatDateOnly(dueDate) === formatDateOnly(new Date()));
  }

  private isUnscheduledOrOverdueDidaTask(task: DidaTask): boolean {
    const dueDate = this.getDidaDueDate(task);
    if (!dueDate) return true;
    return this.isOverdueDidaTask(task);
  }

  private isOverdueDidaTask(task: DidaTask): boolean {
    const dueDate = this.getDidaDueDate(task);
    if (!dueDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dueDate.getTime() < today.getTime();
  }

  private getDidaDueDate(task: DidaTask): Date | null {
    const raw = task.dueDate ?? task.startDate;
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private getDidaDueTimestamp(task: DidaTask): number {
    return this.getDidaDueDate(task)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  }

  private getDidaPriorityRank(task: DidaTask): number {
    return task.priority ?? 0;
  }

  private getDidaPriorityLabel(task: DidaTask): string {
    const p = task.priority ?? 0;
    if (p >= 5) return "高";
    if (p >= 3) return "中";
    if (p >= 1) return "低";
    return "";
  }

  private formatDidaDueText(task: DidaTask): string {
    const dueDate = this.getDidaDueDate(task);
    if (!dueDate) return "未安排";
    return `${formatDateOnly(dueDate)} 截止`;
  }

  private renderDidaTaskRow(container: HTMLElement, task: DidaTask) {
    const row = container.createDiv({ cls: "act-dida-task" });
    row.setAttr("data-priority", String(task.priority ?? 0));
    const check = row.createDiv({ cls: "act-dida-check" });
    check.setAttr("role", "button");
    check.setAttr("aria-label", "完成任务");
    check.setAttr("title", "完成任务");
    check.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (row.hasClass("is-completing")) return;
      row.addClass("is-completing");
      const completed = await this.plugin.completeDidaTask(task.id, task.projectId ?? "");
      if (completed) {
        this.invalidateDidaActiveCache();
        await this.render();
      } else {
        row.removeClass("is-completing");
      }
    });
    check.createDiv();
    const body = row.createDiv({ cls: "act-dida-body" });
    const titleEl = body.createDiv({ text: normalizeInlineText(task.title), cls: "act-dida-title" });
    const priorityLabel = this.getDidaPriorityLabel(task);
    if (priorityLabel) titleEl.createSpan({ text: priorityLabel, cls: "act-dida-priority" });
    const overdue = this.isOverdueDidaTask(task);
    if (overdue) titleEl.createSpan({ text: "已过期", cls: "act-dida-overdue" });
    const dueText = this.formatDidaDueText(task);
    if (dueText !== "未安排") body.createDiv({ text: dueText, cls: `act-dida-due ${overdue ? "is-overdue" : ""}` });
    const actions = row.createDiv({ cls: "act-dida-task-actions" });
    this.didaTaskActionButton(actions, "编辑任务", "pencil", () => this.plugin.editDidaTask(task));
    this.didaTaskActionButton(actions, "删除任务", "trash-2", async () => {
      const title = normalizeInlineText(task.title);
      const confirmed = window.confirm(`确定删除滴答清单任务「${title}」吗？\n\n删除后无法从首页恢复。`);
      if (!confirmed) return;
      if (row.hasClass("is-mutating")) return;
      row.addClass("is-mutating");
      const deleted = await this.plugin.deleteDidaTask(task.id, task.projectId ?? "inbox");
      if (deleted) {
        this.invalidateDidaActiveCache();
        await this.render();
      } else {
        row.removeClass("is-mutating");
      }
    });
    const desc = normalizeInlineText(task.content ?? task.desc ?? "");
    if (desc) body.createDiv({ text: desc, cls: "act-dida-desc" });
  }

  private didaTaskActionButton(container: HTMLElement, label: string, icon: string, onClick: () => void | Promise<void>) {
    const button = container.createEl("button", { cls: "act-dida-task-action", attr: { type: "button", "aria-label": label, title: label } });
    setIcon(button, icon);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void onClick();
    });
  }

  private async renderWeeklyFlow(container: HTMLElement) {
    const section = this.section(container, "12周流程", "12周 · 流程");
    this.sectionInfo(section, {
      source: `${this.F.cycle} 周期文件 + ${this.F.weekly} 本周周记`,
      rule: "5 步流程判断：启动=目标文件含 G1 → 周计划=周记含 [本周策略执行] → 执行=非周六且已有周计划 → 周评分=周记含执行分且已填写 → 下周期=下一个 12 周文件含 G1。绿色高亮当前应关注的步骤。"
    });
    const today = new Date();
    const year = today.getFullYear();
    const ci = getCycleInfo(today, this.plugin.settings.cycleMode);
    const yearCycle = ci.cycle;
    const nextCycle = getNextYearCycle(year, yearCycle);
    const weekOfCycle = ci.weekOfCycle;
    const weekId = formatWeekId(today);
    const cyclePath = `${this.F.cycle}/${year}-${yearCycle}.md`;
    const nextCyclePath = `${this.F.cycle}/${nextCycle.year}-${nextCycle.cycle}.md`;
    const weekPath = `${this.F.weekly}/${weekId}.md`;
    const cycleFile = this.app.vault.getAbstractFileByPath(cyclePath);
    const nextCycleFile = this.app.vault.getAbstractFileByPath(nextCyclePath);
    const weekFile = this.app.vault.getAbstractFileByPath(weekPath);

    let cycleStarted = false;
    let nextCycleStarted = false;
    let weekPlanDone = false;
    let weekRatingDone = false;
    let cycleReviewDone = false;
    if (cycleFile instanceof TFile) {
      const content = await this.app.vault.cachedRead(cycleFile);
      cycleStarted = content.includes("### G1");
      cycleReviewDone = content.includes("周期总结") && content.match(/周期总结[：:]\s*\n\s*>/) === null;
    }
    if (nextCycleFile instanceof TFile) {
      const content = await this.app.vault.cachedRead(nextCycleFile);
      nextCycleStarted = content.includes("### G1");
    }
    if (weekFile instanceof TFile) {
      const content = await this.app.vault.cachedRead(weekFile);
      weekPlanDone = content.includes("本周策略执行");
      const exec = content.match(/执行分[：:]\s*(.+)/);
      weekRatingDone = Boolean(exec?.[1] && !exec[1].includes("待周末") && !exec[1].includes("周末填入"));
    }
    const isSaturday = today.getDay() === 6;
    const steps = [
      { label: "启动", done: cycleStarted, current: weekOfCycle === 1, path: cyclePath },
      { label: "周计划", done: weekPlanDone, current: isSaturday && !weekPlanDone, path: weekPath },
      { label: "执行", done: false, current: !isSaturday && weekPlanDone && !weekRatingDone, path: weekPath },
      { label: "周评分", done: weekRatingDone, current: isSaturday && weekPlanDone && !weekRatingDone, path: weekPath },
      { label: nextCycle.cycle, done: nextCycleStarted, current: weekOfCycle >= ci.totalWeeks && cycleReviewDone && !nextCycleStarted, path: nextCyclePath }
    ];
    const row = section.createDiv({ cls: "act-flow" });
    for (const step of steps) {
      const el = row.createEl("button", { text: step.label, cls: `act-flow-step ${step.done ? "is-done" : ""} ${step.current ? "is-active" : ""}` });
      el.addEventListener("click", () => this.plugin.openPath(step.path));
    }
    const current = steps.find((s) => s.current);
    section.createDiv({ text: current ? `现在应关注：${current.label}` : "本周流程已完成，继续执行策略", cls: "act-hint" });
  }

  /* ========= CARD TAB (C 层 · 知识) ========= */

  private async renderCardTab(container: HTMLElement) {
    const grid = container.createDiv({ cls: "act-panel-grid" });
    const main = grid.createDiv({ cls: "act-panel-main" });
    const side = grid.createDiv({ cls: "act-panel-side" });

    await this.renderIndexCardOverview(main);
    await this.renderCardOverview(side);
    await this.renderRecentCards(side);
  }

  private async renderIndexCardOverview(container: HTMLElement) {
    const section = this.section(container, "主题索引", "知识 · 索引");
    this.smallAction(section, "新增索引", () => this.plugin.captureIndexCard());
    this.sectionInfo(section, {
      source: `${this.F.indexCard} 下的索引卡文件`,
      rule: "按子文件夹（主题索引 / 人物索引）分组展示。每张索引卡显示被核心卡 index 属性引用的次数。"
    });

    const mainCardFiles = this.getCardFiles("mainCard", this.F.mainCard);
    const indexRefCounts = new Map<string, number>();
    for (const file of mainCardFiles) {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (!fm?.["index"]) continue;
      const indexVal = fm["index"];
      const refs = Array.isArray(indexVal) ? indexVal : [indexVal];
      for (const ref of refs) {
        const name = String(ref).replace(/^\[\[|\]\]$/g, "").trim();
        if (name) indexRefCounts.set(name, (indexRefCounts.get(name) ?? 0) + 1);
      }
    }

    const allIndexFiles = this.getCardFiles("indexCard", this.F.indexCard)
      .sort((a, b) => a.basename.localeCompare(b.basename, "zh-CN"));
    if (allIndexFiles.length === 0) {
      this.empty(section, "还没有索引卡");
      return;
    }

    const chipRow = section.createDiv({ cls: "act-chip-row" });
    for (const file of allIndexFiles) {
      const count = indexRefCounts.get(file.basename) ?? 0;
      const chip = chipRow.createDiv({ cls: "act-index-chip is-clickable" });
      chip.createSpan({ text: file.basename.replace(/^[kbp]\d*-/, ""), cls: "act-index-chip-name" });
      if (count > 0) chip.createSpan({ text: String(count), cls: "act-index-chip-count" });
      chip.addEventListener("click", () => this.plugin.openPath(file.path));
    }
  }

  private async renderCardOverview(container: HTMLElement) {
    const section = this.section(container, "知识层总览", "知识 · 总览", "dark");
    this.sectionInfo(section, {
      source: `${this.F.card} 下各子文件夹的 Markdown 文件数`,
      rule: "递归统计每个子文件夹中的 .md 文件数量。",
      props: [
        { name: "核心卡 (24)", desc: "经过深度思考提炼的永久笔记" },
        { name: "阅读卡 (23)", desc: "来源书籍/文章的阅读笔记" },
        { name: "索引卡 (22)", desc: "连接多张卡片的主题入口" },
        { name: "新卡暂存 (21)", desc: "尚未归类的新笔记" }
      ]
    });

    const dvp = this.plugin.settings.dvPaths;
    const vis = this.plugin.settings.cardVisibility ?? {};
    const allFolders = [
      { key: "mainCard", path: this.F.mainCard, label: "核心卡", color: "green", dv: dvp.mainCard },
      { key: "bibCard", path: this.F.bibCard, label: "阅读卡", color: "purple", dv: dvp.bibCard },
      { key: "indexCard", path: this.F.indexCard, label: "索引卡", color: "default", dv: dvp.indexCard },
      { key: "newCard", path: this.F.newCard, label: "新卡暂存", color: "default", dv: dvp.newCard }
    ];
    const folders = allFolders.filter((f) => vis[f.key] !== false && f.path);

    const stats = section.createDiv({ cls: "act-analytics-platforms" });
    for (const f of folders) {
      const count = this.getCardFiles(f.key, f.path).length;
      const card = stats.createDiv({ cls: `act-platform-card${f.dv ? " is-clickable" : ""}` });
      card.setAttribute("data-color", f.color);
      card.createDiv({ text: String(count), cls: "act-platform-value" });
      card.createDiv({ text: f.label, cls: "act-platform-name" });
      if (f.dv) card.addEventListener("click", () => this.plugin.openPath(f.dv));
    }
  }

  private async renderRecentCards(container: HTMLElement) {
    const section = this.section(container, "最近写的卡片", "知识 · 最近");
    this.smallAction(section, "新增卡片", () => this.plugin.captureKnowledgeCard());
    this.sectionInfo(section, {
      source: `${this.F.mainCard} 与 ${this.F.bibCard} 按修改时间排序`,
      rule: "取最近修改的 10 张卡片，读取 frontmatter 属性展示。",
      props: [
        { name: "created", desc: "卡片创建日期" },
        { name: "index", desc: "索引卡双链，指向所属主题" },
        { name: "扫描卡片", desc: "关联的扫描图片文件名" }
      ]
    });

    const allCards: TFile[] = [];
    for (const cardKey of ["mainCard", "bibCard"] as const) {
      allCards.push(...this.getCardFiles(cardKey, this.F[cardKey]));
    }
    allCards.sort((a, b) => b.stat.mtime - a.stat.mtime);
    const recent = allCards.slice(0, 5);

    if (recent.length === 0) {
      this.empty(section, "还没有核心卡或阅读卡");
      return;
    }

    const columns = [
      { key: "title", label: "标题" },
      { key: "type", label: "类型", width: "50px" },
      { key: "created", label: "创建", width: "72px" },
      { key: "index", label: "索引" },
      { key: "modified", label: "修改", width: "72px" }
    ];
    const rows: { data: Record<string, string>; onClick: () => void }[] = [];
    for (const file of recent) {
      const mainFiles = this.getCardFiles("mainCard", this.F.mainCard);
      const isMain = mainFiles.some((f) => f.path === file.path);
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
      const indexVal = fm["index"];
      let indexStr = "—";
      if (Array.isArray(indexVal)) indexStr = indexVal.map((v: string) => String(v).replace(/^\[\[|\]\]$/g, "")).join(", ");
      else if (indexVal) indexStr = String(indexVal).replace(/^\[\[|\]\]$/g, "");
      const created = fm["created"] ? String(fm["created"]).slice(0, 10) : "—";
      rows.push({
        data: {
          title: file.basename,
          type: isMain ? "核心" : "阅读",
          created,
          index: indexStr,
          modified: new Date(file.stat.mtime).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })
        },
        onClick: () => this.plugin.openPath(file.path)
      });
    }
    this.renderDataTable(section, columns, rows);
  }

  /* ========= TIME TAB (T 层 · 方向) ========= */

  private async renderTimeTab(container: HTMLElement) {
    const grid = container.createDiv({ cls: "act-panel-grid" });
    const main = grid.createDiv({ cls: "act-panel-main" });
    const side = grid.createDiv({ cls: "act-panel-side" });

    await this.renderCurrentCycleGoals(main);
    await this.renderWeeklyFlow(main);

    await this.renderVisionSummary(side);
    await this.renderWeeklyHistory(side);
  }

  private async renderCurrentCycleGoals(container: HTMLElement) {
    const today = new Date();
    const ci = getCycleInfo(today, this.plugin.settings.cycleMode);
    const yearCycle = ci.cycle;
    const year = today.getFullYear();
    const cyclePath = `${this.F.cycle}/${year}-${yearCycle}.md`;
    const weekOfCycle = ci.weekOfCycle;

    const cycleLabel = ci.totalWeeks === 12 ? "十二周目标" : `${ci.totalWeeks}周目标`;
    const section = this.section(container, `${year}-${yearCycle} ${cycleLabel}`, "方向 · 目标", "dark");
    this.sectionInfo(section, {
      source: cyclePath,
      rule: "读取周期文件中 ### G1 - / G2 - 格式的目标，自动识别目标区块内的 [[双链]] 并匹配行动模块中的任务笔记（需有 a-任务笔记 标签）。点击任务名可跳转到行动模块。",
      props: [
        { name: "### G1/G2/G3", desc: "目标标题" },
        { name: "[[任务名]]", desc: "目标区块内的双链，自动关联任务笔记" },
        { name: "进度条", desc: `当前周数 / ${ci.totalWeeks} 周` }
      ]
    });
    this.smallAction(section, "打开目标笔记", () => this.plugin.openPath(cyclePath));

    const file = this.app.vault.getAbstractFileByPath(cyclePath);
    if (!(file instanceof TFile)) {
      this.empty(section, "当前周期目标尚未创建");
      return;
    }

    const content = await this.app.vault.cachedRead(file);

    const progressBar = section.createDiv({ cls: "act-cycle-progress" });
    const bar = progressBar.createDiv({ cls: "act-cycle-bar" });
    const fill = bar.createDiv({ cls: "act-cycle-fill" });
    fill.style.width = `${Math.round((weekOfCycle / ci.totalWeeks) * 100)}%`;
    progressBar.createDiv({ text: `第 ${weekOfCycle} 周 / ${ci.totalWeeks} 周`, cls: "act-cycle-label" });

    const actionTasks = await this.parseActionTasks();
    const taskByName = new Map<string, ActionTask>();
    for (const t of actionTasks) taskByName.set(t.title, t);

    const lines = content.split("\n");
    const goalSections: { id: string; title: string; links: string[] }[] = [];
    let current: { id: string; title: string; links: string[] } | null = null;
    for (const line of lines) {
      const goalMatch = line.match(/^###\s+(G\s*\d+)\s*[-–—：:]\s*(.+)/);
      if (goalMatch) {
        if (current) goalSections.push(current);
        current = { id: goalMatch[1].replace(/\s+/g, ""), title: goalMatch[2].trim(), links: [] };
      } else if (line.match(/^###?\s+/) && current) {
        goalSections.push(current);
        current = null;
      }
      if (current) {
        const wikilinks = line.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g);
        for (const m of wikilinks) {
          const name = m[1].trim();
          if (taskByName.has(name) && !current.links.includes(name)) current.links.push(name);
        }
      }
    }
    if (current) goalSections.push(current);

    if (goalSections.length === 0) {
      this.empty(section, "目标笔记中未找到 G1/G2/G3 格式的目标");
      return;
    }

    for (const goal of goalSections) {
      const goalBox = section.createDiv({ cls: "act-goal-box" });
      const goalHead = goalBox.createDiv({ cls: "act-goal-head" });
      goalHead.createSpan({ text: goal.id, cls: "act-badge" });
      const goalLink = goalHead.createEl("a", { text: goal.title, cls: "act-goal-title", href: "#" });
      goalLink.addEventListener("click", (e) => { e.preventDefault(); this.plugin.openPath(cyclePath); });

      if (goal.links.length > 0) {
        const taskList = goalBox.createDiv({ cls: "act-goal-tasks" });
        for (const linkName of goal.links) {
          const task = taskByName.get(linkName);
          if (!task) continue;
          const status = this.getActionStatus(task);
          const statusInfo = ActWorkspaceView.ACTION_STATUSES.find((s) => s.css === status);
          const taskRow = taskList.createDiv({ cls: "act-goal-task-row" });
          if (statusInfo) {
            taskRow.createSpan({ text: statusInfo.label, cls: `act-goal-task-status is-${status}` });
          }
          const taskLink = taskRow.createEl("a", { text: task.title, cls: "act-goal-task-name", href: "#" });
          taskLink.addEventListener("click", (e) => {
            e.preventDefault();
            this.selectedProgressTaskPath = task.filePath;
            this.activeTab = "action";
            this.render();
          });
        }
      }
    }
  }

  private async renderVisionSummary(container: HTMLElement) {
    const section = this.section(container, "愿景", "方向 · 愿景");
    this.sectionInfo(section, {
      source: this.F.vision,
      rule: "列出愿景文件夹中的 .md 文件，按修改时间降序，最多显示 3 个。"
    });
    const folder = this.app.vault.getAbstractFileByPath(this.F.vision);
    if (!(folder instanceof TFolder)) {
      this.empty(section, "愿景文件夹不存在");
      return;
    }
    const files = this.collectMarkdownFiles(folder).sort((a, b) => b.stat.mtime - a.stat.mtime);
    if (files.length === 0) {
      this.empty(section, "还没有写愿景信");
      return;
    }
    for (const file of files.slice(0, 3)) {
      const row = section.createDiv({ cls: "act-published-row" });
      const link = row.createEl("a", { text: file.basename, cls: "act-file-title", href: "#" });
      link.addEventListener("click", (event) => {
        event.preventDefault();
        this.plugin.openPath(file.path);
      });
    }
  }

  private async renderWeeklyHistory(container: HTMLElement) {
    const section = this.section(container, "最近周记", "方向 · 周记");

    const nextWeekDate = new Date();
    nextWeekDate.setDate(nextWeekDate.getDate() + 7);
    const nextWeekId = formatWeekId(nextWeekDate);
    const nextWeekPath = `${this.F.weekly}/${nextWeekId}.md`;
    const nextWeekExists = this.app.vault.getAbstractFileByPath(nextWeekPath) instanceof TFile;
    const btnRow = section.createDiv({ cls: "act-section-actions" });
    if (nextWeekExists) {
      this.smallAction(btnRow, `打开 ${nextWeekId}`, () => this.plugin.openPath(nextWeekPath));
    } else {
      this.smallAction(btnRow, `新建 ${nextWeekId}`, async () => {
        await this.plugin.ensureWeeklyFile(nextWeekId);
        await this.plugin.openPath(nextWeekPath);
        await this.render();
      });
    }

    this.sectionInfo(section, {
      source: `${this.F.weekly} 最近 8 周`,
      rule: "匹配文件名 YYYY-Wxx.md，按文件名倒序。读取 [本周计划] 区块统计已完成/未完成任务数。",
      props: [
        { name: "本周计划", desc: "复选框区块，统计完成状态" },
        { name: "日期范围", desc: "从周记文件名推算的周一至周日" }
      ]
    });
    const folder = this.app.vault.getAbstractFileByPath(this.F.weekly);
    if (!(folder instanceof TFolder)) {
      this.empty(section, "周记文件夹不存在");
      return;
    }
    const files = this.collectMarkdownFiles(folder)
      .filter((f) => /^\d{4}-W\d{2}\.md$/.test(f.name))
      .sort((a, b) => b.name.localeCompare(a.name))
      .slice(0, 8);

    if (files.length === 0) {
      this.empty(section, "还没有创建周记");
      return;
    }

    const columns = [
      { key: "week", label: "周记", width: "80px" },
      { key: "range", label: "日期范围" },
      { key: "open", label: "待办", width: "56px" },
      { key: "status", label: "状态", width: "56px" }
    ];
    const rows: { data: Record<string, string>; onClick: () => void }[] = [];
    for (const file of files) {
      const content = await this.app.vault.cachedRead(file);
      const allTasks = parseCheckboxesInSection(content, "本周计划");
      const openTasks = countOpenTasks(allTasks);
      const doneTasks = allTasks.length - openTasks;
      const weekId = file.basename.replace(".md", "");
      rows.push({
        data: {
          week: weekId,
          range: formatWeekRange(weekId),
          open: openTasks > 0 ? `${openTasks}` : "0",
          status: openTasks === 0 && allTasks.length > 0 ? "已完成" : openTasks > 0 ? "进行中" : "无计划"
        },
        onClick: () => this.plugin.openPath(file.path)
      });
    }
    this.renderDataTable(section, columns, rows);
  }

  private async parseActionTasks(): Promise<ActionTask[]> {
    const folders = [
      { path: this.F.focusAction, id: "11" as const },
      { path: this.F.activeAction, id: "12" as const }
    ];
    const tasks: ActionTask[] = [];
    const allMdFiles = this.app.vault.getMarkdownFiles();
    for (const folder of folders) {
      const prefix = folder.path + "/";
      const folderFiles = allMdFiles.filter((f) => f.path.startsWith(prefix));
      for (const child of folderFiles) {
        const content = await this.app.vault.cachedRead(child);
        const { tags, aiNote, personalNote, deadline, priority } = parseFrontmatterAction(content);
        if (!tags.includes("a-任务笔记")) continue;
        const entries = extractProgressEntries(content, this.plugin.settings.progressLog.heading);
        const latestProgressAt = entries[0] ? parseProgressMarkerTime(entries[0].marker) : Number.NaN;
        const todos = content.split("\n").filter((line) => /^[-*]\s*\[ \]\s*/.test(line)).map((line) => line.replace(/^[-*]\s*\[ \]\s*/, "").trim());
        tasks.push({
          title: child.basename,
          aiNote,
          personalNote,
          deadline,
          priority,
          tags,
          isTracked: tags.includes("a1-要事推进"),
          todos,
          filePath: child.path,
          folder: folder.id,
          latestProgressAt: Number.isNaN(latestProgressAt) ? null : latestProgressAt,
          latestProgressText: entries[0]?.text ?? "",
          progressCount: entries.length
        });
      }
    }
    return tasks;
  }

  private collectMarkdownFiles(folder: TFolder): TFile[] {
    const files: TFile[] = [];
    for (const child of folder.children) {
      if (child instanceof TFile && child.extension === "md") files.push(child);
      if (child instanceof TFolder) files.push(...this.collectMarkdownFiles(child));
    }
    return files;
  }

  private getCardFiles(key: string, folderPath: string): TFile[] {
    const mode = this.plugin.settings.cardSearchMode[key] || "folder";
    if (mode === "tag") {
      const tag = this.plugin.settings.cardTags[key];
      if (!tag) return [];
      return this.app.vault.getMarkdownFiles().filter((f) => {
        const cache = this.app.metadataCache.getFileCache(f);
        const t = cache?.frontmatter?.tags;
        if (!t) return false;
        return Array.isArray(t) ? t.includes(tag) : t === tag;
      });
    }
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) return [];
    return this.collectMarkdownFiles(folder);
  }

  private section(container: HTMLElement, title: string, label = "", theme = ""): HTMLElement {
    const section = container.createDiv({ cls: "act-section" });
    section.setAttribute("data-label", label);
    if (theme) section.setAttribute("data-theme", theme);
    section.createEl("h2", { text: title, cls: "act-section-title" });
    return section;
  }

  private smallAction(container: HTMLElement, label: string, onClick: () => void) {
    const action = container.createEl("button", { text: label, cls: "act-small-action" });
    action.addEventListener("click", onClick);
  }

  private sectionInfo(section: HTMLElement, info: { source: string; rule?: string; props?: { name: string; desc: string }[] }) {
    const title = section.querySelector(".act-section-title");
    if (!title) return;
    const trigger = createDiv({ cls: "act-info-trigger" });
    const iconEl = trigger.createSpan({ cls: "act-info-icon" });
    setIcon(iconEl, "info");

    const popup = trigger.createDiv({ cls: "act-info-popup" });
    popup.createDiv({ text: "数据来源", cls: "act-info-heading" });
    popup.createDiv({ text: info.source, cls: "act-info-text" });

    if (info.rule) {
      popup.createDiv({ text: "使用规则", cls: "act-info-heading" });
      popup.createDiv({ text: info.rule, cls: "act-info-text" });
    }

    if (info.props && info.props.length > 0) {
      popup.createDiv({ text: "相关属性", cls: "act-info-heading" });
      const tbl = popup.createEl("table", { cls: "act-info-props" });
      for (const p of info.props) {
        const row = tbl.createEl("tr");
        row.createEl("td", { text: p.name, cls: "act-info-prop-name" });
        row.createEl("td", { text: p.desc, cls: "act-info-prop-desc" });
      }
    }

    title.appendChild(trigger);
  }

  private renderDataTable(container: HTMLElement, columns: { key: string; label: string; width?: string; cls?: string }[], rows: { data: Record<string, string>; onClick?: () => void }[]) {
    const wrapper = container.createDiv({ cls: "act-data-table-wrap" });
    const table = wrapper.createEl("table", { cls: "act-data-table" });
    const thead = table.createEl("thead");
    const hr = thead.createEl("tr");
    for (const col of columns) {
      const th = hr.createEl("th", { text: col.label });
      if (col.width) th.style.width = col.width;
    }
    const tbody = table.createEl("tbody");
    for (const row of rows) {
      const tr = tbody.createEl("tr");
      if (row.onClick) {
        tr.addClass("is-clickable");
        tr.addEventListener("click", row.onClick);
      }
      for (const col of columns) {
        const td = tr.createEl("td");
        if (col.cls) td.addClass(col.cls);
        td.setText(row.data[col.key] ?? "—");
      }
    }
  }

  private empty(container: HTMLElement, text: string) {
    container.createDiv({ text, cls: "act-empty" });
  }
}

export default class ActWorkspacePlugin extends Plugin {
  settings: ActWorkspaceSettings = DEFAULT_SETTINGS;
  get F() { return this.settings.folders; }
  private completedDidaSyncing = false;
  private themeStyleEl: HTMLStyleElement | null = null;

  async onload() {
    await this.loadSettings();
    await this.applyTheme();
    this.addSettingTab(new ActWorkspaceSettingTab(this.app, this));
    this.registerView(VIEW_TYPE, (leaf) => new ActWorkspaceView(leaf, this));
    this.addRibbonIcon("layout-dashboard", "ACT 工作台", () => this.activateView());
    this.addCommand({
      id: "open-act-workspace",
      name: "打开 ACT 工作台",
      callback: () => this.activateView()
    });
    this.app.workspace.onLayoutReady(() => {
      window.setTimeout(() => {
        void this.activateView();
      }, STARTUP_AUTO_OPEN_DELAY_MS);
    });
  }

  onunload() {
    this.removeThemeStyle();
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }

  async loadSettings() {
    const saved = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    this.settings.dvPaths = Object.assign({}, DEFAULT_DV_PATHS, saved?.dvPaths);
    this.settings.folders = Object.assign({}, DEFAULT_FOLDERS, saved?.folders);
    this.settings.dida = Object.assign({}, DEFAULT_DIDA, saved?.dida);
    if (!saved?.dida?.completedLogTarget) {
      const template = this.settings.dida.completedLogPathTemplate;
      if (template === "{dailyFolder}/{dailyDate}.md") this.settings.dida.completedLogTarget = "daily";
      else if (template === "{weeklyFolder}/{weekId}.md") this.settings.dida.completedLogTarget = "weekly";
      else this.settings.dida.completedLogTarget = "custom";
    }
    this.settings.cardSearchMode = Object.assign({}, saved?.cardSearchMode);
    this.settings.cardTags = Object.assign({}, saved?.cardTags);
    this.settings.progressLog = Object.assign({}, DEFAULT_PROGRESS_LOG, saved?.progressLog);
    if ((this.settings.terminalMode as string) === "termy") this.settings.terminalMode = "terminal";
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async applyTheme() {
    if (!THEME_CSS) {
      console.error("[ACT] No embedded theme CSS available");
      return;
    }
    this.removeThemeStyle();
    this.themeStyleEl = document.createElement("style");
    this.themeStyleEl.id = "act-theme-style";
    this.themeStyleEl.textContent = THEME_CSS;
    document.head.appendChild(this.themeStyleEl);
  }

  private removeThemeStyle() {
    if (this.themeStyleEl) {
      this.themeStyleEl.remove();
      this.themeStyleEl = null;
    }
  }

  async activateView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  async completeDidaTask(taskId: string, projectId: string): Promise<boolean> {
    const token = await this.getDidaApiToken();
    if (!token) {
      new Notice("滴答清单 Access Token 不可用");
      return false;
    }
    try {
      const response = await requestUrl({
        url: `${DIDA_API_BASE}/open/v1/project/${encodeURIComponent(projectId)}/task/${encodeURIComponent(taskId)}/complete`,
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.status >= 400) throw new Error(`Dida complete task failed: ${response.status}`);
      new Notice("任务已完成");
      return true;
    } catch (error) {
      console.error("Failed to complete Dida task", error);
      new Notice("完成任务失败，请检查 Access Token 或网络连接");
      return false;
    }
  }

  private buildDidaDateTime(dueDate: string, dueTime?: string): { value: string; isAllDay: boolean } {
    const hasTime = Boolean(dueTime);
    return {
      value: `${dueDate}T${hasTime ? dueTime : "00:00"}:00+08:00`,
      isAllDay: !hasTime
    };
  }

  private getDidaTaskPromptValue(task: DidaTask): NotePromptValue {
    const dueDate = task.dueDate ?? task.startDate;
    const parsed = dueDate ? new Date(dueDate) : null;
    const validDate = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
    return {
      title: normalizeInlineText(task.title),
      body: task.content ?? task.desc ?? "",
      dueDate: validDate ? formatDateOnly(validDate) : "",
      dueTime: validDate && !task.isAllDay ? `${pad(validDate.getHours())}:${pad(validDate.getMinutes())}` : "",
      priority: String(task.priority ?? 0)
    };
  }

  private parseDidaPriority(value?: string): number {
    const priority = Number(value ?? 0);
    return [0, 1, 3, 5].includes(priority) ? priority : 0;
  }

  editDidaTask(task: DidaTask) {
    new NotePromptModal(
      this.app,
      "修改滴答任务",
      "任务标题",
      "补充任务备注...",
      this.getDidaTaskPromptValue(task),
      () => undefined,
      () => undefined,
      async ({ title, body, dueDate, dueTime, priority }) => {
        const updated = await this.updateDidaTask(task, title, body, dueDate, dueTime, priority);
        if (!updated) throw new Error("Failed to update Dida task");
        const view = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0]?.view;
        if (view instanceof ActWorkspaceView) {
          view.invalidateDidaActiveCache();
          await view.render();
        }
      },
      {
        helperText: "仅修改滴答清单中的当前任务；清单位置保持不变。",
        dueDateLabel: "截止日期",
        dueTimeLabel: "截止时间",
        priorityLabel: "优先级"
      }
    ).open();
  }

  async updateDidaTask(task: DidaTask, title: string, content: string, dueDate?: string, dueTime?: string, priority?: string): Promise<boolean> {
    const token = await this.getDidaApiToken();
    if (!token) {
      new Notice("滴答清单 Access Token 不可用，请在插件设置 → 滴答清单中配置");
      return false;
    }
    const projectId = task.projectId ?? "inbox";
    const payload: DidaTask = {
      ...task,
      id: task.id,
      projectId,
      title,
      content,
      priority: this.parseDidaPriority(priority),
      status: task.status ?? 0
    };
    if (dueDate) {
      const dateTime = this.buildDidaDateTime(dueDate, dueTime);
      payload.startDate = dateTime.value;
      payload.dueDate = dateTime.value;
      payload.isAllDay = dateTime.isAllDay;
    } else {
      delete payload.startDate;
      delete payload.dueDate;
      payload.isAllDay = true;
    }
    try {
      const response = await requestUrl({
        url: `${DIDA_API_BASE}/open/v1/task/${encodeURIComponent(task.id)}`,
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (response.status >= 400) throw new Error(`Dida update task failed: ${response.status}`);
      new Notice("滴答清单任务已更新");
      return true;
    } catch (error) {
      console.error("Failed to update Dida task", error);
      new Notice("更新滴答清单任务失败，请检查 Access Token 或接口权限");
      return false;
    }
  }

  async deleteDidaTask(taskId: string, projectId: string): Promise<boolean> {
    const token = await this.getDidaApiToken();
    if (!token) {
      new Notice("滴答清单 Access Token 不可用，请在插件设置 → 滴答清单中配置");
      return false;
    }
    try {
      const response = await requestUrl({
        url: `${DIDA_API_BASE}/open/v1/project/${encodeURIComponent(projectId)}/task/${encodeURIComponent(taskId)}`,
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.status >= 400) throw new Error(`Dida delete task failed: ${response.status}`);
      new Notice("滴答清单任务已删除");
      return true;
    } catch (error) {
      console.error("Failed to delete Dida task", error);
      new Notice("删除滴答清单任务失败，请检查 Access Token 或接口权限");
      return false;
    }
  }

  async createDidaTask(title: string, content: string, dueDate?: string, dueTime?: string, priority?: string): Promise<boolean> {
    const token = await this.getDidaApiToken();
    if (!token) {
      new Notice("滴答清单 Access Token 不可用，请在插件设置 → 滴答清单中配置");
      return false;
    }
    const dateTime = dueDate ? this.buildDidaDateTime(dueDate, dueTime) : null;
    const body: Record<string, unknown> = {
      title,
      content,
      priority: this.parseDidaPriority(priority)
    };
    if (dateTime) {
      body.startDate = dateTime.value;
      body.dueDate = dateTime.value;
      body.isAllDay = dateTime.isAllDay;
    }
    try {
      const response = await requestUrl({
        url: `${DIDA_API_BASE}/open/v1/task`,
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (response.status >= 400) throw new Error(`Dida create task failed: ${response.status}`);
      new Notice("滴答清单任务已创建");
      return true;
    } catch (error) {
      console.error("Failed to create Dida task", error);
      new Notice("创建滴答清单任务失败，请检查 Access Token 或接口权限");
      return false;
    }
  }

  async getDidaApiToken(): Promise<string | null> {
    if (!this.settings.dida.enabled) return null;
    const settingsToken = this.settings.dida.accessToken?.trim();
    return settingsToken || null;
  }

  private async fetchCompletedDidaTasks(token: string, from: Date, to: Date): Promise<DidaTask[]> {
    const response = await requestUrl({
      url: `${DIDA_API_BASE}/open/v1/task/completed`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        startDate: from.toISOString(),
        endDate: to.toISOString()
      })
    });
    const data = response.json;
    if (Array.isArray(data)) return data.filter((t: DidaTask) => t.id && t.title);
    return [];
  }

  async syncCompletedDidaToWeekly(options: { silent?: boolean } = {}): Promise<number> {
    if (this.completedDidaSyncing) return 0;
    this.completedDidaSyncing = true;
    try {
      const token = await this.getDidaApiToken();
      if (!token) {
        if (!options.silent) new Notice("滴答清单 Access Token 不可用");
        return 0;
      }
      const until = new Date();
      until.setHours(23, 59, 59, 999);
      const since = new Date(until);
      since.setDate(since.getDate() - this.settings.dida.lookbackDays);
      since.setHours(0, 0, 0, 0);
      const completedTasks = await this.fetchCompletedDidaTasks(token, since, until);
      let addedTotal = 0;
      const tasksByFile = new Map<string, { weekId: string; tasks: DidaTask[] }>();
      for (const task of completedTasks) {
        const completedAt = new Date(task.completedTime ?? "");
        if (Number.isNaN(completedAt.getTime())) continue;
        const weekId = formatWeekId(completedAt);
        const targetPath = this.resolveDidaCompletedLogPath(completedAt);
        const bucket = tasksByFile.get(targetPath) ?? { weekId, tasks: [] };
        bucket.tasks.push(task);
        tasksByFile.set(targetPath, bucket);
      }

      for (const [targetPath, bucket] of tasksByFile) {
        const file = await this.ensureDidaCompletedLogFile(targetPath, bucket.weekId);
        let content = await this.app.vault.cachedRead(file);
        let addedForFile = 0;
        const tasksByDate = new Map<string, DidaTask[]>();
        for (const task of bucket.tasks) {
          const dateKey = formatDateOnly(new Date(task.completedTime ?? ""));
          const bucket = tasksByDate.get(dateKey) ?? [];
          bucket.push(task);
          tasksByDate.set(dateKey, bucket);
        }
        for (const [dateKey, dateTasks] of tasksByDate) {
          const date = new Date(`${dateKey}T12:00:00`);
          const lines = dateTasks
            .sort((a, b) => (a.completedTime ?? "").localeCompare(b.completedTime ?? ""))
            .map((task) => `- [x] 滴答清单：${normalizeInlineText(task.title)} ✅ ${dateKey} <!-- dida:${task.id} -->`);
          const result = insertDidaCompletedLines(content, date, lines, this.settings.dida.completedLogHeading);
          content = result.content;
          addedForFile += result.added;
          addedTotal += result.added;
        }
        if (addedForFile > 0) await this.app.vault.modify(file, content);
      }
      return addedTotal;
    } catch (error) {
      console.error("Failed to sync completed Dida tasks", error);
      if (!options.silent) new Notice("同步滴答清单完成任务失败，请查看开发者控制台");
      return 0;
    } finally {
      this.completedDidaSyncing = false;
    }
  }

  async syncActionCompletedToWeekly(): Promise<{ today: number; backfill: number }> {
    const actionFolders = [
      { path: this.F.focusAction, label: "聚焦" },
      { path: this.F.activeAction, label: "跟进" },
      { path: this.F.maybeAction, label: "也许" },
    ];
    const itemsByDate = new Map<string, { text: string; noteBasename: string; source: string; dateKey: string }[]>();

    for (const af of actionFolders) {
      const folder = this.app.vault.getAbstractFileByPath(af.path);
      if (!(folder instanceof TFolder)) continue;
      for (const child of folder.children) {
        if (!(child instanceof TFile) || child.extension !== "md") continue;
        const content = await this.app.vault.read(child);
        for (const line of content.split("\n")) {
          const doneMatch = line.match(/^\s*[-*]\s*\[[xX]\].*✅\s*(\d{4}-\d{2}-\d{2})/);
          if (!doneMatch) continue;
          const dateKey = doneMatch[1];
          const text = line
            .replace(/^\s*[-*]\s*\[[xX]\]\s*/, "")
            .replace(/[!！]{1,3}\s*/g, "")
            .replace(/\s*✅\s*\d{4}-\d{2}-\d{2}.*$/, "")
            .trim();
          if (!text) continue;
          const bucket = itemsByDate.get(dateKey) ?? [];
          bucket.push({ text, noteBasename: child.basename, source: af.label, dateKey });
          itemsByDate.set(dateKey, bucket);
        }
      }
    }

    const todayStr = formatDateOnly(new Date());
    let todayCount = 0;
    let backfillCount = 0;

    for (const [dateKey, items] of itemsByDate) {
      const date = new Date(`${dateKey}T12:00:00`);
      const weekId = formatWeekId(date);
      const file = await this.ensureWeeklyFile(weekId);
      const content = await this.app.vault.read(file);

      const newEntries: string[] = [];
      for (const item of items) {
        const tagId = `${item.noteBasename}::${item.text}`.replace(/[<>]/g, "");
        const commentTag = `<!-- action:${tagId} -->`;
        // 兼容旧版 30 字符截断的去重标签，避免历史条目被重复同步
        const legacyTagId = `${item.noteBasename}::${item.text.slice(0, 30)}`.replace(/[<>]/g, "");
        const legacyCommentTag = `<!-- action:${legacyTagId} -->`;
        if (content.includes(commentTag) || content.includes(legacyCommentTag)) continue;
        newEntries.push(`- [x] ${item.source}：${item.text}（${item.noteBasename}） ✅ ${dateKey} ${commentTag}`);
      }
      if (newEntries.length === 0) continue;

      const dayHeading = formatWeeklyLogHeading(date);
      const lines = content.split("\n");
      let inserted = false;

      for (let i = 0; i < lines.length; i++) {
        if (/^###\s+/.test(lines[i]) && lines[i].includes(dayHeading)) {
          let end = i + 1;
          while (end < lines.length && !/^#{1,3}\s+/.test(lines[end])) end++;
          const insertAt = lines[end - 1]?.trim() === "" ? end - 1 : end;
          lines.splice(insertAt, 0, ...newEntries, "");
          inserted = true;
          break;
        }
      }

      if (!inserted) {
        let dailyHeadingIdx = -1;
        for (let i = 0; i < lines.length; i++) {
          if (/^##\s+每日记录/.test(lines[i])) { dailyHeadingIdx = i; break; }
        }
        if (dailyHeadingIdx === -1) {
          lines.push("", "## 每日记录", "");
          dailyHeadingIdx = lines.length - 2;
        }
        let sectionEnd = dailyHeadingIdx + 1;
        while (sectionEnd < lines.length && !/^#{1,2}\s+/.test(lines[sectionEnd])) sectionEnd++;
        const dayBlock = [`### ${dayHeading}`, "", ...newEntries, ""];
        lines.splice(sectionEnd, 0, ...dayBlock);
        inserted = true;
      }

      if (inserted) {
        await this.app.vault.modify(file, lines.join("\n"));
        if (dateKey === todayStr) todayCount += newEntries.length;
        else backfillCount += newEntries.length;
      }
    }

    return { today: todayCount, backfill: backfillCount };
  }

  private resolveDidaCompletedLogPath(date: Date): string {
    const template = this.getCompletedLogPathTemplate();
    const rendered = renderDidaLogTemplate(
      template
        .replace(/\{weeklyFolder\}/g, this.F.weekly)
        .replace(/\{dailyFolder\}/g, this.F.daily),
      date
    ).replace(/^\/+/, "");
    return rendered.endsWith(".md") ? rendered : `${rendered}.md`;
  }

  private getCompletedLogPathTemplate(): string {
    if (this.settings.dida.completedLogTarget === "daily") return "{dailyFolder}/{dailyDate}.md";
    if (this.settings.dida.completedLogTarget === "custom") {
      return this.settings.dida.completedLogPathTemplate?.trim() || DEFAULT_DIDA.completedLogPathTemplate;
    }
    return "{weeklyFolder}/{weekId}.md";
  }

  describeCompletedLogTarget(): string {
    if (this.settings.dida.completedLogTarget === "daily") return "每日日志（按完成日期写入对应日志）";
    if (this.settings.dida.completedLogTarget === "custom") return `自定义笔记（${this.settings.dida.completedLogPathTemplate || DEFAULT_DIDA.completedLogPathTemplate}）`;
    return "每周周记（按完成日期写入对应周记）";
  }

  private async ensureDidaCompletedLogFile(path: string, weekId: string): Promise<TFile> {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) return existing;

    const defaultWeeklyPath = `${this.F.weekly}/${weekId}.md`;
    if (path === defaultWeeklyPath) return await this.ensureWeeklyFile(weekId);

    const parentPath = path.split("/").slice(0, -1).join("/");
    if (parentPath) await this.ensureVaultFolder(parentPath);
    await this.app.vault.create(path, "");
    const created = this.app.vault.getAbstractFileByPath(path);
    if (created instanceof TFile) return created;
    throw new Error(`Failed to create Dida completed log: ${path}`);
  }

  private async ensureVaultFolder(path: string) {
    const parts = path.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing instanceof TFolder) continue;
      if (existing) throw new Error(`Cannot create folder because a file exists at: ${current}`);
      await this.app.vault.createFolder(current);
    }
  }

  private async createMarkdownNote(folderPath: string, baseName: string, content: string): Promise<TFile> {
    await this.ensureVaultFolder(folderPath);
    let candidate = `${folderPath}/${safeFileName(baseName)}.md`;
    let index = 2;
    while (this.app.vault.getAbstractFileByPath(candidate)) {
      candidate = `${folderPath}/${safeFileName(baseName)}-${index}.md`;
      index += 1;
    }
    await this.app.vault.create(candidate, content.replace(/\s*$/, "\n"));
    const created = this.app.vault.getAbstractFileByPath(candidate);
    if (created instanceof TFile) return created;
    throw new Error(`Failed to create note: ${candidate}`);
  }

  private async buildWeeklyTemplate(weekId: string): Promise<string> {
    const date = weekIdToDate(weekId);
    const { monday, sunday } = getWeekBounds(date);
    const range = `${monday.getMonth() + 1}月${monday.getDate()}日 — ${sunday.getMonth() + 1}月${sunday.getDate()}日`;
    const ci = getCycleInfo(monday, this.settings.cycleMode);
    const cycleId = `${weekId.split("-")[0]}-${ci.cycle}`;
    const weekOfCycle = String(ci.weekOfCycle);

    const custom = await this.readTemplateFile(this.settings.templates?.weekly || "", {
      weekId, range, cycleId, weekOfCycle,
      cycleName: cycleId.split("-")[1]
    });
    if (custom !== null) return custom;

    return [
      `# ${weekId}（${range}）`,
      ``,
      `关联周期：[[${cycleId}]]`,
      ``,
      `## 本周计划`,
      ``,
      `> ${cycleId.split("-")[1]} 第${weekOfCycle}周`,
      ``,
      `- [ ] `,
      ``,
      `---`,
      ``,
      `## 本周要事`,
      ``,
      ``,
      ``,
      `---`,
      ``,
      `## 每日记录`,
      ``,
      ``,
      ``,
      `---`,
      ``,
      `## 本周总结`,
      ``,
      ``,
      ``
    ].join("\n");
  }

  async ensureWeeklyFile(weekId: string): Promise<TFile> {
    const path = `${this.F.weekly}/${weekId}.md`;
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) return existing;
    await this.app.vault.create(path, await this.buildWeeklyTemplate(weekId));
    const created = this.app.vault.getAbstractFileByPath(path);
    if (created instanceof TFile) return created;
    throw new Error(`Failed to create weekly note: ${path}`);
  }

  async openPath(path: string) {
    await this.openPathInSide(path);
  }

  async appendNextAction(path: string, text: string) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice("未找到任务笔记");
      return;
    }
    await this.app.vault.process(file, (content) => {
      const section = getNextActionSection(content);
      const todoLine = `- [ ] ${text}`;
      if (!section) return content + `\n## 下步行动\n\n${todoLine}\n`;
      const lines = content.split("\n");
      lines.splice(section.end, 0, todoLine);
      return lines.join("\n");
    });
    new Notice("已添加到下步行动");
  }

  async appendProgressToTask(path: string, text: string) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice("未找到任务笔记");
      return;
    }
    await this.app.vault.process(file, (content) => appendProgressEntry(content, text, this.settings.progressLog));
    new Notice("已保存到进展记录");
  }

  async completeTaskActionItem(path: string, lineIndex: number) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || lineIndex < 0) {
      new Notice("未找到可完成的行动项");
      return;
    }
    const completedDate = formatDateOnly(new Date());
    let changed = false;
    await this.app.vault.process(file, (content) => {
      const next = completeTaskActionLine(content, lineIndex, completedDate);
      changed = next !== content;
      return next;
    });
    if (changed) {
      new Notice("行动项已完成");
    } else {
      new Notice("行动项已经是完成状态");
    }
  }

  async openPathInSide(path: string) {
    if (path.includes("#")) {
      await this.app.workspace.openLinkText(path, "", false);
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file);
      this.app.workspace.setActiveLeaf(leaf, { focus: true });
      return;
    }
    await this.app.workspace.openLinkText(path, "", false);
  }

  async openOrCreateDaily(path: string) {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.openPath(path);
      return;
    }
    const template = await this.getDailyTemplate();
    await this.app.vault.create(path, template);
    await this.openPathInSide(path);
  }

  private async readTemplateFile(path: string, vars?: Record<string, string>): Promise<string | null> {
    if (!path) return null;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return null;
    let content = await this.app.vault.cachedRead(file);
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        content = content.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
      }
    }
    return content;
  }

  async buildTaskNoteContent(noteBody: string): Promise<string> {
    const now = new Date();
    const created = formatDateOnly(now);
    const custom = await this.readTemplateFile(this.settings.templates?.taskNote || "", {
      created, body: noteBody || ""
    });
    let content = custom ?? `---\ntags:\n  - a-任务笔记\ncreated: ${created}\nt-deadline:\npriority:\nAI 备注:\n---\n## 下步行动\n\n\n## 进展记录\n\n\n## 背景目标\n`;
    if (content.includes("created:") && !content.match(/created:\s*\S/)) {
      content = content.replace(/created:[ \t]*/, `created: ${created}`);
    }
    if (noteBody) {
      const fmEnd = content.indexOf("---", content.indexOf("---") + 3);
      if (fmEnd !== -1) {
        const insertAt = content.indexOf("\n", fmEnd) + 1;
        content = content.slice(0, insertAt) + `\n${noteBody}\n` + content.slice(insertAt);
      } else {
        content = noteBody + "\n\n" + content;
      }
    }
    return content;
  }

  async getDailyTemplate(): Promise<string> {
    const customPath = this.settings.templates?.daily;
    const custom = await this.readTemplateFile(customPath || "");
    if (custom !== null) return custom;
    const fallbackPath = "+/_storage/42-template-模板/time-日志.md";
    const fallback = this.app.vault.getAbstractFileByPath(fallbackPath);
    if (fallback instanceof TFile) return await this.app.vault.cachedRead(fallback);
    return `---\n已回顾: false\n---\n\n## 今日重点\n\n\n\n---\n\n## 今日总结\n\n\n\n---\n\n## 今日创建的笔记\n\n![[base-当日创建笔记.base]]\n`;
  }

  private getPromptDraft(key: string): NotePromptValue {
    return this.settings.promptDrafts?.[key] ?? { title: "", body: "" };
  }

  private async savePromptDraft(key: string, value: NotePromptValue) {
    const title = value.title.trim();
    const body = value.body.trim();
    const hasExtraValue = Boolean(value.dueDate || value.dueTime || (value.priority && value.priority !== "0"));
    this.settings.promptDrafts = { ...(this.settings.promptDrafts ?? {}) };
    if (!title && !body && !hasExtraValue) {
      delete this.settings.promptDrafts[key];
    } else {
      this.settings.promptDrafts[key] = value;
    }
    await this.saveSettings();
  }

  private async clearPromptDraft(key: string) {
    if (!this.settings.promptDrafts?.[key]) return;
    this.settings.promptDrafts = { ...this.settings.promptDrafts };
    delete this.settings.promptDrafts[key];
    await this.saveSettings();
  }

  openNotePrompt(
    key: string,
    title: string,
    titlePlaceholder: string,
    bodyPlaceholder: string,
    onSubmit: (value: NotePromptValue) => void | Promise<void>,
    options: NotePromptOptions = {}
  ) {
    new NotePromptModal(
      this.app,
      title,
      titlePlaceholder,
      bodyPlaceholder,
      this.getPromptDraft(key),
      (value) => this.savePromptDraft(key, value),
      () => this.clearPromptDraft(key),
      onSubmit,
      options
    ).open();
  }

  captureDidaTask() {
    this.openNotePrompt(
      "dida-task",
      "新增滴答任务",
      "任务标题",
      "补充任务备注...",
      async ({ title, body, dueDate, dueTime, priority }) => {
        const created = await this.createDidaTask(title, body, dueDate, dueTime, priority);
        if (!created) throw new Error("Failed to create Dida task");
        const view = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0]?.view;
        if (view instanceof ActWorkspaceView) {
          view.invalidateDidaActiveCache();
          await view.render();
        }
      },
      {
        helperText: "保存位置：滴答清单收件箱。需要归类时，可在滴答清单中移动到对应清单。",
        dueDateLabel: "截止日期",
        dueTimeLabel: "截止时间",
        priorityLabel: "优先级",
        defaultDueDate: formatDateOnly(new Date()),
        defaultPriority: "0"
      }
    );
  }

  captureIndexCard() {
    const choices = [
      { label: "关键字", folder: `${this.F.indexCard}/k-Topic-主题索引`, prefix: "k", titlePlaceholder: "关键字名称" },
      { label: "人物", folder: `${this.F.indexCard}/b-Person-人物索引`, prefix: "b", titlePlaceholder: "人物名称" }
    ];
    this.openChoiceModal("新增索引", choices, (choice) => {
      this.openNotePrompt(
        `index-card-${choice.prefix}`,
        `新增索引 · ${choice.label}`,
        choice.titlePlaceholder,
        "补充定义、相关卡片、备注...",
        async ({ title, body }) => {
          const now = new Date();
          const file = await this.createMarkdownNote(choice.folder, `${choice.prefix}-${safeFileName(title)}`, [
            "---",
            `created: ${formatDateOnly(now)}`,
            "---",
            "",
            `# ${title}`,
            "",
            body ? `${body}\n` : ""
          ].join("\n"));
          await this.openPathInSide(file.path);
          const view = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0]?.view;
          if (view instanceof ActWorkspaceView) await view.render();
        }
      );
    });
  }

  captureKnowledgeCard() {
    const choices = [
      { label: "核心卡片", folder: this.F.mainCard, key: "main" },
      { label: "阅读卡片", folder: this.F.bibCard, key: "bib" }
    ];
    this.openChoiceModal("新增卡片", choices, (choice) => {
      this.openNotePrompt(
        `knowledge-card-${choice.key}`,
        `新增卡片 · ${choice.label}`,
        "卡片标题",
        "写入卡片内容、来源或摘录...",
        async ({ title, body }) => {
          const now = new Date();
          const file = await this.createMarkdownNote(choice.folder, safeFileName(title), [
            "---",
            `created: ${formatDateOnly(now)}`,
            "---",
            "",
            `# ${title}`,
            "",
            body ? `${body}\n` : ""
          ].join("\n"));
          await this.openPathInSide(file.path);
          const view = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0]?.view;
          if (view instanceof ActWorkspaceView) await view.render();
        }
      );
    });
  }

  private openChoiceModal<T extends { label: string }>(title: string, choices: T[], onChoose: (choice: T) => void) {
    const modal = new Modal(this.app);
    modal.titleEl.setText(title);
    modal.contentEl.addClass("act-choice-modal");
    for (const choice of choices) {
      const btn = modal.contentEl.createEl("button", { text: choice.label, cls: "act-folder-choice-btn", attr: { type: "button" } });
      btn.addEventListener("click", () => {
        modal.close();
        onChoose(choice);
      });
    }
    modal.open();
  }

  openDailyCapture() {
    const commands = (this.app as App & { commands?: { executeCommandById?: (id: string) => boolean | void } }).commands;
    const opened = commands?.executeCommandById?.(MOBILE_DAILY_CAPTURE_COMMAND_ID);
    if (opened === false || !commands?.executeCommandById) {
      new Notice("请先启用 ACT 闪念簿 插件");
    }
  }

  async openSkillInTerminal(skillName: string) {
    const command = this.buildSkillCommand(skillName);
    await this.openCommandInTerminal(command, `已打开 Skill：${skillName}`, `已复制指令。请手动粘贴：${skillName}`);
  }

  async openCommandInTerminal(command: string, successMessage: string, fallbackMessage = "已复制命令，请手动粘贴到终端") {
    const mode = this.settings.terminalMode;

    if (mode === "terminal") {
      const opened = await this.openInTerminalPlugin(command);
      if (opened) { new Notice(successMessage); return; }
    }


    if (mode === "system") {
      const opened = await this.openExternalTerminal(command);
      if (opened) { new Notice(successMessage); return; }
    }

    await this.copyText(command, fallbackMessage);
  }

  private async openInTerminalPlugin(command: string): Promise<boolean> {
    const commands = (this.app as App & { commands?: { executeCommandById?: (id: string) => boolean | void } }).commands;
    if (!commands?.executeCommandById) return false;
    commands.executeCommandById("terminal:open-terminal.integrated.root");
    await new Promise((r) => setTimeout(r, 500));
    const leaves = this.app.workspace.getLeavesOfType("terminal:terminal");
    const leaf = leaves[leaves.length - 1];
    if (!leaf) return false;
    const termView = leaf.view as unknown as { emulator?: { terminal?: { paste?: (text: string) => void } } };
    const terminal = termView.emulator?.terminal;
    if (!terminal?.paste) return false;
    terminal.paste(command + "\n");
    return true;
  }

  private buildSkillCommand(skillName: string): string {
    const vaultPath = this.getVaultBasePath() ?? ".";
    const template = this.settings.skillCommandTemplate || DEFAULT_SETTINGS.skillCommandTemplate;
    // 模板中 {{skill}} 位于单引号内，转义 skill 名中的单引号防止命令被截断
    const safeSkill = skillName.replace(/'/g, "'\\''");
    return template
      .replace(/\{\{vault\}\}/g, shellQuote(vaultPath))
      .replace(/\{\{skill\}\}/g, safeSkill);
  }

  async copyText(text: string, notice = "已复制") {
    try {
      await navigator.clipboard.writeText(text);
      new Notice(notice);
      return;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      new Notice(notice);
    }
  }

  getVaultBasePath(): string {
    const adapter = this.app.vault.adapter as unknown as { getBasePath?: () => string };
    return adapter.getBasePath?.() ?? "";
  }

  private async openExternalTerminal(command: string): Promise<boolean> {
    const childProcess = getNodeChildProcess();
    if (!childProcess) return false;

    const platform = (globalThis as unknown as { process?: { platform?: string } }).process?.platform;

    if (platform === "darwin") {
      const script = command.trim()
        ? `tell application "Terminal"\nactivate\ndo script ${toAppleScriptString(command)}\nend tell`
        : `tell application "Terminal"\nactivate\ndo script ""\nend tell`;
      return new Promise((resolve) => {
        childProcess.execFile("osascript", ["-e", script], (error) => resolve(!error));
      });
    }

    if (platform === "win32") {
      const args = command.trim() ? ["cmd", "/k", command] : ["cmd"];
      return new Promise((resolve) => {
        childProcess.execFile("cmd", ["/c", "start", ...args], (error) => resolve(!error));
      });
    }

    return false;
  }

  private updateCheckTimes: number[] = [];

  private getUpdateRepo(): string {
    return normalizeGitHubRepo(this.settings.updateRepo) || DEFAULT_UPDATE_REPO;
  }

  private getUpdateHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Accept": "application/vnd.github.v3+json", "User-Agent": "act-workspace" };
    const token = this.settings.updateToken?.trim();
    if (token) headers["Authorization"] = `token ${token}`;
    return headers;
  }

  // 从 Release 附件读取 manifest.json，保证「检查到的版本」与「实际下载的文件」来自同一发布
  private async fetchLatestReleaseVersion(repo: string): Promise<string> {
    const resp = await requestUrl({
      url: `https://github.com/${repo}/releases/latest/download/manifest.json`,
      headers: this.getUpdateHeaders()
    });
    const latest = resp.json?.version ?? "";
    if (!latest) throw new Error("无法获取最新版本号");
    return latest;
  }

  private async sha256Hex(data: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // 读取 Release 附件 checksums.json；旧版 Release 没有该文件时返回 null（跳过校验）
  private async fetchReleaseChecksums(repo: string): Promise<Record<string, string> | null> {
    try {
      const resp = await requestUrl({
        url: `https://github.com/${repo}/releases/latest/download/checksums.json`,
        headers: this.getUpdateHeaders()
      });
      const data = resp.json;
      if (data && typeof data === "object") return data as Record<string, string>;
    } catch { /* 旧 Release 无 checksums.json */ }
    return null;
  }

  private isNewerVersion(latest: string, current: string): boolean {
    const a = latest.split(".").map((n) => parseInt(n) || 0);
    const b = current.split(".").map((n) => parseInt(n) || 0);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const diff = (a[i] ?? 0) - (b[i] ?? 0);
      if (diff !== 0) return diff > 0;
    }
    return false;
  }

  async checkForUpdate(): Promise<{ hasUpdate: boolean; latest: string; current: string }> {
    const now = Date.now();
    this.updateCheckTimes = this.updateCheckTimes.filter((t) => now - t < UPDATE_CHECK_INTERVAL_MS);
    if (this.updateCheckTimes.length >= 2) {
      const oldest = this.updateCheckTimes[0];
      const remain = Math.ceil((UPDATE_CHECK_INTERVAL_MS - (now - oldest)) / 1000);
      throw new Error(`请 ${remain} 秒后再试`);
    }
    this.updateCheckTimes.push(now);
    try {
      const latest = await this.fetchLatestReleaseVersion(this.getUpdateRepo());
      return { hasUpdate: this.isNewerVersion(latest, this.manifest.version), latest, current: this.manifest.version };
    } catch (err) {
      this.updateCheckTimes.pop();
      throw err;
    }
  }

  async performUpdate(): Promise<string> {
    const repo = this.getUpdateRepo();
    const latest = await this.fetchLatestReleaseVersion(repo);
    if (!this.isNewerVersion(latest, this.manifest.version)) return latest;

    const pluginDir = this.manifest.dir;
    if (!pluginDir) throw new Error("无法确定插件目录");

    // 先把所有文件下载到内存，全部成功后再写盘，避免部分更新导致版本错位
    const requiredFiles = ["main.js", "manifest.json"];
    const optionalFiles = ["styles.css"];
    const downloaded = new Map<string, ArrayBuffer>();

    for (const filename of requiredFiles) {
      const fileResp = await requestUrl({
        url: `https://github.com/${repo}/releases/latest/download/${filename}`,
        headers: this.getUpdateHeaders()
      });
      if (!fileResp.arrayBuffer || fileResp.arrayBuffer.byteLength === 0) {
        throw new Error(`下载的 ${filename} 为空，已取消更新`);
      }
      downloaded.set(filename, fileResp.arrayBuffer);
    }
    for (const filename of optionalFiles) {
      try {
        const fileResp = await requestUrl({
          url: `https://github.com/${repo}/releases/latest/download/${filename}`,
          headers: this.getUpdateHeaders()
        });
        if (fileResp.arrayBuffer && fileResp.arrayBuffer.byteLength > 0) {
          downloaded.set(filename, fileResp.arrayBuffer);
        }
      } catch { /* styles.css 可以不存在 */ }
    }

    // SHA-256 完整性校验：Release 提供 checksums.json 时逐一比对，不匹配立即中止
    const checksums = await this.fetchReleaseChecksums(repo);
    if (checksums) {
      for (const [filename, data] of downloaded) {
        const expected = checksums[filename]?.toLowerCase();
        if (!expected) throw new Error(`checksums.json 中缺少 ${filename} 的校验值，已取消更新`);
        const actual = await this.sha256Hex(data);
        if (actual !== expected) throw new Error(`${filename} 校验失败（文件可能已损坏或被篡改），已取消更新`);
      }
    }

    for (const [filename, data] of downloaded) {
      await this.app.vault.adapter.writeBinary(`${pluginDir}/${filename}`, data);
    }
    return latest;
  }

  async fetchReleaseNotes(version: string): Promise<string> {
    try {
      const repo = this.getUpdateRepo();
      const resp = await requestUrl({
        url: `https://raw.githubusercontent.com/${repo}/main/releases.json`,
        headers: this.getUpdateHeaders()
      });
      const notes: Record<string, string[]> = resp.json ?? {};
      const items = notes[version];
      if (items && items.length > 0) return items.join("\n");
    } catch { /* ignore */ }
    return "";
  }

}

/* ========= SETTINGS TAB ========= */

class ActWorkspaceSettingTab extends PluginSettingTab {
  plugin: ActWorkspacePlugin;
  private activeTab = 0;

  constructor(app: App, plugin: ActWorkspacePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("act-settings");

    const tabs = ["行动", "时间", "知识", "滴答清单", "Skill", "更新", "支持"];
    if (this.activeTab >= tabs.length) this.activeTab = 0;
    const tabBar = containerEl.createDiv({ cls: "act-settings-tab-bar" });
    const contentEl = containerEl.createDiv({ cls: "act-settings-content" });

    for (let i = 0; i < tabs.length; i++) {
      const tab = tabBar.createDiv({
        text: tabs[i],
        cls: `act-settings-tab${i === this.activeTab ? " is-active" : ""}`
      });
      tab.addEventListener("click", () => {
        this.activeTab = i;
        tabBar.querySelectorAll(".act-settings-tab").forEach((el, idx) => {
          el.toggleClass("is-active", idx === i);
        });
        this.renderTabContent(contentEl);
      });
    }

    this.renderTabContent(contentEl);
    this.renderFooter(containerEl);
    this.addSettingsStyles(containerEl);
  }

  private renderFooter(container: HTMLElement) {
    container.createDiv({ cls: "act-settings-footer" });
  }

  private renderUpdateSection(container: HTMLElement) {
    const section = container.createDiv({ cls: "act-update-section" });
    const header = section.createDiv({ cls: "act-update-header" });
    header.createSpan({ text: `ACT 工作台  v${this.plugin.manifest.version}`, cls: "act-update-version" });

    const statusEl = section.createDiv({ cls: "act-update-status" });
    section.createDiv({
      cls: "act-update-help",
      text: "点击「检查更新」获取最新版本。更新不会影响你的配置和数据。"
    });

    const btnGroup = section.createDiv({ cls: "act-update-actions" });

    const checkBtn = btnGroup.createEl("button", { text: "检查更新", cls: "act-update-btn" });
    checkBtn.addEventListener("click", async () => {
      checkBtn.disabled = true;
      checkBtn.textContent = "检查中...";
      statusEl.empty();
      try {
        const result = await this.plugin.checkForUpdate();
        if (result.hasUpdate) {
          statusEl.createSpan({ text: `发现新版本 v${result.latest}`, cls: "act-update-available" });
          const preNotes = await this.plugin.fetchReleaseNotes(result.latest);
          if (preNotes) {
            const notesEl = statusEl.createDiv({ cls: "act-update-notes" });
            for (const line of preNotes.split("\n")) {
              notesEl.createDiv({ text: line, cls: "act-update-notes-item" });
            }
          }
          const updateBtn = statusEl.createEl("button", { text: "立即更新", cls: "act-update-btn is-primary" });
          updateBtn.addEventListener("click", async () => {
            updateBtn.disabled = true;
            updateBtn.textContent = "下载中...";
            try {
              const version = await this.plugin.performUpdate();
              const notes = await this.plugin.fetchReleaseNotes(version);
              statusEl.empty();
              statusEl.createSpan({ text: `已更新到 v${version}，请重启 Obsidian 或重新加载插件`, cls: "act-update-success" });
              if (notes) {
                const notesEl = statusEl.createDiv({ cls: "act-update-notes" });
                notesEl.createDiv({ text: "更新内容：", cls: "act-update-notes-title" });
                for (const line of notes.split("\n")) {
                  notesEl.createDiv({ text: line, cls: "act-update-notes-item" });
                }
              }
              new Notice(`ACT 工作台已更新到 v${version}，请重新加载插件`);
            } catch (err) {
              updateBtn.disabled = false;
              updateBtn.textContent = "立即更新";
              new Notice(`更新失败：${err instanceof Error ? err.message : String(err)}`);
            }
          });
        } else {
          statusEl.createSpan({ text: "已是最新版本 ✓", cls: "act-update-latest" });
        }
      } catch (err) {
        statusEl.createSpan({ text: `检查失败：${err instanceof Error ? err.message : String(err)}`, cls: "act-update-error" });
      } finally {
        checkBtn.disabled = false;
        checkBtn.textContent = "检查更新";
      }
    });

  }

  private renderTabContent(container: HTMLElement) {
    container.empty();
    switch (this.activeTab) {
      case 0: this.renderActionTab(container); break;
      case 1: this.renderTimeTab(container); break;
      case 2: this.renderCardTab(container); break;
      case 3: this.renderDidaTab(container); break;
      case 4: this.renderSkillTab(container); break;
      case 5: this.renderUpdateSection(container); break;
      case 6: this.renderSupportTab(container); break;
    }
  }

  private renderSupportTab(container: HTMLElement) {
    const card = container.createDiv({ cls: "act-support-card" });
    card.createEl("h2", { text: "支持与资源" });
    card.createEl("p", { text: "公众号：kiven大汉堡（同名）", cls: "act-support-lead" });
    card.createEl("div", { text: "⬇️", cls: "act-support-arrow" });

    const list = card.createDiv({ cls: "act-support-list" });
    list.createEl("p", { text: "往期个人生产力视频合集" });
    list.createEl("p", { text: "Obsidian 官方同步拼车：已拼 4000+" });
    list.createEl("p", { text: "Obsidian + AI 笔记系统教程：学员 200+" });

    const blogLine = card.createEl("p", { cls: "act-support-blog" });
    blogLine.appendText("详情介绍与购买，请查看个人博客：");
    const link = blogLine.createEl("a", { text: "kivenbig.com", href: "https://kivenbig.com" });
    link.addEventListener("click", (event) => {
      event.preventDefault();
      window.open("https://kivenbig.com", "_blank");
    });
  }

  private getVaultFolders(): TFolder[] {
    const folders: TFolder[] = [];
    const recurse = (folder: TFolder) => {
      if (folder.path) folders.push(folder);
      for (const child of folder.children) {
        if (child instanceof TFolder) recurse(child);
      }
    };
    recurse(this.app.vault.getRoot());
    return folders.sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
  }

  private folderSetting(container: HTMLElement, key: keyof FolderPaths, label: string, desc: string) {
    new Setting(container)
      .setName(label)
      .setDesc(desc)
      .addSearch((search) => {
        const folders = this.getVaultFolders();
        const currentValue = this.plugin.settings.folders[key];
        const listId = `act-folder-${key}`;
        const optionsEl = container.createEl("datalist");
        optionsEl.id = listId;
        for (const folder of folders) {
          optionsEl.createEl("option", { attr: { value: folder.path } });
        }
        search.inputEl.setAttribute("list", listId);
        search.inputEl.setAttribute("autocomplete", "off");
        search
          .setPlaceholder(DEFAULT_FOLDERS[key])
          .setValue(currentValue)
          .onChange(async (value) => {
            this.plugin.settings.folders[key] = value;
            await this.plugin.saveSettings();
          });
        search.inputEl.addEventListener("change", async () => {
          const value = search.inputEl.value;
          if (value !== this.plugin.settings.folders[key]) {
            this.plugin.settings.folders[key] = value;
            await this.plugin.saveSettings();
          }
        });
      });
  }

  private templateSetting(container: HTMLElement, key: keyof TemplatePaths, label: string, desc: string) {
    new Setting(container)
      .setName(label)
      .setDesc(desc)
      .addSearch((search) => {
        const files = this.plugin.app.vault.getMarkdownFiles().map((f) => f.path).sort();
        const listId = `act-tpl-${key}`;
        const optionsEl = container.createEl("datalist");
        optionsEl.id = listId;
        for (const p of files) {
          optionsEl.createEl("option", { attr: { value: p } });
        }
        search.inputEl.setAttribute("list", listId);
        search.inputEl.setAttribute("autocomplete", "off");
        if (!this.plugin.settings.templates) this.plugin.settings.templates = { taskNote: "", weekly: "", daily: "" };
        search
          .setPlaceholder("留空使用内置模板")
          .setValue(this.plugin.settings.templates[key])
          .onChange(async (value) => {
            this.plugin.settings.templates[key] = value;
            await this.plugin.saveSettings();
          });
        search.inputEl.addEventListener("change", async () => {
          const value = search.inputEl.value;
          if (value !== this.plugin.settings.templates[key]) {
            this.plugin.settings.templates[key] = value;
            await this.plugin.saveSettings();
          }
        });
      });
  }

  private renderActionTab(container: HTMLElement) {
    container.createDiv({
      text: "行动层对应的 Vault 文件夹路径。修改后需重新打开工作台生效。",
      cls: "setting-item-description"
    });

    this.folderSetting(container, "inbox", "收件箱", "快速捕获入口");
    this.folderSetting(container, "focusAction", "聚焦承诺", "核心任务文件夹");
    this.folderSetting(container, "activeAction", "活跃跟进", "跟进任务文件夹");
    this.folderSetting(container, "maybeAction", "将来也许", "暂缓任务文件夹");
    this.folderSetting(container, "thought", "闪念", "ACT 闪念文件夹");

    container.createEl("h3", { text: "笔记模板" });
    this.templateSetting(container, "taskNote", "任务笔记模板", "新建任务笔记时使用的模板文件，留空使用内置模板。");

    container.createEl("h3", { text: "任务清单" });
    new Setting(container)
      .setName("隐藏已完成的任务笔记")
      .setDesc("开启后，所有行动项均已完成的任务笔记不会出现在「任务清单 · 今日」中。关闭则始终显示。")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.hideCompletedNotes);
        toggle.onChange(async (value) => {
          this.plugin.settings.hideCompletedNotes = value;
          await this.plugin.saveSettings();
        });
      });

    container.createEl("h3", { text: "进展记录" });
    new Setting(container)
      .setName("写入标题")
      .setDesc("保存进展时写入到哪个标题下面。支持 # / ## / ###，例如：## 进展记录。")
      .addText((text) => {
        text.setPlaceholder(DEFAULT_PROGRESS_LOG.heading);
        text.setValue(this.plugin.settings.progressLog.heading);
        text.inputEl.style.width = "100%";
        text.onChange(async (value) => {
          this.plugin.settings.progressLog.heading = value.trim() || DEFAULT_PROGRESS_LOG.heading;
          await this.plugin.saveSettings();
        });
      });

    new Setting(container)
      .setName("写入格式")
      .setDesc("三级标题 + 时间：### 2026-06-15 16:21；项目符 + 时间：- 2026-06-15 16:21 内容。")
      .addDropdown((dropdown) => {
        dropdown.addOption("heading-time", "三级标题 + 时间");
        dropdown.addOption("bullet-time", "项目符 + 时间");
        dropdown.setValue(this.plugin.settings.progressLog.format);
        dropdown.onChange(async (value) => {
          this.plugin.settings.progressLog.format = value as ProgressLogFormat;
          await this.plugin.saveSettings();
        });
      });

    container.createEl("h3", { text: "数据刷新" });
    new Setting(container)
      .setName("自动刷新间隔（秒）")
      .setDesc("工作台面板多久自动刷新一次数据。设为 0 则关闭自动刷新，仅在打开时加载。")
      .addText((text) => {
        text.setPlaceholder("30");
        text.setValue(String(this.plugin.settings.refreshInterval));
        text.inputEl.type = "number";
        text.inputEl.min = "0";
        text.inputEl.max = "3600";
        text.inputEl.style.width = "80px";
        text.onChange(async (value) => {
          const num = Math.max(0, Math.min(3600, parseInt(value) || 0));
          this.plugin.settings.refreshInterval = num;
          await this.plugin.saveSettings();
          const leaf = this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
          if (leaf?.view instanceof ActWorkspaceView) {
            (leaf.view as ActWorkspaceView).startRefreshInterval();
          }
        });
      });
  }

  private renderTimeTab(container: HTMLElement) {
    new Setting(container)
      .setName("周期划分方式")
      .setDesc("按季度月份（1-3/4-6/7-9/10-12月）或严格每 12 周划分")
      .addDropdown((dropdown) => {
        dropdown.addOption("monthly", "按季度月份（推荐）");
        dropdown.addOption("weekly", "严格 12 周");
        dropdown.addOption("weekly13", "12+1 周");
        dropdown.setValue(this.plugin.settings.cycleMode);
        dropdown.onChange(async (value) => {
          this.plugin.settings.cycleMode = value as CycleMode;
          await this.plugin.saveSettings();
          const view = this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE)[0]?.view;
          if (view instanceof ActWorkspaceView) await view.render();
        });
      });

    container.createEl("h3", { text: "文件夹路径" });

    this.folderSetting(container, "daily", "日志", "每日日志文件夹");
    this.folderSetting(container, "weekly", "周记", "每周周记文件夹");
    this.folderSetting(container, "cycle", "周期目标", "12 周/季度目标文件夹");
    this.folderSetting(container, "vision", "愿景", "长期愿景文件夹");

    container.createEl("h3", { text: "笔记模板" });
    this.templateSetting(container, "weekly", "周记模板", "新建周记时使用的模板文件，留空使用内置模板。");
    this.templateSetting(container, "daily", "日志模板", "新建日志时使用的模板文件，留空使用内置模板。");
  }

  private renderCardTab(container: HTMLElement) {
    container.createDiv({
      text: "知识层卡片来源配置。每种卡片可选择按文件夹或按标签搜索，修改后需重新打开工作台生效。",
      cls: "setting-item-description"
    });

    const cardTypes: { key: string; folderKey: keyof FolderPaths; label: string; desc: string }[] = [
      { key: "mainCard", folderKey: "mainCard", label: "核心卡", desc: "核心知识卡片" },
      { key: "bibCard", folderKey: "bibCard", label: "阅读卡", desc: "阅读笔记卡片" },
      { key: "indexCard", folderKey: "indexCard", label: "索引卡", desc: "主题索引卡片" },
      { key: "newCard", folderKey: "newCard", label: "新卡暂存", desc: "待编号新卡" }
    ];
    for (const ct of cardTypes) {
      const vis = this.plugin.settings.cardVisibility ?? {};
      const isVisible = vis[ct.key] !== false;
      const mode = this.plugin.settings.cardSearchMode[ct.key] || "folder";

      new Setting(container)
        .setName(ct.label)
        .setDesc(ct.desc)
        .addToggle((toggle) => {
          toggle.setValue(isVisible).onChange(async (value) => {
            if (!this.plugin.settings.cardVisibility) this.plugin.settings.cardVisibility = {};
            this.plugin.settings.cardVisibility[ct.key] = value;
            await this.plugin.saveSettings();
          });
          toggle.toggleEl.setAttribute("aria-label", "在前端显示");
        })
        .addDropdown((dropdown) => {
          dropdown.addOption("folder", "按文件夹");
          dropdown.addOption("tag", "按标签");
          dropdown.setValue(mode);
          dropdown.onChange(async (value) => {
            this.plugin.settings.cardSearchMode[ct.key] = value as "folder" | "tag";
            await this.plugin.saveSettings();
            this.display();
          });
        });

      if (mode === "folder") {
        new Setting(container)
          .setDesc("文件夹路径")
          .addSearch((search) => {
            const folders = this.getVaultFolders();
            const listId = `act-card-folder-${ct.key}`;
            const optionsEl = container.createEl("datalist");
            optionsEl.id = listId;
            for (const folder of folders) {
              optionsEl.createEl("option", { attr: { value: folder.path } });
            }
            search.inputEl.setAttribute("list", listId);
            search.inputEl.setAttribute("autocomplete", "off");
            search
              .setPlaceholder(DEFAULT_FOLDERS[ct.folderKey] || "留空则不显示")
              .setValue(this.plugin.settings.folders[ct.folderKey])
              .onChange(async (value) => {
                this.plugin.settings.folders[ct.folderKey] = value;
                await this.plugin.saveSettings();
              });
            search.inputEl.addEventListener("change", async () => {
              const value = search.inputEl.value;
              if (value !== this.plugin.settings.folders[ct.folderKey]) {
                this.plugin.settings.folders[ct.folderKey] = value;
                await this.plugin.saveSettings();
              }
            });
          });
      } else {
        new Setting(container)
          .setDesc("标签名称（不含 #）")
          .addText((text) => {
            text
              .setPlaceholder("例如：c-核心卡")
              .setValue(this.plugin.settings.cardTags[ct.key] || "")
              .onChange(async (value) => {
                this.plugin.settings.cardTags[ct.key] = value;
                await this.plugin.saveSettings();
              });
          });
      }
    }

    container.createEl("h3", { text: "数据视图跳转" });
    container.createDiv({
      text: "点击知识层统计卡片时打开的 .base 数据视图路径。支持 文件名#视图名 格式。留空则不可点击。",
      cls: "setting-item-description"
    });

    const dvLabels: { key: keyof DvPaths; label: string }[] = [
      { key: "mainCard", label: "核心卡" },
      { key: "bibCard", label: "阅读卡" },
      { key: "indexCard", label: "索引卡" },
      { key: "newCard", label: "新卡暂存" }
    ];

    for (const item of dvLabels) {
      new Setting(container)
        .setName(item.label)
        .addSearch((search) => {
          const files = this.app.vault.getFiles()
            .filter((f) => f.extension === "base")
            .map((f) => f.path)
            .sort((a, b) => a.localeCompare(b, "zh-CN"));
          const listId = `act-dv-${item.key}`;
          const optionsEl = container.createEl("datalist");
          optionsEl.id = listId;
          for (const filePath of files) {
            optionsEl.createEl("option", { attr: { value: filePath } });
          }
          search.inputEl.setAttribute("list", listId);
          search.inputEl.setAttribute("autocomplete", "off");
          search
            .setPlaceholder(DEFAULT_DV_PATHS[item.key])
            .setValue(this.plugin.settings.dvPaths[item.key])
            .onChange(async (value) => {
              this.plugin.settings.dvPaths[item.key] = value;
              await this.plugin.saveSettings();
            });
          search.inputEl.addEventListener("change", async () => {
            const value = search.inputEl.value;
            if (value !== this.plugin.settings.dvPaths[item.key]) {
              this.plugin.settings.dvPaths[item.key] = value;
              await this.plugin.saveSettings();
            }
          });
        });
    }
  }

  private renderDidaTab(container: HTMLElement) {
    new Setting(container)
      .setName("启用滴答清单")
      .setDesc("开启后可在今日聚焦中查看和管理滴答清单任务，并自动同步已完成任务到周记")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.dida.enabled);
        toggle.onChange(async (value) => {
          this.plugin.settings.dida.enabled = value;
          await this.plugin.saveSettings();
          const view = this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE)[0]?.view;
          if (view instanceof ActWorkspaceView) await view.render();
        });
      });

    new Setting(container)
      .setName("Access Token")
      .setDesc("滴答清单开放 API 的 Access Token")
      .addText((text) => {
        text.setPlaceholder("your-access-token");
        text.setValue(this.plugin.settings.dida.accessToken);
        text.inputEl.style.width = "100%";
        text.inputEl.type = "password";
        text.onChange(async (value) => {
          this.plugin.settings.dida.accessToken = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(container)
      .setName("完成记录保存位置")
      .setDesc("选择完成任务后写入哪类笔记。默认保存到对应周记；如果想完全自定义路径，再选择「自定义笔记」。")
      .addDropdown((dropdown) => {
        dropdown.addOption("weekly", "每周周记");
        dropdown.addOption("daily", "每日日志");
        dropdown.addOption("custom", "自定义笔记");
        dropdown.setValue(this.plugin.settings.dida.completedLogTarget);
        dropdown.onChange(async (value) => {
          this.plugin.settings.dida.completedLogTarget = value as CompletedLogTarget;
          if (value === "weekly") this.plugin.settings.dida.completedLogPathTemplate = "{weeklyFolder}/{weekId}.md";
          if (value === "daily") this.plugin.settings.dida.completedLogPathTemplate = "{dailyFolder}/{dailyDate}.md";
          await this.plugin.saveSettings();
          this.renderTabContent(container);
        });
      });

    const targetHelp = container.createDiv({ cls: "setting-item-description" });
    if (this.plugin.settings.dida.completedLogTarget === "weekly") {
      targetHelp.setText("当前规则：按完成日期写入对应周记，例如 2026-W25.md。");
    } else if (this.plugin.settings.dida.completedLogTarget === "daily") {
      targetHelp.setText("当前规则：按完成日期写入对应日志，例如 2026-06-15（周一）.md。");
    } else {
      targetHelp.setText("当前规则：按下方自定义路径写入。适合你想单独维护一个完成记录汇总笔记。");
      new Setting(container)
        .setName("自定义目标笔记")
        .setDesc("高级选项。可用占位符：{weekId}=周记编号，{date}=完成日期，{dailyDate}=日志文件名，{year}/{month}/{day}=年月日。")
        .addText((text) => {
          text.setPlaceholder("{weeklyFolder}/{weekId}.md");
          text.setValue(this.plugin.settings.dida.completedLogPathTemplate);
          text.inputEl.style.width = "100%";
          text.onChange(async (value) => {
            this.plugin.settings.dida.completedLogPathTemplate = value.trim() || DEFAULT_DIDA.completedLogPathTemplate;
            await this.plugin.saveSettings();
          });
        });
    }

    new Setting(container)
      .setName("完成记录保存标题")
      .setDesc("输入 # / ## / ### 加标题，插件会按该级标题写入。示例：## 每日记录；若输入一级或二级标题，会在其下按日期自动建立下一层小节。也可用 ### {dateHeading} 直接写到当天标题下。")
      .addText((text) => {
        text.setPlaceholder("## 每日记录");
        text.setValue(this.plugin.settings.dida.completedLogHeading);
        text.inputEl.style.width = "100%";
        text.onChange(async (value) => {
          this.plugin.settings.dida.completedLogHeading = value.trim() || DEFAULT_DIDA.completedLogHeading;
          await this.plugin.saveSettings();
        });
      });

    const guideEl = container.createDiv({ cls: "act-settings-guide" });
    guideEl.createEl("h4", { text: "如何获取 Access Token" });
    const steps = guideEl.createEl("ol");
    steps.createEl("li", { text: "前往网页版滴答清单（dida365.com）并登录" });
    steps.createEl("li", { text: "点击右上角「头像」→「设置」" });
    steps.createEl("li", { text: "进入「账户与安全」→「API 口令」" });
    steps.createEl("li", { text: "创建口令并复制，粘贴到上方 Access Token 输入框" });
  }

  private renderSkillTab(container: HTMLElement) {
    new Setting(container)
      .setName("终端模式")
      .setDesc("点击 Skill 按钮时打开哪个终端")
      .addDropdown((dropdown) => {
        dropdown.addOption("terminal", "Terminal 插件");
        dropdown.addOption("system", "系统终端（macOS/Windows）");
        dropdown.addOption("copy", "仅复制命令");
        dropdown.setValue(this.plugin.settings.terminalMode);
        dropdown.onChange(async (value) => {
          this.plugin.settings.terminalMode = value as TerminalMode;
          await this.plugin.saveSettings();
        });
      });

    new Setting(container)
      .setName("CLI 工具")
      .setDesc("选择用于运行 Skill 的命令行工具")
      .addDropdown((dropdown) => {
        dropdown.addOption("claude", "Claude Code（claude）");
        dropdown.addOption("codex", "Codex（codex）");
        dropdown.addOption("custom", "自定义模板");
        const current = this.plugin.settings.skillCommandTemplate;
        if (current.includes("claude '")) dropdown.setValue("claude");
        else if (current.includes("codex '")) dropdown.setValue("codex");
        else dropdown.setValue("custom");
        dropdown.onChange(async (value) => {
          if (value === "claude") {
            this.plugin.settings.skillCommandTemplate = "cd {{vault}} && claude '{{skill}}'";
          } else if (value === "codex") {
            this.plugin.settings.skillCommandTemplate = "cd {{vault}} && codex '{{skill}}'";
          } else if (value === "custom") {
            this.plugin.settings.skillCommandTemplate = "";
          }
          await this.plugin.saveSettings();
          this.renderTabContent(container);
        });
      });

    const isCustom = !this.plugin.settings.skillCommandTemplate.includes("claude '") &&
      !this.plugin.settings.skillCommandTemplate.includes("codex '");
    if (isCustom) {
      new Setting(container)
        .setName("自定义命令模板")
        .setDesc("可用变量：{{vault}} = Vault 路径，{{skill}} = Skill 名称")
        .addText((text) => {
          text.setPlaceholder(DEFAULT_SETTINGS.skillCommandTemplate);
          text.setValue(this.plugin.settings.skillCommandTemplate);
          text.inputEl.style.width = "100%";
          text.onChange(async (value) => {
            this.plugin.settings.skillCommandTemplate = value;
            await this.plugin.saveSettings();
          });
        });
    }

    const skillListEl = container.createDiv({ cls: "act-settings-skill-list" });
    this.renderSkillList(skillListEl);
  }

  private renderSkillList(container: HTMLElement) {
    container.empty();
    const skills = this.plugin.settings.skillItems;

    for (let i = 0; i < skills.length; i++) {
      const item = skills[i];
      new Setting(container)
        .setName(`#${i + 1}`)
        .addText((text) => {
          text.setPlaceholder("按钮名称");
          text.setValue(item.label);
          text.inputEl.style.width = "80px";
          text.onChange(async (value) => {
            item.label = value;
            await this.plugin.saveSettings();
          });
        })
        .addText((text) => {
          text.setPlaceholder("skill 名称（如 日常-每日开场）");
          text.setValue(item.skill);
          text.inputEl.style.width = "200px";
          text.onChange(async (value) => {
            item.skill = value;
            await this.plugin.saveSettings();
          });
        })
        .addExtraButton((btn) => {
          btn.setIcon("trash-2").setTooltip("删除").onClick(async () => {
            skills.splice(i, 1);
            await this.plugin.saveSettings();
            this.renderSkillList(container);
          });
        });
    }

    new Setting(container)
      .addButton((btn) => {
        btn.setButtonText("添加 Skill").setCta().onClick(async () => {
          skills.push({ label: "", skill: "" });
          await this.plugin.saveSettings();
          this.renderSkillList(container);
        });
      });
  }

  private addSettingsStyles(container: HTMLElement) {
    const style = container.createEl("style");
    style.textContent = `
      .act-settings-tab-bar {
        display: flex;
        gap: 4px;
        border-bottom: 1px solid var(--background-modifier-border);
        margin-bottom: 16px;
      }
      .act-settings-tab {
        padding: 8px 16px;
        cursor: pointer;
        font-size: 14px;
        color: var(--text-muted);
        border-bottom: 2px solid transparent;
        transition: color 0.15s, border-color 0.15s;
        user-select: none;
      }
      .act-settings-tab:hover {
        color: var(--text-normal);
      }
      .act-settings-tab.is-active {
        color: var(--text-accent);
        border-bottom-color: var(--text-accent);
        font-weight: 600;
      }
      .act-settings-content {
        min-height: 200px;
      }
      .act-settings-guide {
        margin-top: 16px;
        padding: 12px 16px;
        border-radius: 8px;
        background: var(--background-secondary);
        font-size: 13px;
        color: var(--text-muted);
        line-height: 1.6;
      }
      .act-settings-guide h4 {
        margin: 0 0 8px 0;
        font-size: 13px;
        font-weight: 600;
        color: var(--text-normal);
      }
      .act-settings-guide ol {
        margin: 0;
        padding-left: 20px;
      }
      .act-support-card {
        max-width: 760px;
        padding: 28px 32px;
        border-radius: 18px;
        background: var(--background-primary);
        border: 1px solid var(--background-modifier-border);
        color: var(--text-normal);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06);
      }
      .act-support-card h2 {
        margin: 0 0 14px 0;
        font-size: 24px;
        font-weight: 800;
        color: var(--text-normal);
      }
      .act-support-card p {
        margin: 0;
        font-size: 18px;
        line-height: 1.75;
        color: var(--text-normal);
      }
      .act-support-lead {
        font-weight: 700;
      }
      .act-support-arrow {
        margin: 8px 0 14px 0;
        font-size: 22px;
        line-height: 1;
      }
      .act-support-list {
        margin: 0 0 6px 24px;
      }
      .act-support-blog {
        font-weight: 700;
      }
      .act-support-blog a {
        color: var(--text-accent);
        text-decoration: underline;
        text-underline-offset: 3px;
      }
      .act-update-section {
        padding: 16px 0;
        margin-bottom: 12px;
        border-bottom: 1px solid var(--background-modifier-border);
      }
      .act-update-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 10px;
      }
      .act-update-version {
        font-size: 15px;
        font-weight: 600;
        color: var(--text-normal);
      }
      .act-update-actions {
        margin-bottom: 10px;
      }
      .act-update-help {
        margin: 0 0 12px 0;
        font-size: 12px;
        line-height: 1.5;
        color: var(--text-muted);
      }
      .act-update-btn {
        padding: 4px 14px;
        font-size: 13px;
        border-radius: 6px;
        cursor: pointer;
        border: 1px solid var(--background-modifier-border);
        background: var(--background-secondary);
        color: var(--text-normal);
      }
      .act-update-btn:hover {
        background: var(--background-modifier-hover);
      }
      .act-update-btn.is-primary {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
        border-color: var(--interactive-accent);
        margin-left: 10px;
      }
      .act-update-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .act-update-status {
        display: flex;
        align-items: center;
        min-height: 28px;
        font-size: 13px;
        margin-bottom: 8px;
      }
      .act-update-available {
        color: var(--text-accent);
        font-weight: 500;
      }
      .act-update-latest {
        color: var(--text-success, #2d5a3d);
      }
      .act-update-success {
        color: var(--text-success, #2d5a3d);
        font-weight: 500;
      }
      .act-update-error {
        color: var(--text-error);
      }
      .act-settings-footer {
        margin-top: 32px;
        padding: 20px;
        border-top: 1px solid var(--background-modifier-border);
        background: var(--background-secondary);
        border-radius: 8px;
        font-size: 13px;
        line-height: 1.8;
        color: var(--text-muted);
      }
      .act-settings-footer h3 {
        margin: 0 0 10px 0;
        font-size: 14px;
        font-weight: 600;
        color: var(--text-normal);
      }
      .act-settings-footer p {
        margin: 6px 0;
      }
      .act-footer-links {
        margin: 8px 0 8px 16px;
      }
      .act-footer-link-item {
        position: relative;
        padding-left: 12px;
      }
      .act-footer-link-item::before {
        content: "";
        position: absolute;
        left: 0;
        top: 50%;
        transform: translateY(-50%);
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: var(--text-faint);
      }
      .act-footer-blog-link {
        color: var(--text-accent);
        text-decoration: underline;
        cursor: pointer;
      }
    `;
  }
}
