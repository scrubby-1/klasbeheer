import { useEffect, useState } from 'react';
import { Icon, ToastHost, useData, useRoute } from './components/ui.tsx';
import { OverviewPage } from './pages/OverviewPage.tsx';
import { EvaluationsPage } from './pages/EvaluationsPage.tsx';
import { ClassPage, NewClassDialog } from './pages/ClassPage.tsx';
import { GradebookPage } from './pages/GradebookPage.tsx';
import { StudentPage } from './pages/StudentPage.tsx';
import { SeatingPage } from './pages/SeatingPage.tsx';
import { ImportPage } from './pages/ImportPage.tsx';
import { DataPage, useAuth } from './pages/DataPage.tsx';
import { LoadingPage, LoginPage, NewPasswordPage, NotConfiguredPage } from './pages/LoginPage.tsx';
import { leaveDemo, resetDemo, signOut } from './lib/sync.ts';
import { activeStudents, sortClasses } from './lib/calc.ts';
import { canUndo, undo } from './lib/store.ts';

export function App() {
  const auth = useAuth();
  if (auth.phase === 'niet-ingesteld') return <NotConfiguredPage />;
  if (auth.phase === 'herstel') return <NewPasswordPage />;
  if (auth.phase === 'afgemeld') return <LoginPage auth={auth} />;
  if (auth.phase === 'laden') return <LoadingPage />;
  return <Shell demo={auth.phase === 'demo'} />;
}

function Shell({ demo }: { demo: boolean }) {
  const route = useRoute();
  const data = useData();
  const sync = useAuth();
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
      content = b === 'plan' ? <SeatingPage key={a} id={a} /> : <ClassPage id={a} />;
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
                {currentClass === c.id && (
                  <div className="sub">
                    <a href={`#/klas/${c.id}/plan`} className={isActive(`klas/${c.id}/plan`)}>Klasplan</a>
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
        {demo ? (
        <div className="sidebar-foot">
          <span><span className="sync-dot" />Demo: niets wordt bewaard</span>
          <button className="linkish" style={{ color: 'inherit' }} onClick={() => leaveDemo()}>Demo verlaten</button>
        </div>
        ) : (
        <div className="sidebar-foot">
          <a href="#/gegevens" style={{ color: 'inherit', textDecoration: 'none' }}>
            <span className={`sync-dot ${sync.status === 'ok' ? 'on' : sync.status === 'fout' ? 'err' : ''}`} />
            {sync.status === 'fout' ? 'Opslaan mislukt' : sync.status === 'bezig' ? 'Opslaan…' : 'Online bewaard'}
          </a>
          <span style={{ opacity: 0.75, overflow: 'hidden', textOverflow: 'ellipsis' }}>{sync.email}</span>
          <button className="linkish" style={{ color: 'inherit' }} onClick={() => signOut()}>Afmelden</button>
        </div>
        )}
      </aside>
      <main className="main">
        {demo && (
          <div className="demo-banner" role="note">
            <span>
              <strong>Demoversie</strong> met fictieve klassen en leerlingen. Probeer gerust alles uit: niets wordt online bewaard en
              alles verdwijnt wanneer je dit tabblad sluit.
            </span>
            <span className="actions">
              <button className="btn small" onClick={() => resetDemo()}>Opnieuw beginnen</button>
              <button className="btn small ghost" onClick={() => leaveDemo()}>Demo verlaten</button>
            </span>
          </div>
        )}
        {content}
      </main>
      {newClass && <NewClassDialog onClose={() => setNewClass(false)} />}
      <ToastHost />
    </div>
  );
}
