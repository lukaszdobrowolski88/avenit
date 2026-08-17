// Czysta logika rozwiązania drag&drop tabeli (kto/gdzie/na jaką pozycję) —
// wydzielona z komponentu, by była TESTOWALNA bez przeglądarki/@dnd-kit.
// Zwraca akcję: null | {type:'reorder', groupId, orderedIds} | {type:'move', itemId, toGroup, toIndex}

function arrayMoveIds(arr, from, to) {
  const a = [...arr];
  const [x] = a.splice(from, 1);
  a.splice(to, 0, x);
  return a;
}

export function resolveDragEnd({ activeId, overId, items, groupIds, visibleItems, sortActive = false }) {
  if (!overId) return null;
  const activeItem = items.find((it) => it.id === activeId);
  if (!activeItem) return null;

  const overIsGroup = groupIds.includes(overId);       // upuszczenie na (pustą) grupę
  const overItem = items.find((it) => it.id === overId); // upuszczenie na element
  const toGroup = overIsGroup ? overId : overItem?.group_id;
  if (!toGroup) return null;

  const targetVisible = visibleItems.filter((it) => it.group_id === toGroup && !it.parent_item_id);

  if (activeItem.group_id === toGroup) {
    // Reorder w obrębie grupy — bez sensu przy aktywnym sortowaniu.
    if (sortActive || activeId === overId) return null;
    const ids = targetVisible.map((it) => it.id);
    const from = ids.indexOf(activeId), to = ids.indexOf(overId);
    if (from < 0 || to < 0) return null;
    return { type: 'reorder', groupId: toGroup, orderedIds: arrayMoveIds(ids, from, to) };
  }

  // Przeniesienie do innej grupy — na pozycję nad którą upuszczono (albo koniec, gdy pusta grupa).
  const toIndex = overIsGroup ? targetVisible.length : Math.max(0, targetVisible.findIndex((it) => it.id === overId));
  return { type: 'move', itemId: activeId, toGroup, toIndex };
}
