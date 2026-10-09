// Jedna reguła linków do zadań (packages/shared/src/lib/taskLinks.js) — serwer, web i mobilka.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taskItemLink, taskBoardModuleKey, parseTaskLink } from '@avenit/shared/src/lib/taskLinks.js';

test('linki: zadania służby → strona modułu, Kalendarz → /wydarzenia, reszta → Projekty', () => {
  assert.equal(taskItemLink({ id: 'b', module_key: 'media', source_kind: 'media_tasks' }, 'i'), '/media?item=i');
  assert.equal(taskItemLink({ id: 'b', module_key: null, source_kind: 'home_group_tasks' }, 'i'), '/home-groups?item=i');
  assert.equal(taskItemLink({ id: 'b', module_key: 'calendar', source_kind: 'tasks' }, 'i'), '/wydarzenia?item=i');
  assert.equal(taskItemLink({ id: 'b', module_key: 'mc', source_kind: 'custom_mc_tasks' }, 'i', { mc: '/mc' }), '/mc?item=i');
  // tablica z zakładki „Tablica” modułu i zwykła tablica Projektów
  assert.equal(taskItemLink({ id: 'b', module_key: 'media', source_kind: null }, 'i'), '/projekty?board=b&item=i');
  assert.equal(taskItemLink({ id: 'b' }, 'i'), '/projekty?board=b&item=i');
  assert.equal(taskBoardModuleKey({ source_kind: 'mlodziezowka_tasks' }), 'mlodziezowka');
});

test('parseTaskLink: odwrotność linku dla klientów', () => {
  assert.deepEqual(parseTaskLink('/media?item=7'), { kind: 'module', moduleKey: 'media', itemId: '7' });
  assert.deepEqual(parseTaskLink('/wydarzenia?item=7'), { kind: 'module', moduleKey: 'calendar', itemId: '7' });
  assert.deepEqual(parseTaskLink('/projekty?board=3&item=7'), { kind: 'board', boardId: '3', itemId: '7' });
  assert.deepEqual(parseTaskLink('/module/mc?item=7'), { kind: 'module', moduleKey: 'mc', itemId: '7' });
  assert.equal(parseTaskLink('/media'), null);
});
