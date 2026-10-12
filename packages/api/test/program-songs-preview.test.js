import { test } from 'node:test';
import assert from 'node:assert/strict';
import { songsFromSchedule } from '../src/fn/program-songs-preview.js';

test('pieśni z planu programu: punkty „song”, wiele pieśni w punkcie, tonacje', () => {
  const schedule = [
    { id: 'p1', type: 'header', title: 'Powitanie' },
    { id: 'p2', type: 'song', title: 'Holy, Holy, Holy', songId: 2, songKey: 'D', selectedSongs: [{ songId: 2, key: 'D' }] },
    { id: 'p3', type: 'song', title: 'Uwielbienie', selectedSongs: [{ songId: 1, key: 'G' }, { songId: 6, key: 'A' }] },
    { id: 'p4', type: 'song', title: 'Pieśń bez bazy', songId: null },
    { id: 'p5', type: 'song' },
  ];
  assert.deepEqual(songsFromSchedule(schedule), [
    { songId: 2, key: 'D', title: 'Holy, Holy, Holy', note: null },
    { songId: 1, key: 'G', title: null, note: null },
    { songId: 6, key: 'A', title: null, note: null },
    { songId: null, key: null, title: 'Pieśń bez bazy', note: null },
  ]);
  assert.deepEqual(songsFromSchedule(null), []);
  assert.deepEqual(songsFromSchedule('x'), []);
});
