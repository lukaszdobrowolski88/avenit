import React from 'react';
import StatusCell from './cells/StatusCell';
import PeopleCell from './cells/PeopleCell';
import TagsCell from './cells/TagsCell';
import {
  TextCell, NumberCell, DateCell, TimelineCell, CheckboxCell,
  LinkCell, RatingCell, FilesCell, LongTextCell, ProgressCell, FormulaCell,
} from './cells/BasicCells';
import ItemLinkCell from './cells/ItemLinkCell';
import MirrorCell from './cells/MirrorCell';
import { EmailCell, PhoneCell, LocationCell, VoteCell, TimeTrackingCell, MetaCell } from './cells/ExtraCells';
import { useBoardCan } from '../lib/boardContext';

// Dyspozytor komórki — dobiera edytor do typu kolumny. Uprawnienia z kontekstu tablicy: bez prawa
// edycji zadań komórka jest tylko do odczytu, a edycja etykiet/opcji (struktura kolumny) wymaga
// prawa do zmiany kolumn — zamiast pokazywać kontrolki kończące się błędem 403.
export default function BoardCell({ column, value, onChange, onUpdateColumn: onUpdateColumnProp, people, readOnly: readOnlyProp, item, columns, me }) {
  const can = useBoardCan();
  const readOnly = !!readOnlyProp || (can ? !can.editItems : false);
  const onUpdateColumn = can && !can.editColumns ? undefined : onUpdateColumnProp;
  // `column` w każdej komórce — nazwa kolumny jest etykietą pola dla czytnika ekranu.
  const common = { column, value, onChange, readOnly };
  switch (column.type) {
    case 'email': return <EmailCell {...common} />;
    case 'phone': return <PhoneCell {...common} />;
    case 'location': return <LocationCell {...common} />;
    case 'vote': return <VoteCell value={value} onChange={onChange} me={me} readOnly={readOnly} />;
    case 'time_tracking': return <TimeTrackingCell {...common} />;
    case 'item_id': case 'created_log': case 'last_updated': return <MetaCell column={column} item={item} people={people} />;
    case 'progress':
      return <ProgressCell {...common} />;
    case 'formula':
      return <FormulaCell column={column} item={item} columns={columns} />;
    case 'connect_board':
      return <ItemLinkCell column={column} value={value} onChange={onChange} currentItemId={item?.id} mode="connect" readOnly={readOnly} />;
    case 'dependency':
      return <ItemLinkCell column={column} value={value} onChange={onChange} currentItemId={item?.id} mode="dependency" readOnly={readOnly} />;
    case 'mirror':
      return <MirrorCell column={column} item={item} columns={columns} />;
    case 'status':
    case 'priority':
      return <StatusCell column={column} value={value} onChange={onChange} onUpdateColumn={onUpdateColumn} readOnly={readOnly} />;
    case 'people':
      return <PeopleCell value={value} people={people} onChange={onChange} readOnly={readOnly} />;
    case 'dropdown':
      return <TagsCell column={column} value={value} onChange={onChange} onUpdateColumn={onUpdateColumn} readOnly={readOnly} />;
    case 'number':
      return <NumberCell {...common} />;
    case 'date':
      return <DateCell {...common} />;
    case 'timeline':
      return <TimelineCell {...common} />;
    case 'checkbox':
      return <CheckboxCell {...common} />;
    case 'link':
      return <LinkCell {...common} />;
    case 'rating':
      return <RatingCell {...common} />;
    case 'files':
      return <FilesCell {...common} />;
    case 'long_text':
      return <LongTextCell {...common} />;
    case 'text':
    default:
      return <TextCell {...common} />;
  }
}
