// Page de contrôle visuel du kit de composants (développement seulement : /dev/kit). Absente du build de production.
import { useState } from 'react';
import {
  Button, IconButton, Field, Input, PasswordInput, PhoneInput, ToggleRow, Segmented, ChipGroup, OptionCard, Ring, Donut, Gauge, Bars,
  MacroBar, Segments, StatusPill, Kpi, ListRow, Eyebrow, Avatar, Banner, Skeleton, Empty, Logo, Mascot, QRCode, Sheet, useToast, Num,
} from '../components';
import LangSwitch from '../components/LangSwitch';
import { useTheme } from '../lib/theme';

export default function DevKit() {
  const [chips, setChips] = useState(['4j']);
  const [seg, setSeg] = useState(60);
  const [on, setOn] = useState(true);
  const [goal, setGoal] = useState('PERTE_POIDS');
  const [phone, setPhone] = useState('22 345 678');
  const [sheet, setSheet] = useState(false);
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const hours = [2, 3, 5, 6, 8, 12, 9, 7, 6, 4, 5, 7, 11, 15, 18, 20, 13, 6];
  return (
    <div className="app-frame">
      <div className="page">
        <div className="row between">
          <Logo wordmark sub="Machine occupée ? Kammel." />
          <LangSwitch />
        </div>
        <Segmented options={['dark', 'light', 'system'].map((v) => ({ value: v, label: v }))} value={theme} onChange={setTheme} />
        <Eyebrow>Boutons</Eyebrow>
        <Button variant="primary" block icon="play">Commencer</Button>
        <div className="grid-2">
          <Button>Rapide 30 min</Button>
          <Button icon="refresh-cw">Régénérer</Button>
        </div>
        <Button block disabled>Continuer · désactivé</Button>
        <div className="grid-3">
          <Button variant="danger" icon="wrench" size="sm">En panne</Button>
          <Button size="sm" icon="circle-off">Absente</Button>
          <Button size="sm" variant="ghost" icon="users">Occupée</Button>
        </div>
        <div className="row">
          <IconButton icon="bell" label="Notifications" dot />
          <IconButton icon="x" label="Fermer" round />
          <Button variant="text">Modifier</Button>
        </div>
        <Eyebrow>Puces, champs, statuts</Eyebrow>
        <ChipGroup multiple value={chips} onChange={setChips} options={[{ value: '4j', label: '4 jours/sem' }, { value: '60', label: '60 min' }, { value: 'eq', label: 'Équilibré' }]} />
        <Field label="Numéro de téléphone">
          <PhoneInput value={phone} onChange={setPhone} />
        </Field>
        <Field label="Mot de passe">
          <PasswordInput defaultValue="secret12" />
        </Field>
        <Field label="Taille" error="Taille entre 100 et 250 cm">
          <Input defaultValue="275" suffix="cm" invalid />
        </Field>
        <div className="row wrap">
          <StatusPill tone="ok" led>Calme</StatusPill>
          <StatusPill tone="warn" icon="users">Fréquentée</StatusPill>
          <StatusPill tone="danger" icon="triangle-alert">Très chargée</StatusPill>
        </div>
        <Segmented options={[30, 45, 60, 90].map((v) => ({ value: v, label: `${v} min` }))} value={seg} onChange={setSeg} />
        <OptionCard icon="trending-down" title="Perdre du poids" selected={goal === 'PERTE_POIDS'} onSelect={() => setGoal('PERTE_POIDS')} />
        <OptionCard icon="dumbbell" title="Prendre du muscle" selected={goal === 'PRISE_MASSE'} onSelect={() => setGoal('PRISE_MASSE')} />
        <Mascot text="Behi ! On s'y met ensemble." />
        <Eyebrow>Anneaux, barres, affluence</Eyebrow>
        <div className="row">
          <Ring value={407} max={1647} size={130} stroke={10}>
            <div className="h2 num">1 240</div>
            <div className="caption muted">kcal restantes</div>
          </Ring>
          <Ring value={1.4} max={3.4} size={110} color="var(--hydro)">
            <div className="h3 num">1,4</div>
            <div className="caption muted num">/ 3,4 L</div>
          </Ring>
        </div>
        <Donut parts={[{ value: 124 * 4, color: 'var(--protein)' }, { value: 185 * 4, color: 'var(--carbs)' }, { value: 46 * 9, color: 'var(--fat)' }]} size={150}>
          <div className="h2 num">1 647</div>
          <div className="caption muted">kcal / jour</div>
        </Donut>
        <Gauge value={42} max={120}>
          <div className="big-num num">42</div>
        </Gauge>
        <div className="card">
          <Bars data={hours.map((v, i) => ({ value: v, tone: i === 5 ? 'now' : i < 5 ? 'past' : i === 8 || i === 9 ? 'calm' : 'forecast', marker: i === 5 ? 'Maintenant' : null }))} axis={['6h', '9h', '12h', '15h', '18h', '21h', '23h']} />
        </div>
        <div className="card stack">
          <MacroBar label="Protéines" value={20} target={124} color="var(--protein)" />
          <MacroBar label="Glucides" value={52} target={185} color="var(--carbs)" />
          <MacroBar label="Lipides" value={13} target={46} color="var(--fat)" />
        </div>
        <Segments values={[1, 0.3, 0, 0]} label="progress" />
        <Eyebrow>Navigation et retours</Eyebrow>
        <Banner icon="wifi-off">Hors ligne. Tes séries sont enregistrées.</Banner>
        <Banner tone="warn" icon="triangle-alert">Salle pleine — alternatives prêtes</Banner>
        <div className="kpi-grid">
          <Kpi label="Présents maintenant" value={42} sub="Calme pour un mardi" subTone="ok" />
          <Kpi label="Encaissé aujourd'hui" value={<Num>330</Num>} unit="TND" sub="2 paiements" />
        </div>
        <div className="list">
          <ListRow title="Objectif" value="Perdre du poids" onClick={() => {}} />
          <ListRow icon="scan-line" title="Carte d'accès" sub="À montrer à l'entrée" onClick={() => {}} />
          <ToggleRow icon="bell" title="Rappels toutes les 2 h" subtitle="Silence 23:00 – 07:00" checked={on} onChange={setOn} />
        </div>
        <div className="row">
          <Avatar name="Amine Ben Salah" />
          <QRCode value="K1.12.123456.abcdefghijklmnop" size={140} label="QR" />
        </div>
        <Skeleton card h={90} />
        <Empty icon="glass-water" title="Premier verre ?">Commence ta journée avec un verre d'eau.</Empty>
        <div className="grid-2">
          <Button onClick={() => toast({ text: '+250 ml ajoutés', icon: 'glass-water', tone: 'dark', action: { label: 'Annuler', onClick: () => {} } })}>Toast</Button>
          <Button onClick={() => setSheet(true)}>Sheet</Button>
        </div>
      </div>
      <Sheet open={sheet} onClose={() => setSheet(false)} title="Ajouter un repas">
        <div className="action-list">
          <button type="button">Scanner une photo</button>
          <button type="button">Rechercher</button>
          <button type="button">Créer un aliment</button>
        </div>
      </Sheet>
    </div>
  );
}
