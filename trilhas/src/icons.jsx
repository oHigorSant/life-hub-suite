import {
  House, Compass, Sparkles, User, Flame, Zap, Target, Check, Lock, X, ArrowLeft, ArrowRight, Play, Lightbulb, WandSparkles,
  RotateCcw, ChevronDown, Trophy, Medal, Crown, Gem, Sprout, BookOpen, Rocket, CalendarDays, Flag, Heart, Brain, Search,
  Calculator, Layers, Type, Calendar, Blocks, Dices, AppWindow, Eye, Puzzle, Link2, ChartColumn, Package, Funnel, Ruler,
  Sigma, Database, Table2, KeyRound, Code, Pencil, Trash2, Plus, ArrowUpDown, Globe, Music, Shield, Clock, GraduationCap,
  Star, PartyPopper, Scale, TriangleAlert, Languages, Dumbbell, Landmark, Palette, Terminal, GitBranch, Wallet, ChefHat,
  Atom, Boxes, Network, ListOrdered, Volume2, VolumeX, Settings, Sun, Moon, Share2, Cpu, Camera, Leaf, Coffee, Plane, HeartPulse,
  Send, NotebookPen, Bookmark, BookmarkCheck, Cloud, CloudOff, CloudCheck, MessageCircle, Tag, Copy, RefreshCw,
  Snowflake, Award, Printer, Download, FlaskConical,
} from 'lucide-react';

// Registro de ícones (kebab-case). Trilhas geradas por IA escolhem um destes nomes.
export const ICONS = {
  home: House, compass: Compass, sparkles: Sparkles, user: User, flame: Flame, zap: Zap, target: Target, check: Check, lock: Lock,
  x: X, 'arrow-left': ArrowLeft, 'arrow-right': ArrowRight, play: Play, bulb: Lightbulb, wand: WandSparkles, reset: RotateCcw,
  'chevron-down': ChevronDown, trophy: Trophy, medal: Medal, crown: Crown, gem: Gem, sprout: Sprout, book: BookOpen, rocket: Rocket,
  calendar: Calendar, 'calendar-days': CalendarDays, flag: Flag, heart: Heart, brain: Brain, search: Search, calculator: Calculator,
  layers: Layers, type: Type, blocks: Blocks, dice: Dices, window: AppWindow, eye: Eye, puzzle: Puzzle, link: Link2, chart: ChartColumn,
  package: Package, filter: Funnel, ruler: Ruler, sigma: Sigma, database: Database, table: Table2, key: KeyRound, code: Code,
  pencil: Pencil, trash: Trash2, plus: Plus, sort: ArrowUpDown, globe: Globe, music: Music, shield: Shield, clock: Clock,
  graduation: GraduationCap, star: Star, party: PartyPopper, scale: Scale, alert: TriangleAlert, languages: Languages,
  dumbbell: Dumbbell, landmark: Landmark, palette: Palette, terminal: Terminal, git: GitBranch, wallet: Wallet, chef: ChefHat,
  atom: Atom, boxes: Boxes, network: Network, 'list-ordered': ListOrdered, volume: Volume2, mute: VolumeX, settings: Settings,
  sun: Sun, moon: Moon, share: Share2, cpu: Cpu, camera: Camera, leaf: Leaf, coffee: Coffee, plane: Plane, health: HeartPulse,
  send: Send, notes: NotebookPen, bookmark: Bookmark, 'bookmark-check': BookmarkCheck, cloud: Cloud, 'cloud-off': CloudOff, 'cloud-check': CloudCheck,
  chat: MessageCircle, tag: Tag, copy: Copy, sync: RefreshCw,
  snowflake: Snowflake, award: Award, printer: Printer, download: Download, lab: FlaskConical,
};
export const ICON_NAMES = Object.keys(ICONS);

export function Icon({ name, size = 22, stroke = 2.2, className = '', fill, style }) {
  const C = ICONS[name] || ICONS.book;
  return <C size={size} strokeWidth={stroke} className={`ico ${className}`} fill={fill ?? 'none'} style={style} aria-hidden="true" />;
}
