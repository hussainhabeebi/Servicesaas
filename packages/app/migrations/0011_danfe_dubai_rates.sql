-- Separate Dubai packages preserve Sharjah prices and historical service references.
INSERT INTO services (id, tenant_id, name, category, duration_minutes, price, description, active, recurrence_options)
SELECT 'danfe-dubai-' || id, tenant_id, name || ' — Dubai', category || '_dubai',
       duration_minutes, (duration_minutes / 60.0) * CASE category WHEN 'danfe_normal' THEN 30 ELSE 40 END,
       description, active, recurrence_options
FROM services
WHERE tenant_id = '758794a2-6df0-4150-b160-4ab5cc7ae0ee'
  AND category IN ('danfe_normal', 'danfe_materials')
  AND NOT EXISTS (SELECT 1 FROM services AS existing WHERE existing.id = 'danfe-dubai-' || services.id);
