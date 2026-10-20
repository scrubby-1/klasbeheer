import { useEffect, useState } from 'react';
import { Icon, ToastHost, useData, useRoute } from './components/ui.tsx';
import { OverviewPage } from './pages/OverviewPage.tsx';
import { EvaluationsPage } from './pages/EvaluationsPage.tsx';
import { ClassPage, NewClassDialog } from './pages/ClassPage.tsx';
import { GradebookPage } from './pages/GradebookPage.tsx';
import { StudentPage } from './pages/StudentPage.tsx';
import { ImportPage } from './pages/ImportPage.tsx';
import { DataPage, useSync } from './pages/DataPage.tsx';
import { activeStudents, sortClasses } from './lib/calc.ts';
import { canUndo, undo } from './lib/store.ts';

export function App() {
  const route = useRoute();
  const data = useData();
  const sync = useSync();
  const [menu, setMenu] = useState(false);
  const [newClass, setNewClass] = useState(false);

  useEffect(() => setMenu(false), [route.join('/')]);

  // Ctrl/Cmd+Z buiten invulvakken = laatste wijziging ongedaan maken
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !/INPUT|TEXTAREA|SELECT/.test(t.tagName) && canUndo()) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const [page, a, b] = route;
  let content;
  switch (page) {
    case undefined:
      content = <OverviewPage />;
      break;
    case 'evaluaties':
      content = <EvaluationsPage />;
      break;
    case 'klas':
      content = <ClassPage id={a} />;
      break;
    case 'puntenboek':
      content = <GradebookPage key={a} id={a} focusEval={b} />;
      break;
    case 'leerling':
      content = <StudentPage key={b} classId={a} studentId={b} />;
      break;
    case 'import':
      content = <ImportPage />;
      break;
    case 'gegevens':
      content = <DataPage />;
      break;
    default:
      content = (
        <div className="page"><div className="empty"><h2>Deze pagina bestaat niet</h2><a className="btn" href="#/">Naar het overzicht</a></div></div>
      );
  }

  const isActive = (p: string) => (route.join('/') === p ? 'active' : '');
  const currentClass =
    page === 'klas' ? a : page === 'leerling' ? a : page === 'puntenboek' ? data.gradebooks.find((g) => g.id === a)?.classId : undefined;

  return (
    <div className="app">
      <header className="topbar">
        <button onClick={() => setMenu(true)} aria-label="Menu openen"><Icon name="menu" size={22} /></button>
        <strong style={{ fontFamily: 'var(--font-head)' }}>Klasbeheer</strong>
      </header>
      <aside className={`sidebar${menu ? ' open' : ''}`} onClick={(e) => e.target === e.currentTarget && setMenu(false)}>
        <a className="brand" href="#/">
          <span className="brand-mark" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1d4f43" strokeWidth="2.6" strokeLinecap="round"><path d="M5 7h14M5 12h14M5 17h8" /><circle cx="18" cy="17" r="2.4" fill="#d8453a" stroke="none" /></svg>
          </span>
          <span className="brand-name">Klasbeheer</span>
        </a>
        <nav className="nav" aria-label="Hoofdmenu">
          <a href="#/" className={isActive('')}>Overzicht</a>
          <a href="#/evaluaties" className={isActive('evaluaties')}>Evaluaties</a>
          <a href="#/import" className={isActive('import')}>Importeren</a>
          <a href="#/gegevens" className={isActive('gegevens')}>Gegevens</a>
        </nav>
        <nav className="nav" aria-label="Klassen">
          <div className="nav-title">Klassen</div>
          {sortClasses(data.classes).map((c) => {
            const gbs = data.gradebooks.filter((g) => g.classId === c.id).sort((x, y) => x.subject.localeCompare(y.subject, 'nl'));
            return (
              <div className="nav-class" key={c.id}>
                <a href={`#/klas/${c.id}`} className={isActive(`klas/${c.id}`)}>
                  <span>{c.name}</span>
                  <span className="count">{activeStudents(c).length}</span>
                </a>
                {currentClass === c.id && gbs.length > 0 && (
                  <div className="sub">
                    {gbs.map((g) => (
                      <a key={g.id} href={`#/puntenboek/${g.id}`} className={page === 'puntenboek' && a === g.id ? 'active' : ''}>
                        {g.subject}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <a href="#/" onClick={(e) => { e.preventDefault(); setNewClass(true); }} style={{ opacity: 0.75 }}>
            <span>+ Nieuwe klas</span>
          </a>
        </nav>
        <div className="sidebar-foot">
          <a href="#/gegevens" style={{ color: 'inherit', textDecoration: 'none' }}>
            <span className={`sync-dot ${sync.status === 'ok' && sync.email ? 'on' : sync.status === 'fout' ? 'err' : ''}`} />
            {sync.email ? (sync.status === 'fout' ? 'Synchroniseren mislukt' : 'Online bewaard') : 'Enkel in deze browser'}
          </a>
        </div>
      </aside>
      <main className="main">{content}</main>
      {newClass && <NewClassDialog onClose={() => setNewClass(false)} />}
      <ToastHost />
    </div>
  );
}
