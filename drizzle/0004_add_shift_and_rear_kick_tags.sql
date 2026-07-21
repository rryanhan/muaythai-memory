DO $$
DECLARE
  kicking_category_id uuid;
  shift_kick_tag_id uuid;
  rear_kick_tag_id uuid;
BEGIN
  SELECT id INTO kicking_category_id
  FROM tag_categories
  WHERE slug = 'kicking'
  LIMIT 1;

  IF kicking_category_id IS NULL THEN
    RAISE EXCEPTION 'Cannot add kick tags because the kicking category is missing';
  END IF;

  INSERT INTO tags (name, slug, category_id, kind, sort_order, active)
  SELECT 'Shift Kick', 'shift-kick', kicking_category_id, 'standard', 40, true
  WHERE NOT EXISTS (
    SELECT 1 FROM tags WHERE slug = 'shift-kick' AND user_id IS NULL
  );

  INSERT INTO tags (name, slug, category_id, kind, sort_order, active)
  SELECT 'Rear Kick', 'rear-kick', kicking_category_id, 'standard', 50, true
  WHERE NOT EXISTS (
    SELECT 1 FROM tags WHERE slug = 'rear-kick' AND user_id IS NULL
  );

  UPDATE tags
  SET name = 'Shift Kick', category_id = kicking_category_id, kind = 'standard',
      sort_order = 40, active = true, updated_at = now()
  WHERE slug = 'shift-kick' AND user_id IS NULL
  RETURNING id INTO shift_kick_tag_id;

  UPDATE tags
  SET name = 'Rear Kick', category_id = kicking_category_id, kind = 'standard',
      sort_order = 50, active = true, updated_at = now()
  WHERE slug = 'rear-kick' AND user_id IS NULL
  RETURNING id INTO rear_kick_tag_id;

  WITH drill_text AS (
    SELECT
      d.id,
      lower(concat_ws(' ', d.title, d.summary, string_agg(ds.body, ' ' ORDER BY ds.position))) AS body
    FROM drills d
    LEFT JOIN drill_steps ds ON ds.drill_id = d.id
    GROUP BY d.id, d.title, d.summary
  )
  INSERT INTO drill_tags (drill_id, tag_id)
  SELECT id, shift_kick_tag_id
  FROM drill_text
  WHERE body ~ 'shift kick|switch kick|switch step[^.]{0,40}kick|switch(ed)? (the )?feet[^.]{0,80}kick'
  ON CONFLICT (drill_id, tag_id) DO NOTHING;

  WITH drill_text AS (
    SELECT
      d.id,
      lower(concat_ws(' ', d.title, d.summary, string_agg(ds.body, ' ' ORDER BY ds.position))) AS body
    FROM drills d
    LEFT JOIN drill_steps ds ON ds.drill_id = d.id
    GROUP BY d.id, d.title, d.summary
  )
  INSERT INTO drill_tags (drill_id, tag_id)
  SELECT id, rear_kick_tag_id
  FROM drill_text
  WHERE body ~ 'rear (low |body |round |head )?kick'
  ON CONFLICT (drill_id, tag_id) DO NOTHING;
END $$;
