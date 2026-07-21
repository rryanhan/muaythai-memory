DO $$
DECLARE
  shift_kick_tag_id uuid;
BEGIN
  SELECT id INTO shift_kick_tag_id
  FROM tags
  WHERE slug = 'shift-kick' AND user_id IS NULL
  LIMIT 1;

  IF shift_kick_tag_id IS NOT NULL THEN
    WITH drill_text AS (
      SELECT
        d.id,
        lower(concat_ws(' ', d.title, d.summary, string_agg(ds.body, ' ' ORDER BY ds.position))) AS body
      FROM drills d
      LEFT JOIN drill_steps ds ON ds.drill_id = d.id
      GROUP BY d.id, d.title, d.summary
    )
    DELETE FROM drill_tags dt
    USING drill_text
    WHERE dt.tag_id = shift_kick_tag_id
      AND dt.drill_id = drill_text.id
      AND drill_text.body !~ 'shift kick|switch kick|switch step[^.]{0,40}kick|switch(ed)? (the )?feet[^.]{0,80}kick';
  END IF;
END $$;
