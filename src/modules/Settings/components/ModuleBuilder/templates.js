// Gotowe szablony układów do wstawienia jednym kliknięciem. Każdy build() zwraca
// świeże elementy (nowe id), więc można wstawiać wielokrotnie.
import { createElement, createWidgetElement, createCollectionField } from './builderElements';

function el(type, props = {}, children = null) {
  const e = createElement(type);
  e.props = { ...e.props, ...props };
  if (children) e.children = children;
  return e;
}

export const TEMPLATES = [
  {
    key: 'welcome',
    label: 'Strona powitalna',
    build: () => [
      el('section', {}, [
        el('heading', { text: 'Witaj w naszym module', level: 1, align: 'center' }),
        el('text', { html: '<p>Krótki opis modułu. Możesz zmienić tę treść w kreatorze.</p>' }),
        el('button', { label: 'Dowiedz się więcej', variant: 'primary', align: 'center' }),
      ]),
    ],
  },
  {
    key: 'team',
    label: 'Strona zespołu',
    build: () => [
      el('heading', { text: 'Nasz zespół', level: 2 }),
      el('columns', { columns: 2, gap: 'md' }, [
        el('card', { title: 'Członkowie' }, [createWidgetElement('members')]),
        el('card', { title: 'Wydarzenia' }, [createWidgetElement('events')]),
      ]),
    ],
  },
  {
    key: 'info',
    label: 'Informacje + ogłoszenia',
    build: () => [
      el('heading', { text: 'Ważne informacje', level: 2 }),
      el('alert', { text: 'Pamiętaj o najbliższym spotkaniu!', variant: 'info' }),
      el('list', { items: ['Punkt pierwszy', 'Punkt drugi', 'Punkt trzeci'], style: 'disc' }),
      el('divider', {}),
      createWidgetElement('wall'),
    ],
  },
  {
    key: 'signup',
    label: 'Zapisy (kolekcja danych)',
    build: () => {
      const collection = createElement('collection');
      collection.props = {
        ...collection.props,
        title: 'Lista zapisów',
        view: 'table',
        fields: [
          { ...createCollectionField('text'), label: 'Imię i nazwisko', required: true },
          { ...createCollectionField('email'), label: 'E-mail' },
          { ...createCollectionField('number'), label: 'Liczba osób' },
        ],
        allowCreate: true, allowEdit: true, allowDelete: true,
      };
      return [
        el('heading', { text: 'Zapisy', level: 2 }),
        el('text', { html: '<p>Wypełnij formularz, aby się zapisać.</p>' }),
        collection,
      ];
    },
  },
];
