import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowDownToLine, BookOpen, Box, Camera, Check, ChevronRight,
  CircleGauge, CloudRain, Database, Factory, Fuel, Layers3, Mountain, Pause, Play,
  Radio, RotateCcw, Route, Truck, Waves, X, Zap,
} from 'lucide-react';
import MineScene, { type CameraView } from './components/MineScene';
import { CycleBars, ThroughputChart } from './components/Charts';
import { fetchLiveSnapshot, interpolateTrace, loadTrace, resetLive, sendScenario } from './client';
import { formatTime, num, SCENARIOS, STATE_RU, text } from './data';
import type { ConnectionMode, Scenario, Snapshot, Trace } from './types';

const cameras: Array<{ id: CameraView; label: string }> = [
  { id: 'overview', label: 'Карьер' }, { id: 'spiral', label: 'Сверху' },
  { id: 'bottom', label: 'Забой' }, { id: 'crusher', label: 'Дробилка' },
];

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const items = dialog.current?.querySelectorAll<HTMLElement>('button, a[href], [tabindex="0"]');
        if (!items?.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={dialog}>
      <div className="modal-head"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Закрыть"><X size={19}/></button></div>
      <div className="modal-body">{children}</div>
    </div>
  </div>;
}

function App() {
  const [trace, setTrace] = useState<Trace | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [mode, setMode] = useState<ConnectionMode>('connecting');
  const [scenario, setScenario] = useState<Scenario>('baseline');
  const [cursor, setCursor] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [cameraView, setCameraView] = useState<CameraView>('overview');
  const [selected, setSelected] = useState<string | null>('org.openegiz.samson:truck-01');
  const [showRoad, setShowRoad] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [heatmap, setHeatmap] = useState(false);
  const [tab, setTab] = useState<'scenarios' | 'events' | 'model'>('scenarios');
  const [docsOpen, setDocsOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadTrace('baseline').then((base) => {
      if (cancelled) return;
      setTrace(base);
      setSnapshot(interpolateTrace(base, 12));
      setCursor(12);
      return fetchLiveSnapshot();
    }).then((live) => {
      if (!live || cancelled) return;
      setSnapshot(live);
      setScenario(live.scenario);
      setMode('openegiz');
    }).catch(() => { if (!cancelled) setMode('trace'); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (mode !== 'openegiz') return;
    const timer = window.setInterval(() => {
      fetchLiveSnapshot().then((live) => {
        if (!paused) setSnapshot(live);
        setScenario(live.scenario);
      }).catch(() => setMode('reconnecting'));
    }, 1800);
    return () => window.clearInterval(timer);
  }, [mode, paused]);

  useEffect(() => {
    if (mode !== 'reconnecting') return;
    const timer = window.setInterval(() => {
      fetchLiveSnapshot().then((live) => { setSnapshot(live); setMode('openegiz'); }).catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'trace' || paused || !trace) return;
    const timer = window.setInterval(() => {
      setCursor((current) => {
        const next = current + 0.035 * speed;
        const wrapped = next >= trace.frames.length - 1 ? 0 : next;
        setSnapshot(interpolateTrace(trace, wrapped));
        return wrapped;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [mode, paused, speed, trace]);

  const chooseScenario = useCallback(async (next: Scenario) => {
    setBusy(true);
    try {
      if (modeRef.current === 'openegiz') {
        await sendScenario(next);
        const live = await fetchLiveSnapshot();
        setSnapshot(live);
      } else {
        const nextTrace = await loadTrace(next);
        setTrace(nextTrace);
        setCursor(0);
        setSnapshot(interpolateTrace(nextTrace, 0));
        setMode('trace');
      }
      setScenario(next);
      notify(`${SCENARIOS.find((s) => s.id === next)?.title}: сценарий применён`);
    } catch {
      notify('Команда не выполнена. Проверьте соединение с OpenEgiz.');
    } finally { setBusy(false); }
  }, [notify]);

  const reset = useCallback(async () => {
    setResetOpen(false);
    setBusy(true);
    try {
      if (modeRef.current === 'openegiz') await resetLive();
      await chooseScenario('baseline');
      notify('Смена возвращена к базовому сценарию');
    } finally { setBusy(false); }
  }, [chooseScenario, notify]);

  const exportSnapshot = () => {
    if (!snapshot) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `samson-${snapshot.scenario}-${Math.round(snapshot.time_s)}s.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify('Снимок двойников сохранён в JSON');
  };

  const trucks = useMemo(() => snapshot ? Object.entries(snapshot.things).filter(([, t]) => t.kind === 'truck') : [], [snapshot]);
  const excavators = useMemo(() => snapshot ? Object.entries(snapshot.things).filter(([, t]) => t.kind === 'excavator') : [], [snapshot]);
  const selectedTwin = selected && snapshot?.things[selected] ? snapshot.things[selected] : null;
  const mine = snapshot?.things['org.openegiz.samson:mine-01'];
  const production = mine?.features.production;
  const fleet = mine?.features.fleet;
  const cycle = mine?.features.cycle;
  const scenarioInfo = SCENARIOS.find((s) => s.id === scenario)!;

  if (!snapshot || !trace) {
    return <main className="loading-screen"><div className="brand-mark"><Mountain size={28}/></div><h1>Самсон</h1><p>Загрузка пространственной модели и цифровых двойников…</p><div className="loading-line"><span/></div></main>;
  }

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Mountain size={22}/></div><div><strong>САМСОН</strong><span>Цифровой карьер · OpenEgiz</span></div></div>
      <div className={`connection connection-${mode}`} title={mode === 'trace' ? 'Автономный просмотр: заранее рассчитанная телеметрия того же Python-симулятора' : 'Данные объектов получены из Eclipse Ditto'}>
        <Radio size={14}/><span>{mode === 'openegiz' ? 'OPENEGIZ · DITTO' : mode === 'trace' ? 'ДЕМО-ТРАССА · OFFLINE' : mode === 'connecting' ? 'ПОДКЛЮЧЕНИЕ' : 'ПЕРЕПОДКЛЮЧЕНИЕ'}</span>
      </div>
      <div className="topbar-actions">
        <button className="button ghost" onClick={() => setDocsOpen(true)}><BookOpen size={16}/><span>Архитектура</span></button>
        <button className="button ghost" onClick={exportSnapshot}><ArrowDownToLine size={16}/><span>Экспорт JSON</span></button>
        <button className="button ghost danger-hover" onClick={() => setResetOpen(true)}><RotateCcw size={16}/><span>Сброс</span></button>
      </div>
    </header>

    <section className="kpi-strip" aria-label="Ключевые показатели смены">
      <div className="kpi"><span>Время смены</span><strong>{formatTime(snapshot.time_s)}</strong><small><Activity size={13}/> Сценарное время ×10</small></div>
      <div className="kpi"><span>Переработано руды</span><strong>{num(production, 'tonnes').toLocaleString('ru-RU', { maximumFractionDigits: 1 })} <em>т</em></strong><small><Factory size={13}/> {num(production, 'throughput_tph').toFixed(0)} т/ч · план 2400</small></div>
      <div className="kpi"><span>Транспортный цикл</span><strong>{(num(cycle, 'average_s') / 60).toFixed(1)} <em>мин</em></strong><small><Route size={13}/> Маршрут {num(cycle, 'route_km').toFixed(2)} км</small></div>
      <div className="kpi"><span>Парк на линии</span><strong>{num(fleet, 'active')} <em>/ 8</em></strong><small><Truck size={13}/> {num(fleet, 'hauling')} в пути · {num(fleet, 'queued')} в очереди</small></div>
      <div className="kpi"><span>Содержание меди</span><strong>{num(production, 'grade_pct').toFixed(3)} <em>%</em></strong><small><Waves size={13}/> Средневзвешенное по массе</small></div>
    </section>

    <main className="workspace">
      <aside className="left-panel panel">
        <div className="panel-heading"><div><span className="eyebrow">АКТИВЫ</span><h2>Техника карьера</h2></div><span className="count-badge">{trucks.length + excavators.length + 1}</span></div>
        <div className="section-label">САМОСВАЛЫ · 60 Т</div>
        <div className="equipment-list">
          {trucks.map(([id, truck]) => {
            const state = String(truck.features.state?.value);
            return <button key={id} className={`equipment-row ${selected === id ? 'selected' : ''}`} onClick={() => setSelected(id)}>
              <span className={`equipment-icon ${state === 'standby' ? 'muted' : ''}`}><Truck size={17}/></span>
              <span className="equipment-copy"><strong>{truck.name.replace('КАМАЗ ', '')}</strong><small>{STATE_RU[state] || state}</small></span>
              <span className="equipment-value"><strong>{Math.round(num(truck.features.speed))}</strong><small>км/ч</small></span>
            </button>;
          })}
        </div>
        <div className="section-label excavator-label">ЗАБОЙНОЕ ОБОРУДОВАНИЕ</div>
        {excavators.map(([id, ex]) => <button key={id} className={`equipment-row ${selected === id ? 'selected' : ''}`} onClick={() => setSelected(id)}>
          <span className="equipment-icon"><Zap size={17}/></span><span className="equipment-copy"><strong>{ex.name.replace('Экскаватор ', '')}</strong><small>{STATE_RU[String(ex.features.state?.value)]}</small></span><span className={`state-dot ${ex.features.state?.value === 'failure' ? 'critical' : 'ok'}`}/>
        </button>)}
        <button className={`equipment-row ${selected === 'org.openegiz.samson:crusher-01' ? 'selected' : ''}`} onClick={() => setSelected('org.openegiz.samson:crusher-01')}>
          <span className="equipment-icon"><Factory size={17}/></span><span className="equipment-copy"><strong>ДЩ-01</strong><small>Дробильный комплекс</small></span><span className="state-dot ok"/>
        </button>

        {selectedTwin && <div className="asset-detail">
          <div className="section-label">ВЫБРАННЫЙ ДВОЙНИК</div>
          <h3>{selectedTwin.name}</h3>
          <code>{selected}</code>
          {selectedTwin.kind === 'truck' ? <dl>
            <div><dt>Статус</dt><dd>{STATE_RU[String(selectedTwin.features.state?.value)]}</dd></div>
            <div><dt>Груз</dt><dd>{num(selectedTwin.features.payload).toFixed(1)} / 60 т</dd></div>
            <div><dt>Топливо</dt><dd>{num(selectedTwin.features.fuel).toFixed(0)}%</dd></div>
            <div><dt>Пройдено</dt><dd>{num(selectedTwin.features.route, 'progress_pct').toFixed(0)}%</dd></div>
            <div><dt>Забой</dt><dd>ЭК-{String(num(selectedTwin.features.dispatch, 'excavator')).padStart(2, '0')}</dd></div>
          </dl> : selectedTwin.kind === 'excavator' ? <dl>
            <div><dt>Статус</dt><dd>{STATE_RU[String(selectedTwin.features.state?.value)]}</dd></div>
            <div><dt>Ковш</dt><dd>{num(selectedTwin.features.bucket, 'capacity_t')} т · 30 с</dd></div>
            <div><dt>Проходок</dt><dd>{num(selectedTwin.features.passes_total)}</dd></div>
            <div><dt>Медь в забое</dt><dd>{num(selectedTwin.features.face_grade).toFixed(3)}%</dd></div>
          </dl> : <dl>
            <div><dt>Статус</dt><dd>{STATE_RU[String(selectedTwin.features.state?.value)]}</dd></div>
            <div><dt>Подача</dt><dd>{num(selectedTwin.features.throughput).toFixed(0)} т/ч</dd></div>
            <div><dt>Принято</dt><dd>{num(selectedTwin.features.tonnes_total).toFixed(1)} т</dd></div>
          </dl>}
        </div>}
      </aside>

      <section className="scene-panel panel">
        <div className="scene-toolbar">
          <div className="camera-tabs" aria-label="Ракурс камеры">{cameras.map((camera) => <button key={camera.id} className={cameraView === camera.id ? 'active' : ''} onClick={() => setCameraView(camera.id)}>{camera.label}</button>)}</div>
          <div className="scene-tools">
            <button className={showRoad ? 'active' : ''} onClick={() => setShowRoad(!showRoad)} title="Показать или скрыть дорогу" aria-pressed={showRoad}><Route size={16}/></button>
            <button className={showLabels ? 'active' : ''} onClick={() => setShowLabels(!showLabels)} title="Показать или скрыть подписи" aria-pressed={showLabels}><Layers3 size={16}/></button>
            <button className={heatmap ? 'active' : ''} onClick={() => setHeatmap(!heatmap)} title="Цветовая карта состояния дороги" aria-pressed={heatmap}><CircleGauge size={16}/></button>
          </div>
        </div>
        <div className="scene-wrap">
          <MineScene snapshot={snapshot} route={trace.route} selected={selected} onSelect={setSelected} cameraView={cameraView} showRoad={showRoad} showLabels={showLabels} heatmap={heatmap}/>
          <div className={`scene-alert tone-${scenarioInfo.tone}`}><span>{scenario === 'baseline' ? <Check size={14}/> : <AlertTriangle size={14}/>}</span><div><strong>{scenarioInfo.title}</strong><small>{scenarioInfo.short}</small></div></div>
          <div className="scene-hint"><Camera size={14}/> Вращение · масштаб · выбор техники</div>
          <div className="scene-compass" aria-hidden="true"><span>N</span><i/></div>
        </div>
        <div className="playback-bar">
          <button className="play-button" onClick={() => setPaused(!paused)} aria-label={paused ? 'Продолжить' : 'Пауза'}>{paused ? <Play size={16}/> : <Pause size={16}/>}</button>
          <div className="playback-copy"><strong>{paused ? 'Просмотр приостановлен' : 'Симуляция идёт'}</strong><small>{mode === 'openegiz' ? 'Данные обновляются из Ditto каждые 1,8 с' : 'Воспроизведение рассчитанной трассы'}</small></div>
          {mode === 'trace' && <div className="speed-control">{[1, 2, 4].map((value) => <button key={value} className={speed === value ? 'active' : ''} onClick={() => setSpeed(value)}>×{value}</button>)}</div>}
          <div className="road-legend"><span><i className="loaded"/>Гружёный</span><span><i className="empty"/>Порожний</span><span><i className="level"/>Уступ 12 м</span></div>
        </div>
      </section>

      <aside className="right-panel panel">
        <div className="right-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'scenarios'} className={tab === 'scenarios' ? 'active' : ''} onClick={() => setTab('scenarios')}>Что если</button>
          <button role="tab" aria-selected={tab === 'events'} className={tab === 'events' ? 'active' : ''} onClick={() => setTab('events')}>Журнал</button>
          <button role="tab" aria-selected={tab === 'model'} className={tab === 'model' ? 'active' : ''} onClick={() => setTab('model')}>Модель</button>
        </div>
        {tab === 'scenarios' && <div className="scenario-content" role="tabpanel">
          <div className="panel-heading"><div><span className="eyebrow">СЦЕНАРНЫЙ КОНТУР</span><h2>Что изменится?</h2></div></div>
          <p className="panel-intro">Воздействие передаётся агентам, а результат возвращается через состояние двойников.</p>
          <div className="scenario-list">{SCENARIOS.filter((s) => s.id !== 'baseline').map((item) => <button key={item.id} disabled={busy} className={`scenario-card tone-${item.tone} ${scenario === item.id ? 'active' : ''}`} onClick={() => chooseScenario(item.id)}>
            <span className="scenario-icon">{item.id === 'rain' ? <CloudRain size={18}/> : item.id === 'extra_fleet' ? <Truck size={18}/> : <AlertTriangle size={18}/>}</span>
            <span><strong>{item.title}</strong><small>{item.description}</small><em>{item.short}</em></span>
            <ChevronRight size={16}/>
          </button>)}</div>
          <div className="scenario-result"><span className="section-label">ТЕКУЩЕЕ ВОЗДЕЙСТВИЕ</span><strong>{scenarioInfo.title}</strong><p>{scenarioInfo.mechanism}</p>{scenario !== 'baseline' && <button className="button secondary full" disabled={busy} onClick={() => chooseScenario('baseline')}><RotateCcw size={15}/> Снять ограничение</button>}</div>
        </div>}
        {tab === 'events' && <div className="event-content" role="tabpanel"><div className="panel-heading"><div><span className="eyebrow">СМЕНА</span><h2>Журнал событий</h2></div></div><div className="event-list">{snapshot.events.map((event, index) => <div className={`event severity-${event.severity}`} key={`${event.time_s}-${index}`}><time>{formatTime(event.time_s).slice(0, 5)}</time><span/><p>{event.text}</p></div>)}</div></div>}
        {tab === 'model' && <div className="model-content" role="tabpanel"><div className="panel-heading"><div><span className="eyebrow">DITTO</span><h2>Граф двойников</h2></div></div><div className="model-root"><Database size={18}/><strong>Карьер «Самсон»</strong><code>mine-01</code></div>{[['road-01', 'Спиральный съезд', Route], ['excavator-01', 'ЭК-01', Zap], ['excavator-02', 'ЭК-02', Zap], ['truck-01…08', '8 самосвалов', Truck], ['crusher-01', 'ДЩ-01', Factory]].map(([id, label, Icon]) => { const I = Icon as typeof Route; return <div className="model-node" key={String(id)}><span/><I size={16}/><strong>{String(label)}</strong><code>{String(id)}</code></div>; })}<div className="model-flow"><span>Агенты</span><ChevronRight size={14}/><span>MQTT</span><ChevronRight size={14}/><span>Ditto</span><ChevronRight size={14}/><span>3D</span></div><button className="button secondary full" onClick={() => setDocsOpen(true)}><BookOpen size={15}/> Открыть техописание</button></div>}
      </aside>
    </main>

    <section className="analytics-grid">
      <div className="panel analytics-chart"><div className="panel-heading"><div><span className="eyebrow">СМЕНА · ТЕЛЕМЕТРИЯ</span><h2>Производительность дробилки</h2></div><strong className="metric-inline">{num(production, 'throughput_tph').toFixed(0)} <em>т/ч</em></strong></div><ThroughputChart snapshot={snapshot}/></div>
      <div className="panel analytics-fleet"><div className="panel-heading"><div><span className="eyebrow">ДИСПЕТЧЕР</span><h2>Скорость по машинам</h2></div><span className="unit-label">км/ч</span></div><CycleBars snapshot={snapshot}/></div>
      <div className="panel decision-panel"><div className="panel-heading"><div><span className="eyebrow">РЕШЕНИЕ</span><h2>Узкое место</h2></div></div><div className="decision-body"><span className={`decision-gauge ${num(fleet, 'queued') > 2 ? 'warning' : ''}`}><CircleGauge size={25}/></span><div><strong>{num(fleet, 'queued') > 2 ? 'Очередь ограничивает смену' : 'Транспорт сбалансирован'}</strong><p>{num(fleet, 'queued') > 2 ? `${num(fleet, 'queued')} машины ожидают обслуживания. Проверьте сценарий и распределение по забоям.` : 'Очередь не превышает двух машин. Текущая конфигурация парка допустима.'}</p></div></div><div className="decision-foot"><Fuel size={15}/><span>Расход учитывает уклон {text(mine?.features.road, 'gradient_pct')}% и сопротивление дороги</span></div></div>
    </section>

    <footer className="footer"><span>SAMSON / DIGITAL MINE</span><span>13 двойников · 6 типов агентов · детерминированное зерно 65805</span><span>Данные синтетические · модель не для управления реальной техникой</span></footer>

    {toast && <div className="toast" role="status"><Check size={16}/>{toast}</div>}
    {docsOpen && <Modal title="Как устроен цифровой карьер" onClose={() => setDocsOpen(false)}>
      <div className="docs-grid">
        <section><span className="docs-number">01</span><h3>Поток данных</h3><p><b>Агенты Python</b> рассчитывают физический цикл и публикуют Ditto Protocol в <b>MQTT</b>. <b>Eclipse Ditto</b> хранит актуальные состояния. Telegraf переносит их в InfluxDB. Этот интерфейс получает live-значения из Ditto через серверный шлюз.</p><div className="docs-flow"><span>engine.py</span><ChevronRight/><span>telemetry/*</span><ChevronRight/><span>Ditto API</span><ChevronRight/><span>React + Three.js</span></div></section>
        <section><span className="docs-number">02</span><h3>Где искать код</h3><ul className="file-list"><li><code>mine/simulator/engine.py</code><span>Агенты самосвалов, экскаваторов, дробилки и диспетчера</span></li><li><code>mine/simulator/geometry.py</code><span>Спираль, полосы, уклон, высота и курсовой угол</span></li><li><code>mine/simulator/main.py</code><span>MQTT, сценарный HTTP API и экспорт трасс</span></li><li><code>mine/setup_twins.py</code><span>Создание 13 двойников в Ditto</span></li><li><code>mine/ui/components/MineScene.tsx</code><span>3D-геометрия и отображение состояний</span></li><li><code>mine/ui/server.mjs</code><span>Серверное чтение Ditto без пароля в браузере</span></li></ul></section>
        <section><span className="docs-number">03</span><h3>Данные и допущения</h3><p>Реальных датчиков и производственной истории нет. Используется <b>синтетическая модель</b>: 60-тонный КАМАЗ-65805 «Самсон», пять проходок ковша по 12 т, уклон 7,1%, пять уступов по 12 м, скорость ограничена кривизной, дистанцией и погодой. Все значения рассчитывает один детерминированный движок с зерном 65805.</p><p>Автономная демонстрация воспроизводит JSON-трассы, экспортированные этим же движком. Это не второй симулятор и не подмена OpenEgiz: при запуске <code>make samson</code> интерфейс работает с Ditto.</p></section>
        <section><span className="docs-number">04</span><h3>Запуск в VS Code</h3><ol><li>Откройте корень репозитория в VS Code. На Windows используйте Ubuntu 24.04 через WSL2.</li><li>Запустите Docker Desktop и выделите Docker не менее 6 ГБ памяти.</li><li>В терминале выполните <code>make samson</code>.</li><li>Откройте <code>http://localhost:8088</code>. Grafana остаётся на порту 3000.</li><li>Проверка контура: <code>make smoke</code>, остановка: <code>make down</code>.</li></ol><p>Только интерфейс для разработки: <code>npm install</code>, <code>npm run dev</code>. Без Docker он автоматически показывает офлайн-трассу.</p></section>
      </div>
    </Modal>}
    {resetOpen && <Modal title="Начать базовую смену заново?" onClose={() => setResetOpen(false)}><p className="confirm-copy">Текущий сценарий и накопленные показатели симулятора будут сброшены. Исторические ряды InfluxDB не удаляются.</p><div className="confirm-actions"><button className="button secondary" onClick={() => setResetOpen(false)}>Отмена</button><button className="button primary" onClick={reset}><RotateCcw size={16}/> Сбросить смену</button></div></Modal>}
  </div>;
}

export default App;
