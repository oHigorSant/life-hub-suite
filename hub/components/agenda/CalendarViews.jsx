"use client";

import { useEffect, useMemo, useState } from "react";
import { COLOR_HEX, WEEKDAYS, mins, hhmm, nowHhmm, todayYmd, weekDays, monthGrid, parseYmd, fmtShort } from "./dates.js";

const HOUR_PX = 52;

/** Distribui itens que se sobrepõem lado a lado. */
function layoutTimed(items) {
  const sorted = [...items].sort((a, b) => mins(a.startTime) - mins(b.startTime) || mins(b.endTime) - mins(a.endTime));
  const out = new Map();
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = [];
    for (const it of cluster) {
      let c = cols.findIndex((end) => end <= mins(it.startTime));
      if (c < 0) { c = cols.length; cols.push(0); }
      cols[c] = mins(it.endTime);
      out.set(it.key, { col: c });
    }
    for (const it of cluster) out.get(it.key).cols = cols.length;
    cluster = [];
    clusterEnd = -1;
  };
  for (const it of sorted) {
    if (cluster.length && mins(it.startTime) >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, mins(it.endTime));
  }
  if (cluster.length) flush();
  return out;
}

function useNow() {
  const [t, setT] = useState(nowHhmm());
  useEffect(() => { const i = setInterval(() => setT(nowHhmm()), 30000); return () => clearInterval(i); }, []);
  return t;
}

function hourRange(items) {
  let lo = 6 * 60;
  let hi = 22 * 60;
  for (const it of items) { lo = Math.min(lo, mins(it.startTime)); hi = Math.max(hi, mins(it.endTime)); }
  return { start: Math.floor(lo / 60), end: Math.min(24, Math.ceil(hi / 60)) };
}

function Block({ it, lay, start, onOpen }) {
  const top = ((mins(it.startTime) - start * 60) / 60) * HOUR_PX;
  const height = Math.max(20, ((mins(it.endTime) - mins(it.startTime)) / 60) * HOUR_PX - 2);
  const w = 100 / lay.cols;
  const hex = COLOR_HEX[it.color] || COLOR_HEX.blue;
  return (
    <button type="button" className={`ag-block ${it.kind}${it.done ? " done" : ""}`} style={{ top, height, left: `calc(${lay.col * w}% + 2px)`, width: `calc(${w}% - 4px)`, "--c": hex }} onClick={(e) => { e.stopPropagation(); onOpen(it); }} title={`${it.startTime}–${it.endTime} ${it.title}`}>
      <strong>{it.title}</strong>
      {height > 34 && <span>{it.startTime}–{it.endTime}{it.location ? ` · ${it.location}` : ""}</span>}
    </button>
  );
}

function Column({ day, items, start, end, onCreate, onOpen, showNow }) {
  const now = useNow();
  const timed = items.filter((i) => !i.allDay && i.startTime);
  const lay = useMemo(() => layoutTimed(timed), [timed]);
  const hours = Array.from({ length: end - start }, (_, i) => start + i);
  const nowTop = ((mins(now) - start * 60) / 60) * HOUR_PX;
  return (
    <div className="ag-col" style={{ height: (end - start) * HOUR_PX }} onClick={(e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const m = Math.floor(((e.clientY - rect.top) / HOUR_PX) * 2) * 30 + start * 60;
      onCreate(day, hhmm(Math.max(0, Math.min(23 * 60 + 30, m))));
    }}>
      {hours.map((h) => <div key={h} className="ag-hline" style={{ top: (h - start) * HOUR_PX }} />)}
      {timed.map((it) => <Block key={it.key} it={it} lay={lay.get(it.key)} start={start} onOpen={onOpen} />)}
      {showNow && day === todayYmd() && nowTop >= 0 && nowTop <= (end - start) * HOUR_PX && <div className="ag-now" style={{ top: nowTop }} />}
    </div>
  );
}

function AllDayRow({ items, onOpen }) {
  if (!items.length) return null;
  return (
    <div className="ag-allday">
      {items.map((it) => (
        <button key={it.key} type="button" className={`ag-chipev ${it.kind}${it.done ? " done" : ""}`} style={{ "--c": COLOR_HEX[it.color] || COLOR_HEX.blue }} onClick={() => onOpen(it)} title={it.title}>{it.kind === "task" ? "Tarefa · " : ""}{it.title}</button>
      ))}
    </div>
  );
}

export function DayView({ day, itemsFor, onCreate, onOpen }) {
  const items = itemsFor(day);
  const { start, end } = hourRange(items.filter((i) => i.startTime));
  return (
    <div className="ag-dayview">
      <AllDayRow items={items.filter((i) => i.allDay)} onOpen={onOpen} />
      <div className="ag-scroll">
        <div className="ag-timegrid">
          <div className="ag-hours">{Array.from({ length: end - start }, (_, i) => <div key={i} style={{ height: HOUR_PX }}>{String(start + i).padStart(2, "0")}:00</div>)}</div>
          <Column day={day} items={items} start={start} end={end} onCreate={onCreate} onOpen={onOpen} showNow />
        </div>
      </div>
    </div>
  );
}

export function WeekView({ day, itemsFor, onCreate, onOpen, onPickDay }) {
  const days = weekDays(day);
  const all = days.flatMap((d) => itemsFor(d));
  const { start, end } = hourRange(all.filter((i) => i.startTime));
  const today = todayYmd();
  return (
    <div className="ag-weekview">
      <div className="ag-weekhead">
        <div className="ag-gutter" />
        {days.map((d) => (
          <button key={d} type="button" className={`ag-dayhead${d === today ? " today" : ""}`} onClick={() => onPickDay(d)}>
            <span>{fmtShort(d).slice(0, 3)}</span><strong>{parseYmd(d).getDate()}</strong>
          </button>
        ))}
      </div>
      <div className="ag-weekallday">
        <div className="ag-gutter" />
        {days.map((d) => <div key={d} className="ag-wadcell"><AllDayRow items={itemsFor(d).filter((i) => i.allDay)} onOpen={onOpen} /></div>)}
      </div>
      <div className="ag-scroll">
        <div className="ag-timegrid week">
          <div className="ag-hours">{Array.from({ length: end - start }, (_, i) => <div key={i} style={{ height: HOUR_PX }}>{String(start + i).padStart(2, "0")}:00</div>)}</div>
          {days.map((d) => <Column key={d} day={d} items={itemsFor(d)} start={start} end={end} onCreate={onCreate} onOpen={onOpen} showNow />)}
        </div>
      </div>
    </div>
  );
}

export function MonthView({ day, itemsFor, onPickDay, onOpen }) {
  const grid = monthGrid(day);
  const month = parseYmd(day).getMonth();
  const today = todayYmd();
  return (
    <div className="ag-monthview">
      <div className="ag-mhead">{[1, 2, 3, 4, 5, 6, 0].map((w) => <div key={w}>{WEEKDAYS[w]}</div>)}</div>
      <div className="ag-mgrid">
        {grid.map((d) => {
          const items = itemsFor(d);
          const shown = items.slice(0, 3);
          return (
            <div key={d} className={`ag-mcell${parseYmd(d).getMonth() !== month ? " out" : ""}${d === today ? " today" : ""}`} onClick={() => onPickDay(d)}>
              <span className="ag-mnum">{parseYmd(d).getDate()}</span>
              {shown.map((it) => (
                <button key={it.key} type="button" className={`ag-mev ${it.kind}${it.done ? " done" : ""}`} style={{ "--c": COLOR_HEX[it.color] || COLOR_HEX.blue }} onClick={(e) => { e.stopPropagation(); onOpen(it); }}>
                  {it.startTime && !it.allDay ? `${it.startTime} ` : ""}{it.title}
                </button>
              ))}
              {items.length > 3 && <span className="ag-more">+{items.length - 3}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
