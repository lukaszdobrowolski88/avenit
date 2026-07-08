(function(blocks, element, blockEditor, components, i18n) {
    var el = element.createElement;
    var TextControl = components.TextControl;
    var RangeControl = components.RangeControl;
    var PanelBody = components.PanelBody;
    var InspectorControls = blockEditor.InspectorControls;
    var useBlockProps = blockEditor.useBlockProps;

    // Rejestracja bloku
    blocks.registerBlockType('avenit/form', {
        title: i18n.__('Avenit Form', 'avenit-forms'),
        description: i18n.__('Osadź formularz z Avenit', 'avenit-forms'),
        icon: 'feedback',
        category: 'embed',
        keywords: [
            i18n.__('formularz', 'avenit-forms'),
            i18n.__('church', 'avenit-forms'),
            i18n.__('ankieta', 'avenit-forms')
        ],
        attributes: {
            formId: {
                type: 'string',
                default: ''
            },
            width: {
                type: 'string',
                default: '100%'
            },
            height: {
                type: 'number',
                default: 600
            }
        },

        edit: function(props) {
            var attributes = props.attributes;
            var setAttributes = props.setAttributes;
            var blockProps = useBlockProps();

            // Podgląd formularza
            var preview = null;
            if (attributes.formId && window.cmfData && window.cmfData.appUrl) {
                var formUrl = window.cmfData.appUrl + '/form/' + attributes.formId;
                preview = el('div', {
                    className: 'cmf-block-preview',
                    style: {
                        position: 'relative',
                        width: '100%',
                        backgroundColor: '#f0f0f0',
                        borderRadius: '8px',
                        overflow: 'hidden'
                    }
                },
                    el('iframe', {
                        src: formUrl,
                        style: {
                            width: attributes.width,
                            height: attributes.height + 'px',
                            border: 'none',
                            maxWidth: '100%'
                        },
                        title: 'Podgląd formularza'
                    })
                );
            } else {
                preview = el('div', {
                    className: 'cmf-block-placeholder',
                    style: {
                        padding: '40px 20px',
                        backgroundColor: '#f9f9f9',
                        border: '2px dashed #ddd',
                        borderRadius: '8px',
                        textAlign: 'center'
                    }
                },
                    el('span', {
                        className: 'dashicons dashicons-feedback',
                        style: {
                            fontSize: '48px',
                            width: '48px',
                            height: '48px',
                            color: '#ec4899',
                            marginBottom: '15px',
                            display: 'block'
                        }
                    }),
                    el('p', {
                        style: {
                            fontSize: '16px',
                            fontWeight: '600',
                            color: '#333',
                            margin: '0 0 10px'
                        }
                    }, i18n.__('Avenit Form', 'avenit-forms')),
                    el('p', {
                        style: {
                            fontSize: '14px',
                            color: '#666',
                            margin: '0'
                        }
                    }, attributes.formId
                        ? i18n.__('Skonfiguruj URL aplikacji w ustawieniach pluginu', 'avenit-forms')
                        : i18n.__('Wprowadź ID formularza w panelu po prawej stronie', 'avenit-forms')
                    )
                );
            }

            return el('div', blockProps,
                el(InspectorControls, {},
                    el(PanelBody, {
                        title: i18n.__('Ustawienia formularza', 'avenit-forms'),
                        initialOpen: true
                    },
                        el(TextControl, {
                            label: i18n.__('ID formularza', 'avenit-forms'),
                            help: i18n.__('Znajdziesz je w Avenit przy osadzaniu formularza', 'avenit-forms'),
                            value: attributes.formId,
                            onChange: function(value) {
                                setAttributes({ formId: value });
                            }
                        }),
                        el(TextControl, {
                            label: i18n.__('Szerokość', 'avenit-forms'),
                            help: i18n.__('np. 100%, 600px', 'avenit-forms'),
                            value: attributes.width,
                            onChange: function(value) {
                                setAttributes({ width: value });
                            }
                        }),
                        el(RangeControl, {
                            label: i18n.__('Wysokość (px)', 'avenit-forms'),
                            value: attributes.height,
                            onChange: function(value) {
                                setAttributes({ height: value });
                            },
                            min: 200,
                            max: 1500,
                            step: 50
                        })
                    )
                ),
                preview
            );
        },

        save: function() {
            // Renderowanie po stronie serwera
            return null;
        }
    });
})(
    window.wp.blocks,
    window.wp.element,
    window.wp.blockEditor,
    window.wp.components,
    window.wp.i18n
);
