import { describe, it, expect } from 'vitest';
import {
  monthGrid, weekDays, groupByDay, postsByDay, moveToDay, postPermissions, appendBlock, snippet, connectMessage,
  toLocalFields, fromLocalFields, dayKey, filterPosts, filtersActive, EMPTY_FILTERS,
} from './socialUi';

describe('kalendarz', () => {
  it('siatka miesiąca zaczyna się w poniedziałek i obejmuje cały miesiąc', () => {
    const weeks = monthGrid(2026, 9); // październik 2026 (1.10 = czwartek)
    expect(weeks[0][0].getDay()).toBe(1);
    expect(dayKey(weeks[0][0])).toBe('2026-09-28');
    expect(weeks.flat().some((d) => dayKey(d) === '2026-10-31')).toBe(true);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });
  it('tydzień pn–nd wokół daty', () => {
    const days = weekDays(new Date(2026, 9, 25)); // niedziela
    expect(dayKey(days[0])).toBe('2026-10-19');
    expect(dayKey(days[6])).toBe('2026-10-25');
  });
  it('przeniesienie na inny dzień zachowuje godzinę', () => {
    const iso = new Date(2026, 9, 26, 18, 30).toISOString();
    const moved = new Date(moveToDay(iso, new Date(2026, 9, 29)));
    expect([moved.getDate(), moved.getHours(), moved.getMinutes()]).toEqual([29, 18, 30]);
  });
  it('pola daty i godziny ↔ ISO', () => {
    const iso = fromLocalFields('2026-11-02', '9:05');
    expect(toLocalFields(iso)).toEqual({ ymd: '2026-11-02', hm: '09:05' });
    expect(fromLocalFields('2026-11-02', '')).toBeNull();
  });
});

describe('grupowanie', () => {
  const at = (d, h) => new Date(2026, 9, d, h).toISOString();
  const posts = [
    { id: 'a', scheduled_at: at(27, 9) },
    { id: 'b', scheduled_at: at(26, 18) },
    { id: 'c', published_at: at(26, 8), scheduled_at: at(25, 8) },
    { id: 'd' },
  ];
  it('po dniach rosnąco, bez terminu na końcu', () => {
    const g = groupByDay(posts);
    expect(g.map((x) => x.key)).toEqual(['2026-10-26', '2026-10-27', 'none']);
    expect(g[0].posts.map((p) => p.id)).toEqual(['b', 'c']);
    expect(groupByDay(posts, { desc: true })[0].key).toBe('2026-10-27');
  });
  it('dzień w kalendarzu posortowany po godzinie (opublikowany — moment publikacji)', () => {
    const m = postsByDay(posts);
    expect(m.get('2026-10-26').map((p) => p.id)).toEqual(['c', 'b']);
    expect(m.has('2026-10-25')).toBe(false);
  });
});

describe('prawa do akcji', () => {
  const editor = { view: true, create: true };
  const publisher = { view: true, create: true, publish: true };
  it('autor bez publikacji: edycja własnego, wycofanie z akceptacji, bez zatwierdzania', () => {
    const p = { status: 'pending_approval', created_by: 'Ja@k.pl' };
    const perm = postPermissions(p, editor, 'ja@k.pl');
    expect(perm.edit).toBe(true);
    expect(perm.approve).toBe(false);
    expect(perm.unschedule).toBe(true);
    expect(perm.delete).toBe(true);
    expect(postPermissions(p, editor, 'inny@k.pl').edit).toBe(false);
  });
  it('publikujący: zatwierdza, publikuje teraz, ponawia; opublikowanego nie edytuje', () => {
    expect(postPermissions({ status: 'pending_approval', created_by: 'x' }, publisher, 'y').approve).toBe(true);
    expect(postPermissions({ status: 'scheduled', created_by: 'x' }, publisher, 'y').publishNow).toBe(true);
    expect(postPermissions({ status: 'failed', created_by: 'x' }, publisher, 'y').retry).toBe(true);
    expect(postPermissions({ status: 'published', created_by: 'x' }, publisher, 'y').edit).toBe(false);
    expect(postPermissions({ status: 'publishing', created_by: 'y' }, { ...publisher, admin: true }, 'y').delete).toBe(false);
  });
});

describe('tekst', () => {
  it('zestaw hashtagów dopisany akapitem', () => {
    expect(appendBlock('Zapraszamy', '#kosciol #wroclaw')).toBe('Zapraszamy\n\n#kosciol #wroclaw');
    expect(appendBlock('', '#a')).toBe('#a');
    expect(appendBlock('x  \n', '  ')).toBe('x  \n');
  });
  it('skrót', () => {
    expect(snippet('a   b\n c')).toBe('a b c');
    expect(snippet('x'.repeat(200), 10)).toHaveLength(10);
  });
  it('komunikat powrotu z logowania Meta', () => {
    expect(connectMessage(new URLSearchParams('sm_result=connected&sm_added=2'))).toMatchObject({ tone: 'success', n: 2 });
    expect(connectMessage(new URLSearchParams('sm_result=error&sm_reason=no_pages')).text).toMatch(/stron/);
    expect(connectMessage(new URLSearchParams(''))).toBeNull();
  });
});

describe('filtry', () => {
  const posts = [
    { id: 'a', status: 'scheduled', created_by: 'Ja@k.pl', targets: [{ account_id: 'fb' }] },
    { id: 'b', status: 'published', created_by: 'inny@k.pl', targets: [{ account_id: 'ig' }, { account_id: 'fb' }] },
    { id: 'c', status: 'scheduled', created_by: 'inny@k.pl', targets: [{ account_id: 'ig' }] },
  ];
  it('bez filtrów — wszystko', () => {
    expect(filtersActive(EMPTY_FILTERS)).toBe(false);
    expect(filterPosts(posts, EMPTY_FILTERS)).toHaveLength(3);
  });
  it('kanał, status i tylko moje łączą się', () => {
    expect(filterPosts(posts, { accounts: ['fb'] }).map((p) => p.id)).toEqual(['a', 'b']);
    expect(filterPosts(posts, { accounts: ['ig'], status: 'scheduled' }).map((p) => p.id)).toEqual(['c']);
    expect(filterPosts(posts, { mine: true }, 'ja@k.pl').map((p) => p.id)).toEqual(['a']);
  });
});
