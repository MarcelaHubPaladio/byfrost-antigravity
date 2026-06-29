const fs = require('fs');

let content = fs.readFileSync('src/pages/OperacaoM30.tsx', 'utf-8');

// Update props
content = content.replace(
    'function M30CalendarView({ cases, date, onChangeDate }: { cases: CaseRow[], date: Date, onChangeDate: (d: Date) => void }) {',
    'function M30CalendarView({ cases, date, onChangeDate, locks }: { cases: CaseRow[], date: Date, onChangeDate: (d: Date) => void, locks: Record<string, any> }) {'
);

// Update render in Calendar
const oldRender = `                      <div className="text-[11px] font-semibold text-slate-800 line-clamp-2 leading-tight">
                        {c.title || "Caso sem título"}
                      </div>`;
const newRender = `                      <div className="flex items-start justify-between gap-1">
                        <div className="text-[11px] font-semibold text-slate-800 line-clamp-2 leading-tight">
                          {c.title || "Caso sem título"}
                        </div>
                        {locks[c.id] && (
                          <div className="text-rose-600 shrink-0" title={\`Editado por \${locks[c.id].userName}\`}>
                            <Lock className="h-3 w-3" />
                          </div>
                        )}
                      </div>`;
content = content.replace(oldRender, newRender);

// Update calls to M30CalendarView
content = content.replace(
    '<M30CalendarView cases={casesQ.data} date={calendarDate} onChangeDate={setCalendarDate} />',
    '<M30CalendarView cases={casesQ.data} date={calendarDate} onChangeDate={setCalendarDate} locks={locks} />'
);

fs.writeFileSync('src/pages/OperacaoM30.tsx', content);
