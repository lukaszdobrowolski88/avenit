<?php
/**
 * Elementor Widget dla Church Manager Forms
 */

if (!defined('ABSPATH')) {
    exit;
}

class CMF_Elementor_Widget extends \Elementor\Widget_Base {

    /**
     * Nazwa widgetu
     */
    public function get_name() {
        return 'church_manager_form';
    }

    /**
     * Tytuł widgetu
     */
    public function get_title() {
        return __('Church Manager Form', 'church-manager-forms');
    }

    /**
     * Ikona widgetu
     */
    public function get_icon() {
        return 'eicon-form-horizontal';
    }

    /**
     * Kategorie widgetu
     */
    public function get_categories() {
        return ['general'];
    }

    /**
     * Słowa kluczowe
     */
    public function get_keywords() {
        return ['form', 'formularz', 'church', 'ankieta', 'survey'];
    }

    /**
     * Rejestracja kontrolek
     */
    protected function register_controls() {

        // Sekcja: Formularz
        $this->start_controls_section(
            'section_form',
            [
                'label' => __('Formularz', 'church-manager-forms'),
                'tab' => \Elementor\Controls_Manager::TAB_CONTENT,
            ]
        );

        $this->add_control(
            'form_id',
            [
                'label' => __('ID formularza', 'church-manager-forms'),
                'type' => \Elementor\Controls_Manager::TEXT,
                'placeholder' => __('Wprowadź ID formularza', 'church-manager-forms'),
                'description' => __('Znajdziesz je w Church Manager przy osadzaniu formularza', 'church-manager-forms'),
            ]
        );

        $this->end_controls_section();

        // Sekcja: Rozmiar
        $this->start_controls_section(
            'section_size',
            [
                'label' => __('Rozmiar', 'church-manager-forms'),
                'tab' => \Elementor\Controls_Manager::TAB_CONTENT,
            ]
        );

        $this->add_responsive_control(
            'form_width',
            [
                'label' => __('Szerokość', 'church-manager-forms'),
                'type' => \Elementor\Controls_Manager::TEXT,
                'default' => '100%',
                'placeholder' => '100%',
                'selectors' => [
                    '{{WRAPPER}} .church-manager-form-wrapper iframe' => 'width: {{VALUE}};',
                ],
            ]
        );

        $this->add_responsive_control(
            'form_height',
            [
                'label' => __('Wysokość (px)', 'church-manager-forms'),
                'type' => \Elementor\Controls_Manager::SLIDER,
                'size_units' => ['px'],
                'range' => [
                    'px' => [
                        'min' => 200,
                        'max' => 1500,
                        'step' => 10,
                    ],
                ],
                'default' => [
                    'unit' => 'px',
                    'size' => 600,
                ],
                'selectors' => [
                    '{{WRAPPER}} .church-manager-form-wrapper iframe' => 'height: {{SIZE}}{{UNIT}};',
                ],
            ]
        );

        $this->end_controls_section();

        // Sekcja: Style
        $this->start_controls_section(
            'section_style',
            [
                'label' => __('Style', 'church-manager-forms'),
                'tab' => \Elementor\Controls_Manager::TAB_STYLE,
            ]
        );

        $this->add_control(
            'border_radius',
            [
                'label' => __('Zaokrąglenie narożników', 'church-manager-forms'),
                'type' => \Elementor\Controls_Manager::DIMENSIONS,
                'size_units' => ['px', '%'],
                'selectors' => [
                    '{{WRAPPER}} .church-manager-form-wrapper iframe' => 'border-radius: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};',
                ],
            ]
        );

        $this->add_group_control(
            \Elementor\Group_Control_Box_Shadow::get_type(),
            [
                'name' => 'box_shadow',
                'selector' => '{{WRAPPER}} .church-manager-form-wrapper iframe',
            ]
        );

        $this->end_controls_section();
    }

    /**
     * Renderowanie widgetu
     */
    protected function render() {
        $settings = $this->get_settings_for_display();

        if (empty($settings['form_id'])) {
            if (\Elementor\Plugin::$instance->editor->is_edit_mode()) {
                echo '<div class="cmf-elementor-placeholder" style="padding: 40px; background: #f5f5f5; border: 2px dashed #ddd; border-radius: 8px; text-align: center;">
                    <span class="dashicons dashicons-feedback" style="font-size: 48px; color: #ec4899; margin-bottom: 15px; display: block;"></span>
                    <p style="font-weight: 600; margin-bottom: 5px;">' . __('Church Manager Form', 'church-manager-forms') . '</p>
                    <p style="color: #666; margin: 0;">' . __('Wprowadź ID formularza w panelu ustawień', 'church-manager-forms') . '</p>
                </div>';
            }
            return;
        }

        $height = isset($settings['form_height']['size']) ? $settings['form_height']['size'] : 600;

        echo do_shortcode(sprintf(
            '[church_form id="%s" width="%s" height="%d"]',
            esc_attr($settings['form_id']),
            esc_attr($settings['form_width']),
            absint($height)
        ));
    }

    /**
     * Renderowanie zawartości dla edytora (JavaScript)
     */
    protected function content_template() {
        ?>
        <#
        if (!settings.form_id) {
            #>
            <div class="cmf-elementor-placeholder" style="padding: 40px; background: #f5f5f5; border: 2px dashed #ddd; border-radius: 8px; text-align: center;">
                <span class="dashicons dashicons-feedback" style="font-size: 48px; color: #ec4899; margin-bottom: 15px; display: block;"></span>
                <p style="font-weight: 600; margin-bottom: 5px;"><?php esc_html_e('Church Manager Form', 'church-manager-forms'); ?></p>
                <p style="color: #666; margin: 0;"><?php esc_html_e('Wprowadź ID formularza w panelu ustawień', 'church-manager-forms'); ?></p>
            </div>
            <#
        } else {
            var appUrl = '<?php echo esc_js(get_option('cmf_app_url', '')); ?>';
            if (appUrl) {
                var formUrl = appUrl + '/form/' + settings.form_id;
                var height = settings.form_height && settings.form_height.size ? settings.form_height.size : 600;
                #>
                <div class="church-manager-form-wrapper">
                    <iframe
                        src="{{ formUrl }}"
                        width="{{ settings.form_width }}"
                        height="{{ height }}px"
                        frameborder="0"
                        style="border: none; max-width: 100%;"
                        title="Formularz Church Manager"
                    ></iframe>
                </div>
                <#
            } else {
                #>
                <div class="cmf-elementor-placeholder" style="padding: 40px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; text-align: center;">
                    <p style="color: #856404; margin: 0;"><?php esc_html_e('Skonfiguruj URL aplikacji w ustawieniach pluginu', 'church-manager-forms'); ?></p>
                </div>
                <#
            }
        }
        #>
        <?php
    }
}
