<?php
/**
 * Plugin Name: Church Manager Forms
 * Plugin URI: https://github.com/your-repo/church-manager
 * Description: Osadzaj formularze z Church Manager na swojej stronie WordPress za pomocą prostego shortcode.
 * Version: 1.0.0
 * Author: Church Manager Team
 * Author URI: https://churchmanager.app
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: church-manager-forms
 * Domain Path: /languages
 */

// Zabezpieczenie przed bezpośrednim dostępem
if (!defined('ABSPATH')) {
    exit;
}

// Definicja stałych
define('CMF_VERSION', '1.0.0');
define('CMF_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('CMF_PLUGIN_URL', plugin_dir_url(__FILE__));

/**
 * Główna klasa pluginu
 */
class Church_Manager_Forms {

    /**
     * Instancja singleton
     */
    private static $instance = null;

    /**
     * Domyślny URL aplikacji Church Manager
     */
    private $default_app_url = '';

    /**
     * Pobierz instancję singleton
     */
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Konstruktor
     */
    private function __construct() {
        $this->init_hooks();
    }

    /**
     * Inicjalizacja hooków
     */
    private function init_hooks() {
        // Rejestracja shortcode
        add_shortcode('church_form', array($this, 'render_form_shortcode'));

        // Menu administracyjne
        add_action('admin_menu', array($this, 'add_admin_menu'));

        // Rejestracja ustawień
        add_action('admin_init', array($this, 'register_settings'));

        // Blok Gutenberg
        add_action('init', array($this, 'register_gutenberg_block'));

        // Skrypty i style dla admina
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_scripts'));

        // Widget dla Elementora (jeśli aktywny)
        add_action('elementor/widgets/widgets_registered', array($this, 'register_elementor_widget'));
    }

    /**
     * Renderowanie shortcode formularza
     *
     * Użycie: [church_form id="uuid" width="100%" height="600"]
     */
    public function render_form_shortcode($atts) {
        $atts = shortcode_atts(array(
            'id'     => '',
            'width'  => '100%',
            'height' => '600',
            'class'  => '',
        ), $atts, 'church_form');

        // Walidacja ID
        if (empty($atts['id'])) {
            if (current_user_can('edit_posts')) {
                return '<div class="cmf-error" style="padding: 20px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; color: #856404;">
                    <strong>Church Manager Forms:</strong> Brak ID formularza. Użyj: [church_form id="twoje-id"]
                </div>';
            }
            return '';
        }

        // Pobierz URL aplikacji
        $app_url = $this->get_app_url();
        if (empty($app_url)) {
            if (current_user_can('edit_posts')) {
                return '<div class="cmf-error" style="padding: 20px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; color: #856404;">
                    <strong>Church Manager Forms:</strong> Skonfiguruj URL aplikacji w <a href="' . admin_url('options-general.php?page=church-manager-forms') . '">ustawieniach</a>.
                </div>';
            }
            return '';
        }

        // Sanityzacja atrybutów
        $form_id = sanitize_text_field($atts['id']);
        $width = sanitize_text_field($atts['width']);
        $height = absint($atts['height']);
        $custom_class = sanitize_html_class($atts['class']);

        // Generowanie unikalnego ID dla iframe
        $iframe_id = 'cmf-' . wp_generate_uuid4();

        // URL formularza
        $form_url = trailingslashit($app_url) . 'form/' . $form_id;

        // Budowanie HTML
        $html = sprintf(
            '<div class="church-manager-form-wrapper %s" style="max-width: 100%%;">
                <iframe
                    id="%s"
                    src="%s"
                    width="%s"
                    height="%dpx"
                    frameborder="0"
                    style="border: none; max-width: 100%%; display: block;"
                    title="Formularz Church Manager"
                    allow="clipboard-write"
                    loading="lazy"
                ></iframe>
            </div>',
            esc_attr($custom_class),
            esc_attr($iframe_id),
            esc_url($form_url),
            esc_attr($width),
            $height
        );

        // Dodaj skrypt do auto-resize (opcjonalnie)
        $html .= $this->get_resize_script($iframe_id, $form_id);

        return $html;
    }

    /**
     * Skrypt do automatycznego dostosowania wysokości iframe
     */
    private function get_resize_script($iframe_id, $form_id) {
        return sprintf(
            '<script>
            (function() {
                window.addEventListener("message", function(e) {
                    if (e.data && e.data.type === "church-form-resize" && e.data.formId === "%s") {
                        var iframe = document.getElementById("%s");
                        if (iframe) {
                            iframe.style.height = e.data.height + "px";
                        }
                    }
                });
            })();
            </script>',
            esc_js($form_id),
            esc_js($iframe_id)
        );
    }

    /**
     * Pobierz URL aplikacji z ustawień
     */
    private function get_app_url() {
        $url = get_option('cmf_app_url', $this->default_app_url);
        return rtrim($url, '/');
    }

    /**
     * Dodaj menu administracyjne
     */
    public function add_admin_menu() {
        add_options_page(
            __('Church Manager Forms', 'church-manager-forms'),
            __('Church Manager Forms', 'church-manager-forms'),
            'manage_options',
            'church-manager-forms',
            array($this, 'render_settings_page')
        );
    }

    /**
     * Rejestracja ustawień
     */
    public function register_settings() {
        register_setting('cmf_settings', 'cmf_app_url', array(
            'type' => 'string',
            'sanitize_callback' => 'esc_url_raw',
            'default' => '',
        ));

        add_settings_section(
            'cmf_main_section',
            __('Ustawienia główne', 'church-manager-forms'),
            array($this, 'render_section_info'),
            'church-manager-forms'
        );

        add_settings_field(
            'cmf_app_url',
            __('URL aplikacji Church Manager', 'church-manager-forms'),
            array($this, 'render_app_url_field'),
            'church-manager-forms',
            'cmf_main_section'
        );
    }

    /**
     * Informacje sekcji
     */
    public function render_section_info() {
        echo '<p>' . esc_html__('Wprowadź adres URL Twojej instalacji Church Manager.', 'church-manager-forms') . '</p>';
    }

    /**
     * Pole URL aplikacji
     */
    public function render_app_url_field() {
        $value = get_option('cmf_app_url', '');
        printf(
            '<input type="url" id="cmf_app_url" name="cmf_app_url" value="%s" class="regular-text" placeholder="https://twoja-aplikacja.com" />
            <p class="description">%s</p>',
            esc_attr($value),
            esc_html__('Przykład: https://churchmanager.twojadomena.pl', 'church-manager-forms')
        );
    }

    /**
     * Strona ustawień
     */
    public function render_settings_page() {
        if (!current_user_can('manage_options')) {
            return;
        }
        ?>
        <div class="wrap">
            <h1><?php echo esc_html(get_admin_page_title()); ?></h1>

            <form action="options.php" method="post">
                <?php
                settings_fields('cmf_settings');
                do_settings_sections('church-manager-forms');
                submit_button(__('Zapisz ustawienia', 'church-manager-forms'));
                ?>
            </form>

            <hr />

            <h2><?php esc_html_e('Jak używać', 'church-manager-forms'); ?></h2>

            <div class="cmf-usage-guide" style="background: #fff; padding: 20px; border: 1px solid #ccd0d4; border-radius: 4px; margin-top: 15px;">
                <h3><?php esc_html_e('Shortcode', 'church-manager-forms'); ?></h3>
                <p><?php esc_html_e('Użyj poniższego shortcode w dowolnym poście lub stronie:', 'church-manager-forms'); ?></p>
                <code style="display: block; padding: 10px; background: #f1f1f1; margin: 10px 0;">[church_form id="TWOJE_ID_FORMULARZA"]</code>

                <h4><?php esc_html_e('Opcjonalne parametry:', 'church-manager-forms'); ?></h4>
                <ul style="list-style: disc; margin-left: 20px;">
                    <li><code>width</code> - szerokość iframe (domyślnie: 100%)</li>
                    <li><code>height</code> - wysokość iframe w pikselach (domyślnie: 600)</li>
                    <li><code>class</code> - dodatkowa klasa CSS</li>
                </ul>

                <h4><?php esc_html_e('Przykłady:', 'church-manager-forms'); ?></h4>
                <code style="display: block; padding: 10px; background: #f1f1f1; margin: 5px 0;">[church_form id="abc123" width="100%" height="800"]</code>
                <code style="display: block; padding: 10px; background: #f1f1f1; margin: 5px 0;">[church_form id="abc123" class="my-custom-form"]</code>

                <hr style="margin: 20px 0;" />

                <h3><?php esc_html_e('Blok Gutenberg', 'church-manager-forms'); ?></h3>
                <p><?php esc_html_e('W edytorze bloków wyszukaj "Church Manager Form" i dodaj blok do swojej strony.', 'church-manager-forms'); ?></p>
            </div>
        </div>
        <?php
    }

    /**
     * Rejestracja bloku Gutenberg
     */
    public function register_gutenberg_block() {
        if (!function_exists('register_block_type')) {
            return;
        }

        wp_register_script(
            'cmf-gutenberg-block',
            CMF_PLUGIN_URL . 'assets/js/gutenberg-block.js',
            array('wp-blocks', 'wp-element', 'wp-editor', 'wp-components', 'wp-i18n'),
            CMF_VERSION
        );

        wp_localize_script('cmf-gutenberg-block', 'cmfData', array(
            'appUrl' => $this->get_app_url(),
        ));

        register_block_type('church-manager/form', array(
            'editor_script' => 'cmf-gutenberg-block',
            'render_callback' => array($this, 'render_gutenberg_block'),
            'attributes' => array(
                'formId' => array(
                    'type' => 'string',
                    'default' => '',
                ),
                'width' => array(
                    'type' => 'string',
                    'default' => '100%',
                ),
                'height' => array(
                    'type' => 'number',
                    'default' => 600,
                ),
            ),
        ));
    }

    /**
     * Renderowanie bloku Gutenberg
     */
    public function render_gutenberg_block($attributes) {
        return $this->render_form_shortcode(array(
            'id' => $attributes['formId'],
            'width' => $attributes['width'],
            'height' => $attributes['height'],
        ));
    }

    /**
     * Skrypty dla admina
     */
    public function enqueue_admin_scripts($hook) {
        if ('settings_page_church-manager-forms' !== $hook) {
            return;
        }

        wp_enqueue_style(
            'cmf-admin-styles',
            CMF_PLUGIN_URL . 'assets/css/admin.css',
            array(),
            CMF_VERSION
        );
    }

    /**
     * Rejestracja widgetu Elementor
     */
    public function register_elementor_widget() {
        if (!class_exists('\Elementor\Widget_Base')) {
            return;
        }

        require_once CMF_PLUGIN_DIR . 'includes/class-elementor-widget.php';

        \Elementor\Plugin::instance()->widgets_manager->register_widget_type(
            new CMF_Elementor_Widget()
        );
    }
}

// Inicjalizacja pluginu
function cmf_init() {
    Church_Manager_Forms::get_instance();
}
add_action('plugins_loaded', 'cmf_init');

// Aktywacja pluginu
function cmf_activate() {
    // Ustawienia domyślne
    add_option('cmf_app_url', '');

    // Flush rewrite rules
    flush_rewrite_rules();
}
register_activation_hook(__FILE__, 'cmf_activate');

// Deaktywacja pluginu
function cmf_deactivate() {
    flush_rewrite_rules();
}
register_deactivation_hook(__FILE__, 'cmf_deactivate');
