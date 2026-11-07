import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, ChipGroup, Empty, ErrorState, FormError, Icon, IconButton, Input, OfflineBanner, PageSkeleton, Sheet, Skeleton, StatusPill, Textarea, ToggleRow, useToast } from '../../components';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { useLoad, useOnline } from '../../lib/hooks';
import { shrinkPhoto } from '../../lib/photo';
import Scanner from './Scanner';
import './report.css';

const MAX_TEXT = 500;
const ISSUE_ORDER = ['NE_MARCHE_PAS', 'CABLE', 'REGLAGE', 'PIECE_CASSEE', 'BRUIT', 'ECRAN', 'AUTRE'];
const QR = /^KM\.(\d{1,10})\.(\d{1,10})$/;

/** Machine : pastille d'état si elle est déjà signalée ou en réparation */
function MachineState({ m }) {
  const { t } = useI18n();
  if (m.status === 'REPARATION' || m.outOfService) return <StatusPill tone="danger" icon="wrench">{t('report.inRepair')}</StatusPill>;
  if (m.status === 'SIGNALEE') return <StatusPill tone="warn" icon="triangle-alert">{t('report.alreadyReported')}</StatusPill>;
  return null;
}

/** Signaler une panne (B8 / B10) */
export default function Report() {
  const { user } = useAuth();
  const { t, label, error: errText } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const online = useOnline();
  const [params] = useSearchParams();
  const enabled = user?.gym?.settings?.features?.reports !== false;

  const machines = useLoad(() => (enabled ? api.get('/gym/machines') : []), [enabled]);
  const meta = useLoad(() => api.get('/meta'), []);

  const [machineId, setMachineId] = useState(null);
  const [issue, setIssue] = useState(null);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState(null);
  const [notify, setNotify] = useState(true);
  const [picker, setPicker] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanMsg, setScanMsg] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const list = machines.data || [];
  const machine = list.find((m) => m.id === machineId) || null;

  // ?m=<id> (QR d'une machine ouvert depuis l'appareil photo, ou lien depuis une séance)
  useEffect(() => {
    const m = Number(params.get('m'));
    if (m && list.some((x) => x.id === m)) setMachineId(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machines.data]);

  const onScan = (raw) => {
    const match = QR.exec(String(raw).trim());
    if (!match) return setScanMsg(t('report.scan.notKammel'));
    if (Number(match[1]) !== user.gymId) return setScanMsg(t('report.scan.otherGym'));
    const found = list.find((m) => m.id === Number(match[2]));
    if (!found) return setScanMsg(t('report.scan.unknown'));
    setMachineId(found.id);
    setScanOpen(false);
    setScanMsg(null);
    toast({ text: t('report.scan.found', { name: found.label }), icon: 'scan-line' });
    return null;
  };

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setPhoto(await shrinkPhoto(file));
    } catch (err) {
      toast({ text: t(`err.${err.message}`), tone: 'error' });
    }
  };

  const issues = useMemo(() => {
    const types = meta.data?.issueTypes || {};
    return ISSUE_ORDER.filter((k) => types[k]).concat(Object.keys(types).filter((k) => !ISSUE_ORDER.includes(k))).map((k) => ({ value: k, label: label(types[k]) }));
  }, [meta.data, label]);

  const send = async () => {
    if (!machine || !issue) return;
    setSending(true);
    setError(null);
    try {
      const body = { machineId: machine.id, issueType: issue, notify };
      if (text.trim()) body.description = text.trim();
      if (photo) body.photo = photo;
      const report = await api.post('/me/reports', body);
      navigate(`/app/panne/${report.id}`, { replace: true, state: { report, fresh: true } });
    } catch (err) {
      setError(err);
      setSending(false);
      if (err.code === 'TOO_MANY_REQUESTS') toast({ text: errText(err), tone: 'error' });
    }
  };

  const header = (
    <header className="app-header compact">
      <IconButton icon="arrow-left" label={t('action.back')} onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/app'))} />
      <h1>{t('report.title')}</h1>
    </header>
  );

  if (!enabled) {
    return (
      <main className="page">
        {header}
        <Empty icon="wrench" title={t('report.title')}>
          {t('report.disabled')}
        </Empty>
      </main>
    );
  }
  if (machines.loading && !machines.data) {
    return (
      <main className="page">
        {header}
        <PageSkeleton cards={3} />
      </main>
    );
  }
  if (machines.error) {
    return (
      <main className="page">
        {header}
        <ErrorState error={machines.error} onRetry={machines.reload} />
      </main>
    );
  }

  return (
    <main className="page rp">
      {header}
      <OfflineBanner text={t('report.offline')} />

      <h2 className="rp-q">{t('report.machine')}</h2>
      <div className="card rp-machine">
        <button type="button" className="rp-machine-pick" onClick={() => setPicker(true)} aria-label={machine ? t('report.change') : t('report.pick')}>
          <span className="rp-thumb" aria-hidden="true">
            <Icon name={machine?.zone === 'Cardio' ? 'activity' : 'dumbbell'} size={24} />
          </span>
          <span className="grow">
            <span className="w500 rp-block">{machine ? machine.label : t('report.pick')}</span>
            <span className="small muted rp-block">{machine ? t('report.code', { code: machine.code, zone: machine.zone.toLowerCase() }) : t('report.pickSub')}</span>
          </span>
        </button>
        <Button variant="secondary" size="sm" icon="scan-line" onClick={() => (setScanMsg(null), setScanOpen(true))}>
          {t('report.scan')}
        </Button>
      </div>
      {machine ? (
        <div>
          <MachineState m={machine} />
        </div>
      ) : null}

      <h2 className="rp-q">{t('report.issue')}</h2>
      {meta.loading && !meta.data ? (
        <Skeleton h={96} />
      ) : meta.error ? (
        <ErrorState error={meta.error} onRetry={meta.reload} compact />
      ) : (
        <div className="rp-issues">
          <ChipGroup options={issues} value={issue} onChange={setIssue} label={t('report.issue')} />
        </div>
      )}

      <div className="row between rp-q">
        <h2>{t('report.details')}</h2>
        <span className="small muted">{t('state.optional')}</span>
      </div>
      <div className="stack-2">
        <Textarea
          rows={3}
          maxLength={MAX_TEXT}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('report.detailsPlaceholder')}
          aria-label={t('report.details')}
        />
        <span className="caption muted text-end">
          <span className="num">{t('report.count', { n: text.length, max: MAX_TEXT })}</span>
        </span>
      </div>
      <div className="row-2 rp-photos">
        {photo ? (
          <span className="rp-photo">
            <img src={photo} alt={t('report.photoAlt')} />
            <button type="button" className="rp-photo-x" onClick={() => setPhoto(null)} aria-label={t('report.removePhoto')}>
              <Icon name="x" size={16} />
            </button>
          </span>
        ) : null}
        {!photo ? (
          <button type="button" className="rp-add" onClick={() => fileRef.current?.click()} aria-label={t('report.addPhotoLabel')}>
            <Icon name="camera" size={22} />
            <span className="caption">{t('report.addPhoto')}</span>
          </button>
        ) : null}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={pickPhoto} />
      </div>

      <div className="card">
        <ToggleRow title={t('report.notify')} subtitle={t('report.notifySub')} checked={notify} onChange={setNotify} />
      </div>

      <FormError error={error} />

      <div className="sticky-bar">
        <Button variant="primary" size="lg" block loading={sending} disabled={!machine || !issue || !online} onClick={send}>
          {t('report.send')}
        </Button>
      </div>

      <MachinePicker
        open={picker}
        onClose={() => setPicker(false)}
        machines={list}
        selected={machineId}
        onPick={(id) => {
          setMachineId(id);
          setPicker(false);
        }}
      />
      <Scanner open={scanOpen} onClose={() => setScanOpen(false)} onResult={onScan} message={scanMsg} />
    </main>
  );
}

/** Liste des machines de la salle, groupées par zone, avec recherche */
function MachinePicker({ open, onClose, machines, selected, onPick }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const groups = useMemo(() => {
    const query = norm(q.trim());
    const out = new Map();
    for (const m of machines) {
      const hay = norm(`${m.label} ${m.code} #${m.code} ${m.zone} ${m.equipment?.nameFr || ''} ${m.equipment?.nameAr || ''}`);
      if (query && !hay.includes(query)) continue;
      if (!out.has(m.zone)) out.set(m.zone, []);
      out.get(m.zone).push(m);
    }
    return [...out.entries()];
  }, [machines, q]);

  return (
    <Sheet open={open} onClose={onClose} title={t('report.pick')}>
      <div className="stack">
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('report.search')} aria-label={t('report.search')} />
        {!machines.length ? (
          <p className="small muted">{t('report.noMachines')}</p>
        ) : !groups.length ? (
          <p className="small muted">{t('report.noMatch')}</p>
        ) : (
          groups.map(([zone, items]) => (
            <section key={zone}>
              <div className="eyebrow plain" style={{ marginTop: 0 }}>
                {zone}
              </div>
              <div className="list">
                {items.map((m) => (
                  <button key={m.id} type="button" className={`list-row ${m.id === selected ? 'rp-selected' : ''}`} onClick={() => onPick(m.id)} aria-pressed={m.id === selected}>
                    <span className="rp-thumb sm" aria-hidden="true">
                      <span className="num caption">#{m.code}</span>
                    </span>
                    <span className="grow">{m.label}</span>
                    <MachineState m={m} />
                  </button>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </Sheet>
  );
}
