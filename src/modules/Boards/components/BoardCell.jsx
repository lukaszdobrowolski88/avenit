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

// Dyspozytor komórki — dobiera edytor do typu kolumny.
export default function BoardCell({ column, value, onChange, onUpdateColumn, people, readOnly, item, columns, me }) {
  const common = { value, onChange, readOnly };
  switch (column.type) {
    case 'email': return <EmailCell {...common} />;
    case 'phone': return <PhoneCell {...common} />;
    case 'location': return <LocationCell {...common} />;
    case 'vote': return <VoteCell value={value} onChange={onChange} me={me} readOnly={readOnly} />;
    case 'time_tracking': return <TimeTrackingCell {...common} />;
    case 'item_id': case 'created_log': case 'last_updated': return <MetaCell column={column} item={item} />;
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
      return <NumberCell column={column} {...common} />;
    case 'date':
      return <DateCell {...common} />;
    case 'timeline':
      return <TimelineCell {...common} />;
    case 'checkbox':
      return <CheckboxCell {...common} />;
    case 'link':
      return <LinkCell {...common} />;
    case 'rating':
      return <RatingCell column={column} {...common} />;
    case 'files':
      return <FilesCell {...common} />;
    case 'long_text':
      return <LongTextCell {...common} />;
    case 'text':
    default:
      return <TextCell {...common} />;
  }
}
