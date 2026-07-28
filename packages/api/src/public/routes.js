// Publiczne (bez logowania) strony kreatora modułów. Tenant rozpoznawany po hoście
// przez contextPlugin (req.db). Zwraca WYŁĄCZNIE opublikowaną zakładkę (is_public),
// tylko jej layout — bez danych wymagających autoryzacji (renderowane content-only).
export default async function publicPageRoutes(app) {
  app.get('/api/public/module-page/:slug', { preHandler: app.requireTenant }, async (req, reply) => {
    if (reply.sent) return;
    const slug = String(req.params.slug || '');
    if (!/^[a-z0-9-]{1,64}$/.test(slug)) return reply.code(404).send({ error: 'Nie znaleziono' });
    try {
      const { rows } = await req.db.query(
        `SELECT t.label AS tab_label, t.layout, m.label AS module_label, m.icon AS module_icon
           FROM app_module_tabs t
           JOIN app_modules m ON m.id = t.module_id
          WHERE t.public_slug = $1 AND t.is_public = true AND t.component_type = 'custom'
          LIMIT 1`,
        [slug]
      );
      if (!rows.length) return reply.code(404).send({ error: 'Strona nie znaleziona lub nieopublikowana' });
      const r = rows[0];
      return reply.send({
        tabLabel: r.tab_label,
        moduleLabel: r.module_label,
        moduleIcon: r.module_icon,
        layout: r.layout || { version: 1, root: [], settings: {} },
      });
    } catch (err) {
      req.log?.error?.({ err }, 'public module-page failed');
      return reply.code(500).send({ error: 'Błąd serwera' });
    }
  });
}
